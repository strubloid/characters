import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

export async function openQuestionDatabase(databasePath, charactersDir) {
  await mkdir(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      character_slug TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL DEFAULT '',
      asked_at TEXT NOT NULL,
      agent TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS questions_character_asked
      ON questions(character_slug, asked_at DESC);
    CREATE TABLE IF NOT EXISTS character_documents (
      slug TEXT PRIMARY KEY,
      document_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_mtime REAL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pathfinder_progress (
      topic_id TEXT PRIMARY KEY,
      bookmarked INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS foundry_imports (
      id TEXT PRIMARY KEY,
      character_slug TEXT NOT NULL,
      source_name TEXT NOT NULL,
      actor_json TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );
    DELETE FROM foundry_imports
    WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM foundry_imports
      GROUP BY character_slug, source_name, actor_json
    );
    CREATE UNIQUE INDEX IF NOT EXISTS foundry_imports_unique_source
      ON foundry_imports(character_slug, source_name, actor_json);
    CREATE TABLE IF NOT EXISTS tool_runs (
      id TEXT PRIMARY KEY,
      character_slug TEXT NOT NULL,
      command TEXT NOT NULL,
      exit_code INTEGER NOT NULL,
      stdout TEXT NOT NULL,
      stderr TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      finished_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tool_runs_character_finished
      ON tool_runs(character_slug, finished_at DESC);
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_messages_session ON chat_messages(session_id, id);
  `);
  database.pragma("foreign_keys = ON");

  const entriesToMigrate = [];
  const filesToRemove = [];
  for (const character of await readdir(charactersDir, { withFileTypes: true })) {
    if (!character.isDirectory()) continue;
    const file = path.join(charactersDir, character.name, "questions.json");
    try {
      const legacy = JSON.parse(await readFile(file, "utf8"));
      if (!Array.isArray(legacy.questions)) continue;
      for (const entry of legacy.questions) {
        if (!entry || typeof entry.id !== "string" || typeof entry.question !== "string") continue;
        entriesToMigrate.push({ ...entry, slug: character.name });
      }
      filesToRemove.push(file);
    } catch {
      continue;
    }
  }

  const insert = database.prepare(`
    INSERT OR IGNORE INTO questions
      (id, character_slug, question, answer, asked_at, agent, status, error, duration_ms)
    VALUES
      (@id, @slug, @question, @answer, @askedAt, @agent, @status, @error, @durationMs)
  `);
  database.transaction((entries) => {
    for (const entry of entries) {
      insert.run({
        id: entry.id,
        slug: entry.slug,
        question: entry.question,
        answer: entry.answer ?? "",
        askedAt: entry.askedAt ?? new Date().toISOString(),
        agent: entry.agent ?? "unknown",
        status: entry.status ?? "answered",
        error: entry.error ?? null,
        durationMs: entry.durationMs ?? 0,
      });
    }
  })(entriesToMigrate);

  await Promise.all(filesToRemove.map((file) => rm(file, { force: true })));
  return database;
}

export async function syncCharacterSnapshots(database, charactersDir) {
  const entries = await readdir(charactersDir, { withFileTypes: true });
  const upsert = database.prepare(`
    INSERT INTO character_documents (slug, document_json, updated_at, source_mtime)
    VALUES (@slug, @documentJson, @updatedAt, @sourceMtime)
    ON CONFLICT(slug) DO UPDATE SET
      document_json = excluded.document_json,
      updated_at = excluded.updated_at,
      source_mtime = excluded.source_mtime
    WHERE character_documents.source_mtime IS NULL
      OR excluded.source_mtime > character_documents.source_mtime
  `);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(charactersDir, entry.name, "character.json");
    try {
      const [raw, fileStat] = await Promise.all([readFile(file, "utf8"), stat(file)]);
      upsert.run({
        slug: entry.name,
        documentJson: raw,
        updatedAt: new Date(fileStat.mtimeMs).toISOString(),
        sourceMtime: fileStat.mtimeMs,
      });
    } catch {
      continue;
    }
  }
}

export function readCharacterSnapshot(database, slug) {
  const row = database.prepare("SELECT document_json FROM character_documents WHERE slug = ?").get(slug);
  return row ? JSON.parse(row.document_json) : null;
}

export function saveCharacterSnapshot(database, slug, character) {
  database.prepare(`
    INSERT INTO character_documents (slug, document_json, updated_at, source_mtime)
    VALUES (?, ?, ?, NULL)
    ON CONFLICT(slug) DO UPDATE SET
      document_json = excluded.document_json,
      updated_at = excluded.updated_at,
      source_mtime = NULL
  `).run(slug, JSON.stringify(character), new Date().toISOString());
}

export function getAppSetting(database, key) {
  return database.prepare("SELECT setting_value FROM app_settings WHERE setting_key = ?").get(key)?.setting_value ?? null;
}

export function setAppSetting(database, key, value) {
  database.prepare(`
    INSERT INTO app_settings (setting_key, setting_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString());
}

export function readPathfinderProgress(database) {
  const rows = database.prepare("SELECT topic_id, bookmarked, note FROM pathfinder_progress").all();
  return Object.fromEntries(rows.map((row) => [row.topic_id, {
    bookmarked: Boolean(row.bookmarked),
    note: row.note,
  }]));
}

export function savePathfinderProgress(database, topicId, { bookmarked, note }) {
  database.prepare(`
    INSERT INTO pathfinder_progress (topic_id, bookmarked, note, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(topic_id) DO UPDATE SET
      bookmarked = excluded.bookmarked,
      note = excluded.note,
      updated_at = excluded.updated_at
  `).run(topicId, bookmarked ? 1 : 0, note, new Date().toISOString());
}

export function archiveFoundryImport(database, slug, sourceName, actor) {
  const id = randomUUID();
  database.prepare(`
    INSERT OR IGNORE INTO foundry_imports (id, character_slug, source_name, actor_json, imported_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, slug, sourceName, JSON.stringify(actor), new Date().toISOString());
  return database.prepare(`
    SELECT id FROM foundry_imports
    WHERE character_slug = ? AND source_name = ? AND actor_json = ?
  `).get(slug, sourceName, JSON.stringify(actor)).id;
}

export function saveToolRun(database, run) {
  database.prepare(`
    INSERT INTO tool_runs (id, character_slug, command, exit_code, stdout, stderr, duration_ms, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), run.slug, run.command, run.exitCode, run.stdout, run.stderr, run.durationMs, run.finishedAt);
}

export function readToolRuns(database, slug) {
  return database.prepare(`
    SELECT command, character_slug AS slug, exit_code AS exitCode, stdout, stderr,
      duration_ms AS durationMs, finished_at AS finishedAt
    FROM tool_runs
    WHERE character_slug = ?
    ORDER BY finished_at DESC
    LIMIT 50
  `).all(slug);
}

export function saveChatSession(database, id, provider, model, messages) {
  const timestamp = new Date().toISOString();
  const upsert = database.prepare(`
    INSERT INTO chat_sessions (id, provider, model, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      model = excluded.model,
      updated_at = excluded.updated_at
  `);
  const clear = database.prepare("DELETE FROM chat_messages WHERE session_id = ?");
  const insert = database.prepare("INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)");
  database.transaction(() => {
    upsert.run(id, provider, model, timestamp);
    clear.run(id);
    for (const message of messages) insert.run(id, message.role, message.content, timestamp);
  })();
}

export function readLatestChatSession(database) {
  const session = database.prepare("SELECT id, provider, model FROM chat_sessions ORDER BY updated_at DESC LIMIT 1").get();
  if (!session) return null;
  const messages = database.prepare("SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id").all(session.id);
  return { ...session, messages };
}

export function deleteChatSession(database, id) {
  database.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);
}

export function readQuestions(database, slug) {
  return database.prepare(`
    SELECT id, question, answer, asked_at AS askedAt, agent, status, error,
      duration_ms AS durationMs
    FROM questions
    WHERE character_slug = ?
    ORDER BY asked_at DESC, rowid DESC
  `).all(slug).map(({ error, ...entry }) => error ? { ...entry, error } : entry);
}

export function appendQuestion(database, slug, entry) {
  database.prepare(`
    INSERT INTO questions
      (id, character_slug, question, answer, asked_at, agent, status, error, duration_ms)
    VALUES
      (@id, @slug, @question, @answer, @askedAt, @agent, @status, @error, @durationMs)
  `).run({
    id: entry.id,
    slug,
    question: entry.question,
    answer: entry.answer ?? "",
    askedAt: entry.askedAt,
    agent: entry.agent,
    status: entry.status,
    error: entry.error ?? null,
    durationMs: entry.durationMs,
  });
  return entry;
}

export function makeQuestionId() {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
