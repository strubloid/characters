#!/usr/bin/env node
/**
 * foundry - build, validate and audit Foundry character files.
 *
 *   node tools/foundry.mjs build   [character]   write foundry-export.json
 *   node tools/foundry.mjs validate [character]   check against the schema
 *   node tools/foundry.mjs audit   [character]   compare the build to the sheet
 *
 * `character` is a folder name under characters/, or a path to a character.json.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildActor } from "./lib/export.mjs";
import { renderMarkdown } from "./lib/render.mjs";
import { computeDerived, observedAsDerived, STATISTIC_LABELS } from "./lib/rules.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const charactersDir = path.join(repoRoot, "characters");
const docsDir = path.join(repoRoot, "docs");
const schemaPath = path.join(repoRoot, "schema", "character.schema.json");

async function resolveCharacter(target) {
  if (!target) {
    const { readdir } = await import("node:fs/promises");
    const folders = (await readdir(charactersDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    if (folders.length === 0) throw new Error("No characters found under characters/.");
    if (folders.length === 1) return path.join(charactersDir, folders[0], "character.json");
    throw new Error(`Several characters available (${folders.join(", ")}). Pass one explicitly.`);
  }

  const candidates = [
    path.resolve(repoRoot, target),
    path.join(charactersDir, target),
  ];

  for (const candidate of candidates) {
    if (candidate.endsWith(".json") && existsSync(candidate)) return candidate;
    const asFolder = path.join(candidate, "character.json");
    if (existsSync(asFolder)) return asFolder;
  }

  throw new Error(`No character file found for "${target}".`);
}

async function loadCharacter(target) {
  const file = await resolveCharacter(target);
  const raw = await readFile(file, "utf8");
  return { file, data: JSON.parse(raw) };
}

/* ------------------------------------------------------------------ */
/* Minimal JSON Schema validator (no dependencies)                     */
/* ------------------------------------------------------------------ */

function resolveRef(ref, root) {
  const pathParts = ref.replace(/^#\//, "").split("/");
  let node = root;
  for (const part of pathParts) node = node?.[part];
  if (!node) throw new Error(`Cannot resolve ${ref}`);
  return node;
}

function validateNode(value, schema, root, pointer, errors) {
  if (schema.$ref) {
    validateNode(value, resolveRef(schema.$ref, root), root, pointer, errors);
    return;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual =
      value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "number" ? "number" : typeof value;
    const ok = types.some((type) => {
      if (type === "integer") return Number.isInteger(value);
      if (type === "number") return typeof value === "number";
      return type === actual;
    });
    if (!ok) {
      errors.push(`${pointer || "/"}: expected ${types.join(" or ")}, got ${actual}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${pointer || "/"}: "${value}" is not one of ${schema.enum.join(", ")}`);
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${pointer || "/"}: ${value} is below the minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${pointer || "/"}: ${value} is above the maximum ${schema.maximum}`);
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${pointer || "/"}: string is shorter than ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${pointer || "/"}: "${value}" does not match ${schema.pattern}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.items) {
      value.forEach((entry, index) => validateNode(entry, schema.items, root, `${pointer}/${index}`, errors));
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${pointer || "/"}: missing required property "${key}"`);
    }
    for (const [key, entrySchema] of Object.entries(schema.properties ?? {})) {
      if (key in value) validateNode(value[key], entrySchema, root, `${pointer}/${key}`, errors);
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const key of Object.keys(value)) {
        if (schema.properties && key in schema.properties) continue;
        validateNode(value[key], schema.additionalProperties, root, `${pointer}/${key}`, errors);
      }
    } else if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) errors.push(`${pointer || "/"}: unexpected property "${key}"`);
      }
    }
  }
}

async function runValidate(target) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const { file, data } = await loadCharacter(target);
  const errors = [];
  validateNode(data, schema, schema, "", errors);

  if (errors.length === 0) {
    console.log(`ok  ${path.relative(repoRoot, file)} matches the schema`);
    return 0;
  }
  console.error(`FAIL  ${path.relative(repoRoot, file)}`);
  for (const error of errors) console.error(`  ${error}`);
  return 1;
}

/* ------------------------------------------------------------------ */
/* build                                                              */
/* ------------------------------------------------------------------ */

