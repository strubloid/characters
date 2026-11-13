import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { buildAudit } from "../tools/lib/audit.mjs";

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

app.get("/api/images/:slug/:file", async (request, response) => {
  const file = path.join(charactersDir, request.params.slug, "images", path.basename(request.params.file));
  try {
    response.type("image/jpeg").send(await readFile(file));
  } catch (error) {
    response.status(404).json({ error: error.message });
  }
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
