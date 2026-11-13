import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { buildAudit } from "../tools/lib/audit.mjs";
import { bigpickleConfig, fetchModels, streamChatCompletion } from "./server/bigpickle.mjs";
import { agentName, askAgent, buildPrompt } from "./server/opencode.mjs";
import { convertFoundryActor } from "../tools/lib/import-foundry.mjs";
import { PATHFINDER_TOPICS } from "./server/pathfinder.mjs";
import {
  appendQuestion,
  archiveFoundryImport,
  deleteChatSession,
  getAppSetting,
  openQuestionDatabase,
  readCharacterSnapshot,
  readLatestChatSession,
  readPathfinderProgress,
  readQuestions,
  readToolRuns,
  saveChatSession,
  saveCharacterSnapshot,
  savePathfinderProgress,
  saveToolRun,
  setAppSetting,
  syncCharacterSnapshots,
} from "./server/questions.mjs";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "..");
const charactersDir = path.join(repoRoot, "characters");
const toolsDir = path.join(repoRoot, "tools");
const distDir = path.join(appDir, "dist");
const questionDb = await openQuestionDatabase(path.join(appDir, "data", "questions.sqlite"), charactersDir);
await syncCharacterSnapshots(questionDb, charactersDir);

// Minimal .env reader: the key lives on the server, never in the bundle.
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(repoRoot, ".env"));

const COMMANDS = ["validate", "audit", "render", "build", "check"];

const app = express();
app.use(express.json({ limit: "20mb" }));

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
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("Invalid character slug.");
  const snapshot = readCharacterSnapshot(questionDb, slug);
  if (snapshot) return snapshot;
  const file = path.join(charactersDir, slug, "character.json");
  return JSON.parse(await readFile(file, "utf8"));
}

async function persistCharacter(slug, character, nativeExport) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("Invalid character slug.");
  if (!character || typeof character !== "object" || Array.isArray(character)) {
    throw new Error("Character data must be a JSON object.");
  }

  const characterDir = path.join(charactersDir, slug);
  const file = path.join(characterDir, "character.json");
  const validationFile = path.join(characterDir, `.validate-${randomUUID()}.json`);
  await writeFile(validationFile, `${JSON.stringify(character, null, 2)}\n`, "utf8");
  try {
    const validation = await runTool("validate", validationFile);
    if (validation.exitCode !== 0) {
      throw new Error(validation.stderr || validation.stdout || "Character does not match the schema.");
    }

    const temporaryFile = path.join(characterDir, `.character-${randomUUID()}.json`);
    await writeFile(temporaryFile, `${JSON.stringify(character, null, 2)}\n`, "utf8");
    await rename(temporaryFile, file);
    saveCharacterSnapshot(questionDb, slug, character);
    if (nativeExport) {
      await writeFile(path.join(characterDir, "foundry-native.json"), `${JSON.stringify(nativeExport, null, 2)}\n`, "utf8");
      archiveFoundryImport(questionDb, slug, nativeExport.name ?? "Foundry actor export", nativeExport);
    }

    const [rendered, built] = await Promise.all([runTool("render", slug), runTool("build", slug)]);
    return {
      character,
      audit: buildAudit(character),
      generated: rendered.exitCode === 0 && built.exitCode === 0,
      generationOutput: `${rendered.stderr}${built.stderr}`.trim(),
      hasNativeExport: existsSync(path.join(characterDir, "foundry-native.json")),
    };
  } finally {
    await rm(validationFile, { force: true });
  }
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
    response.json({
      character,
      audit: buildAudit(character),
      hasNativeExport: existsSync(path.join(charactersDir, request.params.slug, "foundry-native.json")),
    });
  } catch (error) {
    response.status(404).json({ error: error.message });
  }
});

app.put("/api/characters/:slug", async (request, response) => {
  try {
    const result = await persistCharacter(request.params.slug, request.body?.character, null);
    response.json(result);
  } catch (error) {
    response.status(422).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/characters/:slug/import-foundry", async (request, response) => {
  try {
    const current = await loadCharacter(request.params.slug);
    let actor = request.body?.actor;
    if (!actor && request.body?.sourceFile === "personagem.json") {
      actor = JSON.parse(await readFile(path.join(repoRoot, "personagem.json"), "utf8"));
    }
    const character = convertFoundryActor(actor, {
      slug: request.params.slug,
      existingCharacter: current,
    });
    const result = await persistCharacter(request.params.slug, character, actor);
    response.json({ ...result, importedFrom: request.body?.fileName ?? request.body?.sourceFile ?? "Foundry actor export" });
  } catch (error) {
    response.status(422).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/characters/:slug/files/:kind", (request, response) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(request.params.slug)) {
    response.status(400).json({ error: "Invalid character slug." });
    return;
  }
  const fileName = request.params.kind === "foundry-export"
    ? "foundry-export.json"
    : request.params.kind === "foundry-native" ? "foundry-native.json" : null;
  if (!fileName) {
    response.status(404).json({ error: "Unknown character file." });
    return;
  }
  const file = path.join(charactersDir, request.params.slug, fileName);
  if (!existsSync(file)) {
    response.status(404).json({ error: `${fileName} has not been created yet.` });
    return;
  }
  response.download(file, fileName);
});

app.get("/api/settings/theme", (_request, response) => {
  response.json({ theme: getAppSetting(questionDb, "theme") ?? "system" });
});

app.put("/api/settings/theme", (request, response) => {
  const { theme } = request.body ?? {};
  if (!["light", "dark", "system"].includes(theme)) {
    response.status(400).json({ error: "Theme must be light, dark, or system." });
    return;
  }
  setAppSetting(questionDb, "theme", theme);
  response.json({ theme });
});

app.get("/api/pathfinder/topics", (_request, response) => {
  response.json({ topics: PATHFINDER_TOPICS });
});

app.get("/api/pathfinder/progress", (_request, response) => {
  response.json({ progress: readPathfinderProgress(questionDb) });
});

app.put("/api/pathfinder/progress/:topicId", (request, response) => {
  const { bookmarked, note } = request.body ?? {};
  if (!PATHFINDER_TOPICS.some(({ id }) => id === request.params.topicId) ||
      typeof bookmarked !== "boolean" || typeof note !== "string") {
    response.status(400).json({ error: "Provide a valid topic, bookmark state, and note." });
    return;
  }
  savePathfinderProgress(questionDb, request.params.topicId, { bookmarked, note });
  response.json({ progress: readPathfinderProgress(questionDb) });
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
  const run = await runTool(command, request.params.slug);
  saveToolRun(questionDb, run);
  response.json(run);
});

app.get("/api/characters/:slug/runs", async (request, response) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(request.params.slug)) {
    response.status(400).json({ error: "Invalid character slug." });
    return;
  }
  response.json({ runs: readToolRuns(questionDb, request.params.slug) });
});

