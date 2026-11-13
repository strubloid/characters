import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { buildAudit } from "../tools/lib/audit.mjs";
import { agentName, askAgent, buildPrompt } from "./server/opencode.mjs";
import { appendQuestion, readQuestions } from "./server/questions.mjs";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..");
const charactersDir = path.join(repoRoot, "characters");
const toolsDir = path.join(repoRoot, "tools");
const distDir = path.join(appDir, "dist");

const COMMANDS = ["validate", "audit", "render", "build", "check"];

const app = express();
app.use(express.json());

async function listCharacters() {
  const entries = await readdir(charactersDir, { withFileTypes: true });
  const characters = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(charactersDir, entry.name, "character.json");
    try {
      const character = JSON.parse(await readFile(file, "utf8"));
      characters.push({
        slug: entry.name,
        name: character.name,
        ancestry: character.identity?.ancestry,
        class: character.identity?.class,
        level: character.identity?.level,
      });
    } catch {
      characters.push({ slug: entry.name, name: entry.name });
    }
  }

  return characters;
}

async function loadCharacter(slug) {
  const file = path.join(charactersDir, slug, "character.json");
  return JSON.parse(await readFile(file, "utf8"));
}

function runTool(command, slug) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [path.join(toolsDir, "foundry.mjs"), command, slug], {
      cwd: repoRoot,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => {
      resolve({
        command,
        slug,
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
      });
    });
  });
}

app.get("/api/characters", async (_request, response) => {
  response.json(await listCharacters());
});

app.get("/api/characters/:slug", async (request, response) => {
  try {
    const character = await loadCharacter(request.params.slug);
    response.json({ character, audit: buildAudit(character) });
  } catch (error) {
    response.status(404).json({ error: error.message });
  }
});

app.get("/api/characters/:slug/sheet", async (request, response) => {
  const file = path.join(repoRoot, "docs", "characters", request.params.slug, "character.md");
  try {
    response.type("text/markdown").send(await readFile(file, "utf8"));
  } catch (error) {
    response.status(404).json({ error: error.message });
  }
});

app.post("/api/characters/:slug/run", async (request, response) => {
  const { command } = request.body ?? {};
  if (!COMMANDS.includes(command)) {
    response.status(400).json({ error: `Unknown command "${command}". Allowed: ${COMMANDS.join(", ")}` });
    return;
  }
  response.json(await runTool(command, request.params.slug));
});

app.get("/api/characters/:slug/questions", async (request, response) => {
  response.json({ questions: await readQuestions(charactersDir, request.params.slug) });
});

app.post("/api/characters/:slug/ask", async (request, response) => {
  const { question } = request.body ?? {};
  if (!question || typeof question !== "string" || !question.trim()) {
    response.status(400).json({ error: "Ask a question first." });
    return;
  }

  const slug = request.params.slug;
  const character = await loadCharacter(slug);
  const audit = buildAudit(character);

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();

  const send = (event, data) => {
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const askedAt = new Date().toISOString();
  const startedAt = Date.now();

  try {
    send("status", { message: `Asking ${agentName()}…` });

    const answer = await askAgent({
      prompt: buildPrompt({ character, audit, question: question.trim() }),
      cwd: repoRoot,
      onText: (text) => send("text", { text }),
      onStatus: (tool) => send("status", { message: `${agentName()} is using ${tool}…` }),
    });

    const entry = await appendQuestion(charactersDir, slug, {
      id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      question: question.trim(),
      answer,
      askedAt,
      agent: agentName(),
      status: "answered",
      durationMs: Date.now() - startedAt,
    });

    send("done", { question: entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const entry = await appendQuestion(charactersDir, slug, {
      id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      question: question.trim(),
      answer: "",
      askedAt,
      agent: agentName(),
      status: "error",
      error: message,
      durationMs: Date.now() - startedAt,
    });
    send("error", { message, question: entry });
  } finally {
    response.end();
  }
});

app.get("/api/images/:slug/:file", async (request, response) => {
  const file = path.join(charactersDir, request.params.slug, "images", path.basename(request.params.file));
  try {
    response.type("image/jpeg").send(await readFile(file));
  } catch (error) {
    response.status(404).json({ error: error.message });
  }
});

// Anything under /api that reached this point is unknown. Answer with JSON so
// the client never tries to parse the SPA shell as data.
app.use("/api", (_request, response) => {
  response.status(404).json({ error: "Unknown endpoint." });
});

const port = Number(process.env.PORT ?? 5173);
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  const { existsSync } = await import("node:fs");
  if (!existsSync(path.join(distDir, "index.html"))) {
    console.error("dist/ is missing. Run `npm run build` first.");
    process.exit(1);
  }
  app.use(express.static(distDir));
  app.get("*", (_request, response) => response.sendFile(path.join(distDir, "index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`character viewer on http://localhost:${port}`);
});