async function runBuild(target) {
  const { file, data } = await loadCharacter(target);
  const actor = buildActor(data);
  const out = path.join(path.dirname(file), "foundry-export.json");
  await writeFile(out, `${JSON.stringify(actor, null, 2)}\n`, "utf8");
  console.log(`wrote ${path.relative(repoRoot, out)} (${actor.items.length} items)`);
  return 0;
}

/* ------------------------------------------------------------------ */
/* render                                                             */
/* ------------------------------------------------------------------ */

async function runRender(target) {
  const { file, data } = await loadCharacter(target);
  const slug = path.basename(path.dirname(file));
  const out = path.join(docsDir, "characters", slug, "character.md");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, renderMarkdown(data), "utf8");
  console.log(`wrote ${path.relative(repoRoot, out)}`);
  return 0;
}

async function runCheck(target) {
  const validated = await runValidate(target);
  if (validated !== 0) return validated;
  return runAudit(target);
}

/* ------------------------------------------------------------------ */
/* audit                                                              */
/* ------------------------------------------------------------------ */

function labelFor(key) {
  if (STATISTIC_LABELS[key]) return STATISTIC_LABELS[key];
  if (key.startsWith("classDC:")) return `${key.slice("classDC:".length)} class DC`;
  if (key.startsWith("skill:")) return key.slice("skill:".length);
  if (key.startsWith("attack:")) return key.slice("attack:".length);
  return key;
}

async function runAudit(target) {
  const { file, data } = await loadCharacter(target);
  const derived = computeDerived(data);
  const observed = observedAsDerived(data);

  const rows = Object.keys(observed).map((key) => {
    const expected = derived[key];
    const actual = observed[key];
    return {
      key,
      label: labelFor(key),
      expected,
      actual,
      residual: expected === undefined ? null : actual - expected,
    };
  });

  if (data.resources?.heroPoints && observed.heroPoints) {
    rows.push({
      key: "heroPoints",
      label: "Hero points",
      expected: data.resources.heroPoints.value,
      actual: observed.heroPoints.value,
      residual: data.resources.heroPoints.value - observed.heroPoints.value,
    });
  }

  console.log(`\n${data.name} - build vs sheet`);
  console.log(`source: ${data.observed?.source ?? "not recorded"}`);
  console.log("");
  console.log("statistic".padEnd(22) + "expected".padStart(10) + "sheet".padStart(9) + "residual".padStart(11));
  console.log("-".repeat(52));

  let mismatches = 0;
  for (const row of rows) {
    if (row.residual === null) {
      console.log(row.label.padEnd(22) + "n/a".padStart(10) + String(row.actual).padStart(9) + "n/a".padStart(11));
      continue;
    }
    if (row.residual !== 0) mismatches += 1;
    const flag = row.residual === 0 ? "" : `  <-- ${row.residual > 0 ? "+" : ""}${row.residual}`;
    console.log(
      row.label.padEnd(22) +
        String(row.expected).padStart(10) +
        String(row.actual).padStart(9) +
        `${row.residual > 0 ? "+" : ""}${row.residual}`.padStart(11) +
        flag,
    );
  }

  console.log("");
  if (mismatches === 0) {
    console.log("every statistic the sheet shows is reproduced by the build");
  } else {
    console.log(`${mismatches} statistic(s) are not reproduced by the build`);
  }

  const open = (data.audit?.openQuestions ?? []).filter((question) => question.status !== "resolved");
  if (open.length > 0) {
    console.log("");
    console.log("open questions");
    for (const question of open) {
      console.log(`  [${question.id}] ${question.question}`);
    }
  }

  console.log("");
  console.log(`character file: ${path.relative(repoRoot, file)}`);
  return mismatches === 0 ? 0 : 1;
}

/* ------------------------------------------------------------------ */

const [command, target] = process.argv.slice(2);

const commands = {
  build: runBuild,
  validate: runValidate,
  render: runRender,
  check: runCheck,
  audit: runAudit,
};

try {
  if (!command || !commands[command]) {
    console.error("usage: node tools/foundry.mjs <build|validate|render|check|audit> [character]");
    process.exit(2);
  }
  process.exit(await commands[command](target));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
