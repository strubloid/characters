import { slugify } from "./rules.mjs";

const RANKS = ["untrained", "trained", "expert", "master", "legendary"];
const SKILLS = [
  "acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation",
  "medicine", "nature", "occultism", "performance", "religion", "society", "stealth",
  "survival", "thievery",
];

function rank(value, fallback = "untrained") {
  if (typeof value === "string" && RANKS.includes(value)) return value;
  return Number.isInteger(value) && value >= 0 && value < RANKS.length ? RANKS[value] : fallback;
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function plainText(value) {
  return asText(value)
    .replace(/<\/(p|li|h[1-6]|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function valueAt(record, ...keys) {
  let value = record;
  for (const key of keys) value = value?.[key];
  return value;
}

function numberAt(record, fallback, ...keys) {
  const value = valueAt(record, ...keys);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function foundryItemFeature(item) {
  const summary = plainText(valueAt(item, "system", "description", "value"));
  const publication = valueAt(item, "system", "publication", "title");
  return {
    name: item.name,
    ...(numberAt(item, null, "system", "level", "value") !== null
      ? { level: numberAt(item, null, "system", "level", "value") }
      : {}),
    ...(publication ? { source: publication } : {}),
    ...(summary ? { summary } : {}),
    automated: false,
  };
}

function currencyInGold(price) {
  const value = price?.value;
  if (typeof value === "number") return value;
  if (!value || typeof value !== "object") return undefined;
  return (value.pp ?? 0) * 10 + (value.gp ?? 0) + (value.sp ?? 0) / 10 + (value.cp ?? 0) / 100;
}

function resolvedAbilityScores(actor, classItem, ancestryItem, backgroundItem) {
  const direct = actor.system.abilities;
  if (direct && typeof direct === "object") {
    const scores = Object.fromEntries(Object.keys(direct).map((key) => [key, direct[key]?.base ?? direct[key]?.score]));
    if (["str", "dex", "con", "int", "wis", "cha"].every((key) => Number.isInteger(scores[key]))) return scores;
  }

  const scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  let complete = true;
  const increase = (key) => {
    if (!(key in scores)) {
      complete = false;
      return;
    }
    scores[key] += scores[key] >= 18 ? 1 : 2;
  };

  for (const item of [ancestryItem, backgroundItem]) {
    if (!item) {
      complete = false;
      continue;
    }
    for (const choices of Object.values(item.system?.boosts ?? {})) {
      const selected = choices?.selected ?? (choices?.value?.length === 1 ? choices.value[0] : null);
      if (selected) increase(selected);
      else complete = false;
    }
    for (const choices of Object.values(item.system?.flaws ?? {})) {
      const selected = choices?.selected ?? (choices?.value?.length === 1 ? choices.value[0] : null);
      if (selected && selected in scores) scores[selected] -= 2;
      else complete = false;
    }
  }

  const keyAbility = classItem?.system?.keyAbility?.selected ?? classItem?.system?.keyAbility?.value?.[0];
  if (keyAbility) increase(keyAbility);
  else complete = false;

  const levelBoosts = actor.system.build?.attributes?.boosts;
  if (!levelBoosts || typeof levelBoosts !== "object") complete = false;
  else {
    for (const choices of Object.values(levelBoosts)) {
      const selected = Array.isArray(choices) ? choices : choices?.value;
      if (!Array.isArray(selected)) {
        complete = false;
        continue;
      }
      selected.forEach(increase);
    }
  }

  return complete ? scores : null;
}

export function convertFoundryActor(actor, { slug, existingCharacter = null } = {}) {
  if (!actor || actor.type !== "character" || typeof actor.name !== "string" || !actor.system) {
    throw new Error("Choose a Pathfinder character actor export (the actor type must be character).");
  }
  if (!Array.isArray(actor.items)) throw new Error("The Foundry export has no item list.");

  const targetSlug = slugify(slug || actor.name.normalize("NFD").replace(/\p{Diacritic}/gu, ""));
  if (!targetSlug) throw new Error("The exported actor name cannot be used to create a character folder.");

  const items = actor.items;
  const byType = (type) => items.filter((item) => item.type === type);
  const classItem = byType("class")[0];
  const ancestryItem = byType("ancestry")[0];
  const heritageItem = byType("heritage")[0];
  const backgroundItem = byType("background")[0];
  const deityItem = byType("deity")[0];
  const importedFeats = byType("feat");
  const old = existingCharacter;

  const features = {
    ancestry: [
      ...byType("ancestry"),
      ...byType("heritage"),
    ].map(foundryItemFeature),
    background: byType("background").map(foundryItemFeature),
    class: [],
    ancestryFeats: [],
    classFeats: [],
    archetypeFeats: [],
    skillFeats: [],
    generalFeats: [],
    bonusFeats: [],
    backgroundFeats: [],
  };

  for (const item of importedFeats) {
    const category = item.system?.category;
    const traits = item.system?.traits?.value ?? [];
    const feature = foundryItemFeature(item);
    if (traits.includes("archetype") || traits.includes("dedication") || category === "archetype") {
      features.archetypeFeats.push(feature);
    } else if (category === "ancestry") {
      features.ancestryFeats.push(feature);
    } else if (category === "background") {
      features.backgroundFeats.push(feature);
    } else if (category === "skill") {
      features.skillFeats.push(feature);
    } else if (category === "general") {
      features.generalFeats.push(feature);
    } else if (traits.includes("rogue")) {
      features.archetypeFeats.push(feature);
    } else if (category === "classfeature") {
      features.class.push(feature);
    } else if (category === "class") {
      features.classFeats.push(feature);
    } else {
      features.bonusFeats.push(feature);
    }
  }

  const buildAbilities = { ...(old?.build?.abilities ?? {}) };
  const resolvedScores = resolvedAbilityScores(actor, classItem, ancestryItem, backgroundItem);
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    const imported = actor.system.abilities?.[key];
    const score = resolvedScores?.[key] ?? imported?.base ?? imported?.score ?? buildAbilities[key]?.score ?? 10;
    buildAbilities[key] = { ...buildAbilities[key], score };
  }

  const classSaves = classItem?.system?.savingThrows ?? {};
  const importedBoosts = actor.system.build?.attributes?.boosts;
  const boosts = importedBoosts
    ? Object.fromEntries(Object.entries(importedBoosts).map(([level, entries]) => [
        level,
        Array.isArray(entries) ? entries : entries?.value ?? [],
      ]))
    : old?.build?.boosts;
  const ranks = {
    saves: { ...(old?.proficiencies?.saves ?? {}) },
    perception: rank(classItem?.system?.perception, old?.proficiencies?.perception),
    classDC: { ...(old?.proficiencies?.classDC ?? {}) },
    skills: { ...(old?.proficiencies?.skills ?? {}) },
    attacks: { ...(old?.proficiencies?.attacks ?? {}) },
    defenses: { ...(old?.proficiencies?.defenses ?? {}) },
  };
  for (const save of ["fortitude", "reflex", "will"]) {
    ranks.saves[save] ??= rank(classSaves[save]);
  }

  for (const skill of SKILLS) {
    if (actor.system.skills?.[skill]) ranks.skills[skill] = rank(actor.system.skills[skill].rank);
    else if (!old?.proficiencies?.skills?.[skill]) ranks.skills[skill] = "untrained";
  }
  if (byType("lore").length > 0) ranks.skills.lore = {};
  for (const lore of byType("lore")) {
    const key = lore.system?.slug || slugify(lore.name);
    ranks.skills.lore = { ...(ranks.skills.lore ?? {}), [key]: rank(lore.system?.proficient?.value, "trained") };
  }

  const attacks = classItem?.system?.attacks;
  if (attacks && !old?.proficiencies?.attacks) {
    for (const kind of ["simple", "martial", "advanced", "unarmed"]) {
      if (attacks[kind] !== undefined) {
        const key = kind === "unarmed" ? "unarmed-attacks" : `${kind}-weapons`;
        ranks.attacks[key] = rank(attacks[kind]);
      }
    }
    if (attacks.other?.name) {
      const otherName = attacks.other.name.toLowerCase();
      if (otherName.includes("simple")) ranks.attacks["simple-firearms-and-crossbows"] = rank(attacks.other.rank);
      if (otherName.includes("martial")) ranks.attacks["martial-firearms-and-crossbows"] = rank(attacks.other.rank);
    }
  }
  const defenses = classItem?.system?.defenses;
  if (defenses && !old?.proficiencies?.defenses) {
    for (const kind of ["unarmored", "light", "medium", "heavy"]) {
      if (defenses[kind] !== undefined) ranks.defenses[kind] = rank(defenses[kind]);
    }
  }

  for (const item of items) {
    const proficiencies = item.system?.subfeatures?.proficiencies ?? {};
    for (const [save, proficiency] of Object.entries(proficiencies)) {
      if (["fortitude", "reflex", "will"].includes(save)) ranks.saves[save] = rank(proficiency.rank, ranks.saves[save]);
      if (["simple", "martial", "unarmed"].includes(save)) {
        const key = save === "unarmed" ? "unarmed-attacks" : `${save}-weapons`;
        ranks.attacks[key] = rank(proficiency.rank, ranks.attacks[key]);
      }
    }
    for (const rule of item.system?.rules ?? []) {
      const path = /^system\.proficiencies\.attacks\.([^.]+)\.rank$/.exec(rule.path ?? "")?.[1];
      if (rule.key !== "ActiveEffectLike" || !path || typeof rule.value !== "number") continue;
      const key = path
        .replace("simple-firearms-crossbows", "simple-firearms-and-crossbows")
        .replace("martial-firearms-crossbows", "martial-firearms-and-crossbows");
      ranks.attacks[key] = rank(rule.value, ranks.attacks[key]);
    }
  }

  const importedClassName = classItem?.name ?? old?.identity?.class ?? "Unknown class";
  const classDcKey = slugify(importedClassName);
  ranks.classDC[classDcKey] = rank(valueAt(actor, "system", "proficiencies", "classDC", classDcKey), old?.proficiencies?.classDC?.[classDcKey] ?? "trained");
  const dedication = importedFeats.find((item) =>
    item.system?.traits?.value?.includes("dedication") || item.system?.category === "archetype",
  );

  const inventory = items
    .filter((item) => ["weapon", "armor", "ammo", "equipment", "consumable", "backpack", "treasure", "shield"].includes(item.type))
    .map((item) => {
      const system = item.system ?? {};
      const carryType = system.equipped?.carryType;
      const damage = system.damage;
      const notes = plainText(system.description?.value);
      return {
        ...(typeof item._id === "string" ? { id: item._id } : {}),
        name: item.name,
        type: item.type === "ammo" ? "ammunition" : item.type,
        quantity: numberAt(system, 1, "quantity"),
        bulk: numberAt(system, 0, "bulk", "value"),
        equipped: Boolean(carryType && !["stowed", "dropped"].includes(carryType)),
        level: numberAt(system, 0, "level", "value"),
        ...(currencyInGold(system.price) !== undefined ? { price: currencyInGold(system.price) } : {}),
        traits: system.traits?.value ?? [],
        ...(system.category ? { category: system.category } : {}),
        ...(typeof system.acBonus === "number" ? { acBonus: system.acBonus } : {}),
        ...(typeof system.dexCap === "number" || system.dexCap === null ? { dexCap: system.dexCap } : {}),
        ...(typeof system.checkPenalty === "number" ? { checkPenalty: system.checkPenalty } : {}),
        ...(system.group ? { group: system.group } : {}),
        ...(typeof system.range === "number" ? { range: system.range } : {}),
        ...(system.reload?.value ? { reload: String(system.reload.value) } : {}),
        ...(system.baseItem ? { baseItem: system.baseItem } : {}),
        ...(carryType ? { carryType } : {}),
        ...(typeof system.equipped?.handsHeld === "number" ? { handsHeld: system.equipped.handsHeld } : {}),
        ...(system.runes ? { runes: {
          potency: system.runes.potency ?? 0,
          striking: system.runes.striking ?? 0,
          resilient: system.runes.resilient ?? 0,
          property: system.runes.property ?? [],
        } } : {}),
        ...(damage ? { damage: { dice: damage.dice ?? 1, die: damage.die ?? "d6", damageType: damage.damageType ?? "untyped" } } : {}),
        ...(notes ? { notes } : {}),
      };
    });

  const actions = { actions: [], reactions: [], freeActions: [] };
  for (const item of byType("action")) {
    const actionType = item.system?.actionType?.value;
    const section = actionType === "reaction" ? "reactions" : actionType === "free" ? "freeActions" : "actions";
    const actionCount = item.system?.actions?.value;
    actions[section].push({
      name: item.name,
      ...(typeof actionCount === "number" ? { actionCost: actionCount === 1 ? "one-action" : `${actionCount}-actions` } : {}),
      ...(item.system?.publication?.title ? { source: item.system.publication.title } : {}),
      ...(plainText(item.system?.description?.value) ? { summary: plainText(item.system.description.value) } : {}),
      automated: false,
    });
  }

  const details = actor.system.details ?? {};
  const oldIdentity = old?.identity ?? {};
  const heroPoints = actor.system.resources?.heroPoints;
  const importedHp = actor.system.attributes?.hp ?? {};
  const equippedArmor = inventory.find((item) => item.type === "armor" && item.equipped);
  const ancestrySystem = ancestryItem?.system;
  const remaster = items.some((item) => item.system?.publication?.remaster === true);
  const audit = old?.audit
    ? structuredClone(old.audit)
    : { openQuestions: [], notes: "Review imported build values against the exported Foundry actor." };
  if (boosts && old?.audit?.openQuestions) {
    const allocationQuestion = audit.openQuestions.find(({ id }) => id === "attribute-boost-allocation");
    if (allocationQuestion) {
      allocationQuestion.question = "Which base ability scores and ancestry/background boosts were selected before the recorded level boosts?";
      allocationQuestion.why = "The Foundry export preserves the level 1 and level 5 boost choices, but its resolved ability scores are null. Keep this open until those underlying choices can be confirmed.";
      if (resolvedScores) {
        allocationQuestion.status = "resolved";
        allocationQuestion.answer = `The native export's ancestry, background, class, and level boost selections resolve to Str ${resolvedScores.str}, Dex ${resolvedScores.dex}, Con ${resolvedScores.con}, Int ${resolvedScores.int}, Wis ${resolvedScores.wis}, Cha ${resolvedScores.cha}.`;
      }
    }
  }
  if (actor.system.initiative?.statistic) {
    const initiativeQuestion = audit.openQuestions.find(({ id }) => id === "initiative-minus-2");
    if (initiativeQuestion) {
      initiativeQuestion.status = "resolved";
      initiativeQuestion.answer = `Foundry records ${actor.system.initiative.statistic} as the initiative statistic; the imported build now uses that statistic.`;
    }
  }
  const armorQuestion = audit.openQuestions.find(({ id }) => id === "armor-magic");
  if (armorQuestion && equippedArmor) {
    armorQuestion.question = `Why does the recorded Armor Class ${old?.observed?.ac ?? ""} differ from the imported equipped ${equippedArmor.name} (+${equippedArmor.acBonus ?? 0})?`;
    armorQuestion.why = "The Foundry export identifies the current equipped armor and its base AC bonus, but does not contain a resolved Armor Class. Compare its runes and other active modifiers with the sheet before closing this out.";
  }
  const dexterityQuestion = audit.openQuestions.find(({ id }) => id === "dexterity-skills-minus-2");
  if (dexterityQuestion && actor.system.skills?.stealth && actor.system.skills?.thievery) {
    dexterityQuestion.question = "Why do the recorded Stealth and Thievery sheet values differ from the imported expert ranks?";
    dexterityQuestion.why = "The native export records both ranks as expert, while the older sheet screenshots show values two points lower. Rescan the current sheet to distinguish an unrecorded penalty from stale observed values.";
  }
  const bonuses = (old?.bonuses ?? []).filter((bonus) =>
    !(actor.system.initiative?.statistic && bonus.id === "unattributed-initiative-minus-2"),
  );
  for (const item of items) {
    const initiativeRule = item.system?.rules?.find((rule) =>
      rule.selector === "initiative" && typeof rule.value === "number" && rule.value !== 0,
    );
    if (!initiativeRule) continue;
    const questionId = `${slugify(item.name)}-initiative-toggle`;
    if (!audit.openQuestions.some(({ id }) => id === questionId)) {
      audit.openQuestions.push({
        id: questionId,
        question: `Is ${item.name}'s +${initiativeRule.value} initiative option active on this character?`,
        why: "The native export records this modifier behind a toggleable roll option. The editor preserves the full native export, but the curated build does not assume a conditional bonus is always enabled.",
        status: "open",
      });
    }
  }

  return {
    ...(old ?? {}),
    $schema: old?.$schema ?? "../../schema/character.schema.json",
    formatVersion: old?.formatVersion ?? "1.0.0",
    id: old?.id ?? targetSlug,
    name: actor.name,
    kind: "player-character",
    system: {
      ...(old?.system ?? {}),
      id: actor._stats?.systemId ?? old?.system?.id ?? "pf2e",
      ruleset: remaster ? "remaster" : old?.system?.ruleset ?? "legacy",
      ...(actor._stats?.coreVersion ? { foundryVersion: actor._stats.coreVersion } : {}),
      ...(actor._stats?.systemVersion ? { systemVersion: actor._stats.systemVersion } : {}),
    },
    player: old?.player ?? "",
    summary: old?.summary ?? "Imported from a Foundry VTT actor export.",
    art: {
      ...(old?.art ?? {}),
      portrait: actor.img ?? old?.art?.portrait ?? null,
      token: actor.prototypeToken?.texture?.src ?? old?.art?.token ?? null,
    },
    identity: {
      ...oldIdentity,
      ancestry: ancestryItem?.name ?? oldIdentity.ancestry ?? "Unknown ancestry",
      heritage: heritageItem?.name ?? oldIdentity.heritage ?? null,
      background: backgroundItem?.name ?? oldIdentity.background ?? null,
      class: importedClassName,
      archetype: dedication ? { name: dedication.name, level: numberAt(dedication.system, 1, "level", "value") } : oldIdentity.archetype ?? null,
      deity: deityItem?.name ?? oldIdentity.deity ?? null,
      level: numberAt(details, oldIdentity.level ?? 1, "level", "value"),
      xp: {
        value: numberAt(details, oldIdentity.xp?.value ?? 0, "xp", "value"),
        max: numberAt(details, oldIdentity.xp?.max ?? 1000, "xp", "max"),
      },
      age: asText(valueAt(details, "age", "value")) || oldIdentity.age || "",
      gender: asText(valueAt(details, "gender", "value")) || oldIdentity.gender || "",
      ethnicity: asText(valueAt(details, "ethnicity", "value")) || oldIdentity.ethnicity || "",
      nationality: asText(valueAt(details, "nationality", "value")) || oldIdentity.nationality || "",
      height: asText(valueAt(details, "height", "value")) || oldIdentity.height || "",
      weight: asText(valueAt(details, "weight", "value")) || oldIdentity.weight || "",
      languages: (details.languages?.value ?? oldIdentity.languages ?? []).map((language) =>
        language.replace(/(^|[- ])\w/g, (letter) => letter.toUpperCase()),
      ),
    },
    build: {
      ...(old?.build ?? {}),
      keyAbility: classItem?.system?.keyAbility?.selected ?? details.keyability?.value ?? old?.build?.keyAbility ?? "str",
      ...(actor.system.initiative?.statistic ? { initiativeStatistic: actor.system.initiative.statistic } : {}),
      ...(boosts ? { boosts } : {}),
      abilities: buildAbilities,
      hp: {
        ...(old?.build?.hp ?? {}),
        max: numberAt(importedHp, old?.build?.hp?.max ?? importedHp.value ?? 0, "max"),
        value: numberAt(importedHp, old?.build?.hp?.value ?? 0, "value"),
        temp: numberAt(importedHp, old?.build?.hp?.temp ?? 0, "temp"),
      },
      ...(equippedArmor ? {
        armor: {
          category: equippedArmor.type === "armor" ? items.find((item) => item.type === "armor" && item.system?.equipped?.carryType === "worn")?.system?.category : old?.build?.armor?.category,
          acBonus: items.find((item) => item.type === "armor" && item.system?.equipped?.carryType === "worn")?.system?.acBonus ?? old?.build?.armor?.acBonus,
          dexCap: items.find((item) => item.type === "armor" && item.system?.equipped?.carryType === "worn")?.system?.dexCap ?? old?.build?.armor?.dexCap,
          checkPenalty: items.find((item) => item.type === "armor" && item.system?.equipped?.carryType === "worn")?.system?.checkPenalty ?? old?.build?.armor?.checkPenalty,
        },
      } : {}),
      ...(ancestrySystem?.vision ? { senses: [{ name: ancestrySystem.vision }] } : {}),
      ...(old?.build?.speed ? { speed: old.build.speed } : {}),
    },
    proficiencies: ranks,
    bonuses,
    resources: {
      ...(old?.resources ?? {}),
      ...(heroPoints ? { heroPoints: { value: heroPoints.value ?? 0, max: heroPoints.max ?? 3 } } : {}),
    },
    features,
    actions,
    inventory,
    biography: {
      ...(old?.biography ?? {}),
      ...Object.fromEntries(["appearance", "backstory", "birthPlace", "attitude", "beliefs", "likes", "dislikes", "catchphrases", "campaignNotes", "allies", "enemies", "organizations"].map((key) => [
        key,
        asText(details.biography?.[key]) || old?.biography?.[key] || "",
      ])),
      edicts: details.biography?.edicts ?? old?.biography?.edicts ?? [],
      anathema: details.biography?.anathema ?? old?.biography?.anathema ?? [],
    },
    observed: old?.observed ?? {
      source: "Foundry actor export; values not included in the exported actor remain unobserved.",
      hitPoints: importedHp.value,
      tempHitPoints: importedHp.temp,
      notes: "Ability scores and derived sheet statistics were not present as resolved values in the Foundry export. See foundry-native.json for the full source export.",
    },
    audit,
  };
}
