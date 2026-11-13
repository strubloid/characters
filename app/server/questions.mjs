/**
 * Per-character question log.
 *
 * Questions asked from the viewer and the answers given are stored next to the
 * character they are about, so they survive restarts and can be read in git.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE_NAME = "questions.json";

function fileFor(charactersDir, slug) {
  return path.join(charactersDir, slug, FILE_NAME);
}

export async function readQuestions(charactersDir, slug) {
  try {
    const raw = JSON.parse(await readFile(fileFor(charactersDir, slug), "utf8"));
    return Array.isArray(raw.questions) ? raw.questions : [];
  } catch {
    return [];
  }
}

export async function writeQuestions(charactersDir, slug, questions) {
  const file = fileFor(charactersDir, slug);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ questions }, null, 2)}\n`, "utf8");
}

export async function appendQuestion(charactersDir, slug, entry) {
  const questions = await readQuestions(charactersDir, slug);
  questions.push(entry);
  await writeQuestions(charactersDir, slug, questions);
  return entry;
}

export function makeQuestionId() {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
