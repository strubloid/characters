/**
 * Ask an opencode agent a question about a character.
 *
 * The agent runs as a child process with the repository as its working
 * directory, so it can read the character files the same way an interactive
 * opencode session would. Its JSON event stream is parsed here and forwarded to
 * the caller as server sent events.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_AGENT = "bigpickle";
const DEFAULT_TIMEOUT_MS = 300_000;

export function agentName() {
  return process.env.OPENCODE_AGENT ?? DEFAULT_AGENT;
}

function resolveBinary() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  const installed = path.join(homedir(), ".opencode", "bin", "opencode");
  if (existsSync(installed)) return installed;
  return "opencode";
}

export function buildPrompt({ character, audit, question }) {
  const openQuestions = (audit?.openQuestions ?? [])
    .map((entry) => `- [${entry.id}] ${entry.question}`)
    .join("\n");

  const mismatch = audit?.mismatches?.length ?? 0;

  return [
    `Character: ${character.name} (${character.identity.ancestry} ${character.identity.class} level ${character.identity.level})`,
    "",
    `Repository files for this character:`,
    `  characters/${character.id}/character.json  (source of truth)`,
    `  docs/characters/${character.id}/character.md  (generated readable sheet)`,
    "",
    `Audit: ${audit?.checked ?? 0} of ${audit?.total ?? 0} sheet statistics are reproduced by the build, ${mismatch} mismatch(es).`,
    openQuestions ? `Open questions:\n${openQuestions}` : "Open questions: none.",
    "",
    "character.json:",
    JSON.stringify(character, null, 2),
    "",
    "Question from the user:",
    question,
  ].join("\n");
}

/**
 * Run the agent and report progress.
 *
 * `onText` receives the full answer so far, `onStatus` receives a short note
 * about what the agent is doing, and the promise resolves with the final text.
 */
export function askAgent({ prompt, cwd, onText, onStatus, agent = agentName() }) {
  return new Promise((resolve, reject) => {
    const binary = resolveBinary();
    const child = spawn(
      binary,
      ["run", "--agent", agent, "--format", "json", prompt],
      { cwd, env: process.env, stdin: "ignore" },
    );

    const parts = new Map();
    let answer = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      if (!settled) {
        settled = true;
        reject(new Error(`The agent did not finish within ${DEFAULT_TIMEOUT_MS / 1000} seconds.`));
      }
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === "text" && event.part?.text) {
          parts.set(event.part.id, event.part.text);
          answer = [...parts.values()].join("\n\n");
          onText?.(answer);
        } else if (event.type === "tool" || event.type === "tool_start") {
          const state = event.part?.state?.status;
          if (state === "running") {
            onStatus?.(event.part?.tool ?? "working");
          }
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(
        error.code === "ENOENT"
          ? new Error(`Could not find the opencode binary (${binary}). Set OPENCODE_BIN to its path.`)
          : error,
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0 && !answer) {
        reject(new Error(stderr.trim() || `The agent exited with code ${code}.`));
        return;
      }
      resolve(answer);
    });
  });
}
