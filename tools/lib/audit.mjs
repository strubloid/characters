/**
 * Build the build-versus-sheet comparison for a character.
 *
 * Shared by the CLI (`node tools/foundry.mjs audit`) and the viewer API so both
 * report the same thing.
 */

import { computeDerived, observedAsDerived } from "./rules.mjs";

const STATISTIC_LABELS = {
  ac: "Armor Class",
  fortitude: "Fortitude",
  reflex: "Reflex",
  will: "Will",
  perception: "Perception",
  initiative: "Initiative",
  hitPoints: "Hit points",
  heroPoints: "Hero points",
};

export function labelFor(key) {
  if (STATISTIC_LABELS[key]) return STATISTIC_LABELS[key];
  if (key.startsWith("classDC:")) return `${key.slice("classDC:".length)} class DC`;
  if (key.startsWith("skill:")) return key.slice("skill:".length);
  if (key.startsWith("attack:")) return key.slice("attack:".length);
  return key;
}

export function buildAudit(character) {
  const derived = computeDerived(character);
  const observed = observedAsDerived(character);

  const rows = Object.keys(observed).map((key) => {
    const expected = derived[key];
    const actual = observed[key];
    return {
      key,
      label: labelFor(key),
      expected: expected ?? null,
      actual,
      residual: expected === undefined ? null : actual - expected,
    };
  });

  const heroPoints = character.resources?.heroPoints;
  if (heroPoints && character.observed?.heroPoints) {
    rows.push({
      key: "heroPoints",
      label: "Hero points",
      expected: heroPoints.value,
      actual: character.observed.heroPoints.value,
      residual: heroPoints.value - character.observed.heroPoints.value,
    });
  }

  const mismatches = rows.filter((row) => row.residual !== null && row.residual !== 0);
  const openQuestions = (character.audit?.openQuestions ?? []).filter(
    (question) => question.status !== "resolved",
  );

  return {
    rows,
    mismatches,
    openQuestions,
    total: rows.length,
    checked: rows.filter((row) => row.residual !== null).length,
  };
}