app.get("/api/characters/:slug/questions", async (request, response) => {
  response.json({ questions: readQuestions(questionDb, request.params.slug) });
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

    const entry = appendQuestion(questionDb, slug, {
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
    const entry = appendQuestion(questionDb, slug, {
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

const CHAT_ROLES = new Set(["system", "user", "assistant"]);

async function streamOpenAi({ apiKey, model, messages, signal, onDelta }) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  const result = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!result.ok || !result.body) {
    throw new Error(`OpenAI request failed (HTTP ${result.status}).`);
  }

  const reader = result.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const payload = block.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
      if (payload && payload !== "[DONE]") {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content ?? "";
        if (delta) {
          text += delta;
          onDelta(delta, text);
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
  return text;
}

let modelsCache = { at: 0, plan: null, models: [] };
const MODELS_TTL_MS = 5 * 60 * 1000;

app.get("/api/chat/status", (_request, response) => {
  const { apiKey, model, plan, inferenceUrl } = bigpickleConfig();
  response.json({
    providers: {
      opencode: { configured: Boolean(apiKey), model, plan, baseUrl: inferenceUrl },
      openai: { configured: Boolean(process.env.OPENAI_API_KEY), model: "gpt-4.1-mini" },
    },
  });
});

app.get("/api/chat/session", (_request, response) => {
  response.json({ session: readLatestChatSession(questionDb) });
});

app.delete("/api/chat/session/:id", (request, response) => {
  deleteChatSession(questionDb, request.params.id);
  response.status(204).end();
});

app.get("/api/chat/models", async (_request, response) => {
  const { plan } = bigpickleConfig();
  try {
    if (Date.now() - modelsCache.at < MODELS_TTL_MS && modelsCache.plan === plan) {
      response.json({ plan, models: modelsCache.models });
      return;
    }
    const models = await fetchModels();
    modelsCache = { at: Date.now(), plan, models };
    response.json({ plan, models });
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/chat/openai/models", async (_request, response) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    response.json({ configured: false, models: [] });
    return;
  }
  try {
    const result = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!result.ok) throw new Error(`OpenAI model list failed (HTTP ${result.status}).`);
    const data = await result.json();
    const models = (data.data ?? [])
      .filter((entry) => /^(gpt-|o[134]-)/i.test(entry.id))
      .map((entry) => ({ id: entry.id, name: entry.id }));
    response.json({ configured: true, models });
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/chat", async (request, response) => {
  const { messages, model, provider, sessionId } = request.body ?? {};
  const history = Array.isArray(messages)
    ? messages
        .filter((entry) => entry && CHAT_ROLES.has(entry.role) && typeof entry.content === "string")
        .map((entry) => ({ role: entry.role, content: entry.content }))
    : [];

  if (history.length === 0) {
    response.status(400).json({ error: "Send at least one message." });
    return;
  }

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();

  const send = (event, data) => {
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const controller = new AbortController();
  // The request stream closes as soon as its body is read, which is well before
  // we are done. Only abort when the response itself goes away unfinished.
  response.on("close", () => {
    if (!response.writableEnded) controller.abort();
  });

  try {
    const selectedProvider = provider === "openai" ? "openai" : "opencode";
    const conversationId = typeof sessionId === "string" && /^[0-9a-f-]{36}$/i.test(sessionId)
      ? sessionId
      : randomUUID();
    const selectedModel = typeof model === "string" && model.trim()
      ? model.trim()
      : selectedProvider === "openai" ? "gpt-4.1-mini" : bigpickleConfig().model;
    send("status", { message: `Asking ${selectedProvider === "openai" ? "OpenAI" : "OpenCode Zen"}…` });

    const answer = selectedProvider === "openai"
      ? await streamOpenAi({
          apiKey: process.env.OPENAI_API_KEY,
          model: selectedModel,
          messages: history,
          signal: controller.signal,
          onDelta: (delta, text) => send("delta", { delta, text }),
        })
      : await streamChatCompletion({
          messages: history,
          model: selectedModel,
          sessionId: conversationId,
          signal: controller.signal,
          onDelta: (delta, text) => send("delta", { delta, text }),
        });

    saveChatSession(questionDb, conversationId, selectedProvider, selectedModel, [
      ...history,
      { role: "assistant", content: answer },
    ]);
    send("done", { text: answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send("error", { message });
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
