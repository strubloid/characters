/**
 * Pathfinder 2e rules helpers.
 *
 * Deliberately small: only the arithmetic needed to recompute a character's
 * modifiers from its build, so `npm run audit` can tell whether the build and
 * the sheet agree.
 */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

export const PROFICIENCY_BONUS = {
  untrained: 0,
  trained: 2,
  expert: 4,
  master: 6,
  legendary: 8,
};

/** Foundry stores proficiency ranks as integers. */
export const RANK_VALUE = {
  untrained: 0,
  trained: 1,
  expert: 2,
  master: 3,
  legendary: 4,
};

export const SKILL_ABILITY = {
  acrobatics: "dex",
  arcana: "int",
  athletics: "str",
  crafting: "int",
  deception: "cha",
  diplomacy: "cha",
  intimidation: "cha",
  medicine: "wis",
  nature: "int",
  occultism: "int",
  performance: "cha",
  religion: "int",
  society: "int",
  stealth: "dex",
  survival: "wis",
  thievery: "dex",
};

export function abilityMod(score) {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(rank) {
  return PROFICIENCY_BONUS[rank] ?? 0;
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Sum every declared bonus that applies to a target.
 *
 * Targets are either a group ("skills", "saves", ...) or a specific statistic
 * ("skill:acrobatics", "save:reflex"). A group bonus applies to every member of
 * that group; a specific bonus applies only to that statistic.
 *
 * A bonus with `requiresRank` is skipped when the statistic is untrained, which
 * is how a character can carry a bonus that its untrained skills do not enjoy.
 */
export function bonusFor(character, target, rank) {
  const bonuses = character.bonuses ?? [];
  let total = 0;

  for (const bonus of bonuses) {
    const applies = bonus.appliesTo ?? [];
    let matches = applies.includes(target);

    if (!matches && target.startsWith("skill:")) {
      matches = applies.includes("skills") || applies.includes(target);
    }
    if (!matches && target.startsWith("save:")) {
      matches = applies.includes("saves") || applies.includes(target);
    }
    if (!matches && target.startsWith("classDC:")) {
      matches = applies.includes("classDC") || applies.includes(target);
    }
    if (!matches) continue;

    if (bonus.requiresRank && rank === "untrained") continue;

    total += bonus.value;
  }

  return total;
}

/** Which attack proficiency a weapon falls under. */
export function attackCategoryFor(item) {
  const traits = item.traits ?? [];
  const isFirearm = traits.includes("firearm") || item.group === "firearm";
  const isCrossbow = traits.includes("crossbow") || item.group === "crossbow";
  const isMartial = traits.includes("martial") || item.category === "martial";
  const isAdvanced = traits.includes("advanced") || item.category === "advanced";

  if (isFirearm || isCrossbow) {
    if (isAdvanced) return "advanced-firearms-and-crossbows";
    return isMartial ? "martial-firearms-and-crossbows" : "simple-firearms-and-crossbows";
  }
  if (traits.includes("unarmed")) return "unarmed-attacks";
  if (isMartial) return "martial-weapons";
  return "simple-weapons";
}

function dexForArmor(character) {
  const armor = character.build.armor;
  if (!armor) return abilityMod(character.build.abilities.dex.score);
  const cap = armor.dexCap;
  const dex = abilityMod(character.build.abilities.dex.score);
  return cap === null || cap === undefined ? dex : Math.min(dex, cap);
}

/**
 * Recompute every derived modifier from the character's build.
 *
 * Returns a flat map of statistic name to number, so callers can compare it
 * against `character.observed` without knowing the shape of either.
 */
export function computeDerived(character) {
  const { build, proficiencies } = character;
  const mods = Object.fromEntries(
    ABILITIES.map((key) => [key, abilityMod(build.abilities[key].score)]),
  );

  const derived = {};

  derived.ac =
    10 +
    (build.armor?.acBonus ?? 0) +
    dexForArmor(character) +
    bonusFor(character, "ac");

  for (const save of ["fortitude", "reflex", "will"]) {
    const ability = save === "fortitude" ? "con" : save === "reflex" ? "dex" : "wis";
    const rank = proficiencies.saves?.[save];
    derived[save] =
      mods[ability] + proficiencyBonus(rank) + bonusFor(character, `save:${save}`, rank);
  }

  derived.perception =
    mods.wis +
    proficiencyBonus(proficiencies.perception) +
    bonusFor(character, "perception", proficiencies.perception);

  for (const [name, rank] of Object.entries(proficiencies.classDC ?? {})) {
    derived[`classDC:${name}`] =
      10 +
      mods[build.keyAbility] +
      proficiencyBonus(rank) +
      bonusFor(character, `classDC:${name}`, rank);
  }

  for (const [name, rank] of Object.entries(proficiencies.skills ?? {})) {
    if (name === "lore") continue;
    const ability = SKILL_ABILITY[name] ?? "dex";
    derived[`skill:${name}`] =
      mods[ability] +
      proficiencyBonus(rank) +
      bonusFor(character, `skill:${name}`, rank);
  }

  const initiativeStatistic = build.initiativeStatistic;
  const initiativeBase = initiativeStatistic
    ? initiativeStatistic === "perception"
      ? derived.perception
      : derived[`skill:${initiativeStatistic}`] ?? derived.perception
    : derived.perception + mods.dex;
  derived.initiative = initiativeBase + bonusFor(character, "initiative");

  const seen = new Map();
  for (const item of character.inventory ?? []) {
    if (item.type !== "weapon") continue;
    const category = attackCategoryFor(item);
    const rank = proficiencies.attacks?.[category];
    if (!rank) continue;
    const base = slugify(item.name);
    for (let index = 1; index <= Math.max(1, item.quantity ?? 1); index += 1) {
      const key = index === 1 ? base : `${base}-${index}`;
      seen.set(key, true);
      derived[`attack:${key}`] =
        mods.dex +
        proficiencyBonus(rank) +
        bonusFor(character, "attacks", rank);
    }
  }

  if (proficiencies.attacks?.["unarmed-attacks"]) {
    const rank = proficiencies.attacks["unarmed-attacks"];
    derived["attack:unarmed-attack"] =
      mods.dex + proficiencyBonus(rank) + bonusFor(character, "attacks", rank);
  }

  return derived;
}

/** Map observed sheet values onto the same flat shape as `computeDerived`. */
export function observedAsDerived(character) {
  const observed = character.observed ?? {};
  const flat = {};

  if (observed.ac !== undefined) flat.ac = observed.ac;
  if (observed.hitPoints !== undefined) flat.hitPoints = observed.hitPoints;
  if (observed.fortitude !== undefined) flat.fortitude = observed.fortitude;
  if (observed.reflex !== undefined) flat.reflex = observed.reflex;
  if (observed.will !== undefined) flat.will = observed.will;
  if (observed.perception !== undefined) flat.perception = observed.perception;
  if (observed.initiative !== undefined) flat.initiative = observed.initiative;

  for (const [name, value] of Object.entries(observed.classDC ?? {})) {
    flat[`classDC:${name}`] = value;
  }
  for (const [name, value] of Object.entries(observed.skills ?? {})) {
    flat[`skill:${name}`] = value;
  }
  for (const [name, value] of Object.entries(observed.attacks ?? {})) {
    flat[`attack:${name}`] = value.strike;
  }

  return flat;
}

export const STATISTIC_LABELS = {
  ac: "Armor Class",
  fortitude: "Fortitude",
  reflex: "Reflex",
  will: "Will",
  perception: "Perception",
  initiative: "Initiative",
};
