import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

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
} from "./questions.mjs";

const temporaryDirs = [];

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "characters-questions-"));
  temporaryDirs.push(directory);
  const charactersDir = path.join(directory, "characters");
  const characterDir = path.join(charactersDir, "rafa");
  await mkdir(characterDir, { recursive: true });
  return { directory, charactersDir, characterDir };
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("question database", () => {
  it("migrates saved questions into SQLite and keeps them after reopening", async () => {
    const { directory, charactersDir, characterDir } = await setup();
    const legacyFile = path.join(characterDir, "questions.json");
    const original = {
      id: "q-old",
      question: "Why is this skill trained?",
      answer: "It comes from the class build.",
      askedAt: "2026-01-02T03:04:05.000Z",
      agent: "bigpickle",
      status: "answered",
      durationMs: 900,
    };
    await writeFile(legacyFile, JSON.stringify({ questions: [original] }));

    const database = await openQuestionDatabase(path.join(directory, "questions.sqlite"), charactersDir);
    assert.deepEqual(await readQuestions(database, "rafa"), [original]);
    await assert.rejects(readFile(legacyFile), { code: "ENOENT" });
    database.close();

    const reopened = await openQuestionDatabase(path.join(directory, "questions.sqlite"), charactersDir);
    await appendQuestion(reopened, "rafa", {
      ...original,
      id: "q-new",
      question: "What feat granted it?",
      askedAt: "2026-01-03T03:04:05.000Z",
    });
    assert.deepEqual((await readQuestions(reopened, "rafa")).map(({ id }) => id), ["q-new", "q-old"]);
    reopened.close();
  });

  it("persists edited characters, theme settings, and Pathfinder notes across restarts", async () => {
    const { directory, charactersDir } = await setup();
    const databasePath = path.join(directory, "app.sqlite");
    const database = await openQuestionDatabase(databasePath, charactersDir);
    const character = { id: "rafa", name: "Rafa", identity: { level: 6 } };

    saveCharacterSnapshot(database, "goblin", character);
    setAppSetting(database, "theme", "dark");
    savePathfinderProgress(database, "actions", { bookmarked: true, note: "Remember the three-action structure." });
    saveToolRun(database, {
      slug: "goblin", command: "build", exitCode: 0, stdout: "built", stderr: "", durationMs: 12,
      finishedAt: "2026-11-13T10:00:00.000Z",
    });
    saveChatSession(database, "chat-session", "opencode", "iceman-contributor-free", [
      { role: "user", content: "Review this build." },
      { role: "assistant", content: "The current level is five." },
    ]);
    const importedActor = { name: "Rafa", system: { level: 5 } };
    archiveFoundryImport(database, "goblin", "personagem.json", importedActor);
    archiveFoundryImport(database, "goblin", "personagem.json", importedActor);
    const importCount = database.prepare("SELECT COUNT(*) AS count FROM foundry_imports").get().count;
    assert.equal(importCount, 1);
    database.close();

    const reopened = await openQuestionDatabase(databasePath, charactersDir);
    assert.deepEqual(readCharacterSnapshot(reopened, "goblin"), character);
    assert.equal(getAppSetting(reopened, "theme"), "dark");
    assert.deepEqual(readPathfinderProgress(reopened), {
      actions: { bookmarked: true, note: "Remember the three-action structure." },
    });
    assert.equal(readToolRuns(reopened, "goblin")[0].stdout, "built");
    assert.deepEqual(readLatestChatSession(reopened), {
      id: "chat-session",
      provider: "opencode",
      model: "iceman-contributor-free",
      messages: [
        { role: "user", content: "Review this build." },
        { role: "assistant", content: "The current level is five." },
      ],
    });
    deleteChatSession(reopened, "chat-session");
    assert.equal(readLatestChatSession(reopened), null);
    reopened.close();
  });
});
