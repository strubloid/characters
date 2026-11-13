/**
 * Turn a curated character file into a Foundry actor export.
 *
 * The generated file is importable through Foundry's "Import Data" action, but
 * it is not the authoritative artifact: Foundry's own export carries the rule
 * elements, item UUIDs and boost allocation that cannot be reconstructed from
 * a screenshot. See references/foundry-roundtrip.md in the foundry-character
 * skill for how the two are reconciled.
 */

import { ABILITIES, RANK_VALUE, abilityMod, slugify } from "./rules.mjs";

const LANGUAGE_SLUGS = {
  "common (taldane)": "common",
  common: "common",
  "dwarven (duergar)": "dwarven",
  dwarven: "dwarven",
  goblin: "goblin",
  kelsh: "kelsh",
  draconic: "draconic",
  "gnomish (g gnome)": "gnomish",
  halfling: "halfling",
  orcish: "orcish",
  "sylvan (sylvan)": "sylvan",
  "tengit (tengu)": "tengit",
};

/**
 * Rule elements for the features whose published text is known with enough
 * confidence to automate. Anything not listed here ships as a plain item and
 * is flagged in the character's `features[].automated` field.
 */
const FEATURE_RULES = {
  "bouncy-goblin": [
    {
      key: "PF2E.RuleElementProficiency",
      rank: "trained",
      predicate: { in: ["acrobatics"] },
    },
    {
      key: "PF2E.RuleElementFlatModifier",
      value: 2,
      domain: "acrobatics",
      predicate: { in: ["action:tumble-through"] },
      label: "Bouncy Goblin: Tumble Through",
    },
  ],
  vandal: [
    {
      key: "PF2E.RuleElementProficiency",
      rank: "trained",
      predicate: { in: ["thievery"] },
    },
  ],
  stubborn: [
    {
      key: "PF2E.RuleElementProficiency",
      rank: "expert",
      predicate: { in: ["will"] },
      label: "Stubborn: Will save",
    },
  ],
  "slinger-s-precision": [
    {
      key: "PF2E.RuleElementFlatModifier",
      value: 2,
      domain: "damage",
      predicate: { in: ["weapon:category:crossbow", "not:weapon:traits:repeating"] },
      label: "Slinger's Precision: crossbow",
    },
    {
      key: "PF2E.RuleElementDice",
      dice: 1,
      die: "d4",
      domain: "damage",
      predicate: { in: ["weapon:category:firearm", "not:weapon:traits:repeating"] },
      label: "Slinger's Precision: firearm",
    },
  ],
  "singular-expertise": [
    {
      key: "PF2E.RuleElementFlatModifier",
      value: 1,
      domain: "damage",
      predicate: { in: ["weapon:category:firearm", "weapon:category:crossbow"] },
      label: "Singular Expertise",
    },
  ],
  "ten-paces": [
    {
      key: "PF2E.RuleElementFlatModifier",
      value: 2,
      domain: "initiative",
      label: "Ten Paces",
    },
  ],
};

function languageSlug(name) {
  const key = name.toLowerCase();
  if (LANGUAGE_SLUGS[key]) return LANGUAGE_SLUGS[key];
  const base = key.split(" (")[0];
  return LANGUAGE_SLUGS[base] ?? slugify(base);
}

function featureItem(feature, type, extra = {}) {
  const slug = slugify(feature.name);
  const rules = FEATURE_RULES[slug] ?? [];

  return {
    name: feature.name,
    type,
    img: "icons/svg/item-bag.svg",
    system: {
      description: {
        value: [feature.summary, feature.notes].filter(Boolean).join("\n\n"),
        gm: "",
      },
      slug,
      traits: { value: [] },
      publication: { title: feature.source ?? "", authors: "", license: "OGL", remaster: false },
      level: feature.level ?? 0,
      rules,
      ...extra,
    },
  };
}

function ancestryItem(character) {
  const ancestry = character.identity.ancestry;
  const heritage = character.identity.heritage;

  return {
    name: ancestry,
    type: "ancestry",
    img: "icons/svg/mystery-man.svg",
    system: {
      description: { value: "", gm: "" },
      slug: slugify(ancestry),
      traits: { value: ["goblin", "humanoid"] },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      hp: 6,
      size: "sm",
      reach: 5,
      speed: 25,
      boosts: {
        0: { value: [] },
        1: { value: ["dex", "cha"] },
        2: { value: [] },
      },
      flaws: { 0: { value: ["wis"] } },
      languages: { value: ["common", "goblin"], custom: "" },
      additionalLanguages: { count: 0, value: [], custom: "" },
      vision: "darkvision",
      items: {},
    },
  };
}

function heritageItem(character) {
  return {
    name: character.identity.heritage,
    type: "heritage",
    img: "icons/svg/mystery-man.svg",
    system: {
      description: { value: "", gm: "" },
      slug: slugify(character.identity.heritage),
      traits: { value: [] },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      items: {},
    },
  };
}

function backgroundItem(character) {
  return {
    name: character.identity.background,
    type: "background",
    img: "icons/svg/mystery-man.svg",
    system: {
      description: { value: "", gm: "" },
      slug: slugify(character.identity.background),
      traits: { value: [] },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      boosts: { 0: { value: [] }, 1: { value: [] }, 2: { value: [] } },
      trainedSkills: { value: [], lore: [] },
      items: {},
    },
  };
}

function classItem(character) {
  const { attacks = {}, defenses = {}, saves = {} } = character.proficiencies;
  const rank = (value, fallback) => RANK_VALUE[value] ?? fallback;
  const otherFirearmRank = Math.max(
    rank(attacks["simple-firearms-and-crossbows"], 0),
    rank(attacks["martial-firearms-and-crossbows"], 0),
  );
  return {
    name: character.identity.class,
    type: "class",
    img: "icons/svg/mystery-man.svg",
    system: {
      description: { value: "", gm: "" },
      slug: slugify(character.identity.class),
      traits: { value: [] },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      keyAbility: { value: [character.build.keyAbility] },
      hp: 8,
      trainedSkills: { value: [], additional: 0 },
       perception: rank(character.proficiencies.perception, 2),
       savingThrows: {
         fortitude: rank(saves.fortitude, 2),
         reflex: rank(saves.reflex, 2),
         will: rank(saves.will, 0),
       },
       attacks: {
         simple: rank(attacks["simple-weapons"], 2),
         martial: rank(attacks["martial-weapons"], 0),
         advanced: rank(attacks["advanced-firearms-and-crossbows"], 1),
         unarmed: rank(attacks["unarmed-attacks"], 1),
         other: {
           name: otherFirearmRank ? "Simple Firearms, Martial Firearms" : "",
           rank: otherFirearmRank,
         },
       },
       defenses: {
         unarmored: rank(defenses.unarmored ?? defenses["unarmored-defense"], 1),
         light: rank(defenses.light ?? defenses["light-armor"], 1),
         medium: rank(defenses.medium ?? defenses["medium-armor"], 1),
         heavy: rank(defenses.heavy ?? defenses["heavy-armor"], 0),
       },
      spellcasting: 0,
      ancestryFeatLevels: { value: [1, 5, 9, 13, 17] },
      classFeatLevels: { value: [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20] },
      generalFeatLevels: { value: [3, 7, 11, 15, 19] },
      skillFeatLevels: { value: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20] },
      skillIncreaseLevels: { value: [3, 5, 7, 9, 11, 13, 15, 17, 19] },
      items: {},
    },
  };
}

function weaponItem(item) {
  return {
    name: item.name,
    type: "weapon",
    img: "icons/svg/weapon.svg",
    system: {
      description: { value: item.notes ?? "", gm: "" },
      slug: slugify(item.name),
      traits: { value: item.traits ?? [] },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      level: item.level ?? 1,
      quantity: item.quantity ?? 1,
      bulk: { value: item.bulk ?? 0 },
      price: { value: { gp: item.price ?? 0 } },
      hp: { value: 0, max: 0 },
      hardness: 0,
      size: "med",
      material: { type: null, grade: null },
       equipped: {
         carryType: item.carryType ?? (item.equipped ? "held" : "stowed"),
         handsHeld: item.handsHeld ?? 1,
         invested: null,
       },
      containerId: null,
      identification: { status: "identified", unidentified: { name: "", img: "", data: { description: { value: "" } } }, misidentified: {} },
       category: item.category ?? ((item.traits ?? []).includes("martial") ? "martial" : "simple"),
       group: item.group ?? ((item.traits ?? []).includes("firearm") ? "firearm" : null),
      usage: { value: "held-in-one-hand" },
      bonus: { value: 0 },
      bonusDamage: { value: 0 },
      splashDamage: { value: 0 },
       range: item.range ?? null,
       reload: { value: item.reload ?? "1" },
       runes: {
         potency: item.runes?.potency ?? 0,
         striking: item.runes?.striking ?? 0,
         property: item.runes?.property ?? [],
       },
      specific: null,
      subitems: [],
      damage: {
        dice: item.damage?.dice ?? 1,
        die: item.damage?.die ?? "d6",
        damageType: item.damage?.damageType ?? "bludgeoning",
        persistent: null,
      },
      property1: { value: "", dice: 0, die: "", damageType: "", critDice: 0, critDie: "", critDamage: "", critDamageType: "" },
    },
  };
}

function armorItem(item) {
  return {
    name: item.name,
    type: "armor",
    img: "icons/svg/armor.svg",
    system: {
      description: { value: item.notes ?? "", gm: "" },
      slug: slugify(item.name),
      traits: { value: item.traits ?? [] },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      level: item.level ?? 1,
      quantity: item.quantity ?? 1,
      bulk: { value: item.bulk ?? 0 },
      price: { value: { gp: item.price ?? 0 } },
      hp: { value: 0, max: 0 },
      hardness: 0,
      size: "med",
      material: { type: null, grade: null },
       equipped: { carryType: item.carryType ?? (item.equipped ? "worn" : "stowed"), invested: null },
      containerId: null,
      identification: { status: "identified", unidentified: { name: "", img: "", data: { description: { value: "" } } }, misidentified: {} },
       category: item.category ?? "light",
      group: null,
       acBonus: item.acBonus ?? 3,
      strength: 0,
       dexCap: item.dexCap ?? 5,
       checkPenalty: item.checkPenalty ?? 0,
      speedPenalty: 0,
       runes: {
         potency: item.runes?.potency ?? 0,
         resilient: item.runes?.resilient ?? 0,
         property: item.runes?.property ?? [],
       },
      subitems: [],
    },
  };
}

function ammunitionItem(item) {
  return {
    name: item.name,
    type: "ammo",
    img: "icons/svg/ammo.svg",
    system: {
      description: { value: item.notes ?? "", gm: "" },
      slug: slugify(item.name),
      traits: { value: ["ammunition"] },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      level: item.level ?? 1,
      quantity: item.quantity ?? 1,
      bulk: { value: item.bulk ?? 0 },
      price: { value: { gp: item.price ?? 0 } },
      hp: { value: 0, max: 0 },
      hardness: 0,
      size: "med",
      material: { type: null, grade: null },
      equipped: { carryType: "worn" },
      containerId: null,
      identification: { status: "identified", unidentified: { name: "", img: "", data: { description: { value: "" } } }, misidentified: {} },
      category: "ammunition",
      stackGroup: "ammunition-dueling-pistol",
      uses: { value: 0, max: 0, autoDestroy: false },
      damage: null,
      usage: { value: "held-in-one-hand" },
      rules: [],
    },
  };
}

function equipmentItem(item) {
  return {
    name: item.name,
    type: item.type === "backpack" ? "backpack" : item.type === "consumable" ? "consumable" : "equipment",
    img: "icons/svg/item-bag.svg",
    system: {
      description: { value: item.notes ?? "", gm: "" },
      slug: slugify(item.name),
      traits: { value: item.traits ?? [] },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      level: item.level ?? 0,
      quantity: item.quantity ?? 1,
      bulk: { value: item.bulk ?? 0 },
      price: { value: { gp: item.price ?? 0 } },
      equipped: { carryType: item.equipped ? "worn" : "stowed", handsHeld: 0 },
      containerId: null,
      identification: { status: "identified", unidentified: { name: "", img: "", data: { description: { value: "" } } } },
      usage: { value: "held-in-one-hand" },
      hp: { value: 0, max: 0 },
      hardness: 0,
      material: { type: null, grade: null },
    },
  };
}

function loreItem(name, proficiency) {
  return {
    name: name.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    type: "lore",
    img: "icons/svg/book.svg",
    system: {
      description: { value: "", gm: "" },
      slug: slugify(name),
      traits: { otherTags: [] },
      publication: { title: "", authors: "", license: "OGL", remaster: false },
      mod: { value: 0 },
      proficient: { value: RANK_VALUE[proficiency] ?? 0 },
    },
  };
}

function actionItem(action, actionType) {
  const numberOfActions = action.actionCost === "two-actions" ? 2 : action.actionCost === "three-actions" ? 3 : 1;
  return {
    name: action.name,
    type: "action",
    img: "icons/svg/item-bag.svg",
    system: {
      actionType: { value: actionType },
      actions: { value: actionType === "action" ? numberOfActions : null },
      category: "offensive",
      slug: slugify(action.name),
      description: { value: [action.summary, action.notes].filter(Boolean).join("\n\n"), gm: "" },
      traits: { value: [] },
      rules: FEATURE_RULES[slugify(action.name)] ?? [],
    },
  };
}

/** Build a complete Foundry actor source from a curated character file. */
export function buildActor(character) {
  const { build, identity, proficiencies } = character;

  const abilities = Object.fromEntries(
    ABILITIES.map((key) => [
      key,
      { base: build.abilities[key].score, mod: abilityMod(build.abilities[key].score) },
    ]),
  );

  const skills = {};
  for (const [name, rank] of Object.entries(proficiencies.skills ?? {})) {
    if (name === "lore") continue;
    skills[name] = { rank: RANK_VALUE[rank] };
  }
  for (const [name, rank] of Object.entries(proficiencies.skills?.lore ?? {})) {
    skills[name] = { rank: RANK_VALUE[rank] };
  }

  const items = [
    ancestryItem(character),
    ...(identity.heritage ? [heritageItem(character)] : []),
    ...(identity.background ? [backgroundItem(character)] : []),
    classItem(character),
  ];

  if (identity.deity) {
    items.push({
      name: identity.deity,
      type: "deity",
      img: "icons/svg/mystery-man.svg",
      system: {
        description: { value: "", gm: "" },
        slug: slugify(identity.deity),
        traits: { value: [] },
        publication: { title: "", authors: "", license: "OGL", remaster: false },
        items: {},
      },
    });
  }

  for (const group of ["ancestry", "background", "class", "ancestryFeats", "classFeats", "archetypeFeats", "skillFeats", "generalFeats", "bonusFeats", "backgroundFeats"]) {
    for (const feature of character.features?.[group] ?? []) {
      // Primary character choices have their own item types and must not also
      // land in the actor as feats.
      if (group === "ancestry") {
        if (feature.name === identity.ancestry || feature.name === identity.heritage) continue;
      }
      if (group === "background" && feature.name === identity.background) continue;
      items.push(featureItem(feature, "feat"));
    }
  }

  for (const action of character.actions?.actions ?? []) items.push(actionItem(action, "action"));
  for (const action of character.actions?.reactions ?? []) items.push(actionItem(action, "reaction"));
  for (const action of character.actions?.freeActions ?? []) items.push(actionItem(action, "free"));

  for (const [name, proficiency] of Object.entries(character.proficiencies.skills?.lore ?? {})) {
    items.push(loreItem(name, proficiency));
  }

  for (const entry of character.inventory ?? []) {
    if (entry.type === "weapon") items.push(weaponItem(entry));
    else if (entry.type === "armor") items.push(armorItem(entry));
    else if (entry.type === "ammunition") items.push(ammunitionItem(entry));
    else if (["equipment", "consumable", "backpack", "treasure", "shield"].includes(entry.type)) items.push(equipmentItem(entry));
  }

  const actor = {
    id: character.id,
    type: "Actor",
    name: character.name,
    img: "icons/svg/mystery-man.svg",
    system: {
      abilities,
      attributes: {
        hp: {
          value: build.hp?.value ?? build.hp?.max ?? 0,
          temp: build.hp?.temp ?? 0,
          max: build.hp?.max ?? 0,
        },
        speed: {
          value: build.speed?.land ?? 25,
          otherSpeeds: [
            ...(build.speed?.swim ? [{ type: "swim", value: build.speed.swim }] : []),
            ...(build.speed?.climb ? [{ type: "climb", value: build.speed.climb }] : []),
            ...(build.speed?.fly ? [{ type: "fly", value: build.speed.fly }] : []),
            ...(build.speed?.burrow ? [{ type: "burrow", value: build.speed.burrow }] : []),
          ],
        },
        keyability: { value: build.keyAbility },
      },
      details: {
        level: { value: identity.level },
        xp: {
          value: identity.xp?.value ?? 0,
          min: 0,
          max: identity.xp?.max ?? 1000,
          pct: ((identity.xp?.value ?? 0) / (identity.xp?.max ?? 1000)) * 100,
        },
        languages: {
          value: (identity.languages ?? []).map(languageSlug),
          details: "",
        },
        keyability: { value: build.keyAbility },
        age: { value: identity.age ?? "" },
        height: { value: identity.height ?? "" },
        weight: { value: identity.weight ?? "" },
        gender: { value: identity.gender ?? "" },
        ethnicity: { value: identity.ethnicity ?? "" },
        nationality: { value: identity.nationality ?? "" },
        biography: {
          appearance: character.biography?.appearance ?? "",
          backstory: character.biography?.backstory ?? "",
          birthPlace: character.biography?.birthPlace ?? "",
          attitude: character.biography?.attitude ?? "",
          beliefs: character.biography?.beliefs ?? "",
          edicts: character.biography?.edicts ?? [],
          anathema: character.biography?.anathema ?? [],
          likes: character.biography?.likes ?? "",
          dislikes: character.biography?.dislikes ?? "",
          catchphrases: character.biography?.catchphrases ?? "",
          campaignNotes: character.biography?.campaignNotes ?? "",
          allies: character.biography?.allies ?? "",
          enemies: character.biography?.enemies ?? "",
          organizations: character.biography?.organizations ?? "",
          visibility: {
            appearance: true,
            backstory: false,
            personality: false,
            campaign: false,
          },
        },
      },
      initiative: { statistic: build.initiativeStatistic ?? "perception" },
      skills,
      resources: {
        heroPoints: {
          value: character.resources?.heroPoints?.value ?? 0,
          max: character.resources?.heroPoints?.max ?? 4,
        },
      },
      build: {
        attributes: {
          manual: true,
          boosts: {
            0: { value: build.boosts?.["0"] ?? [] },
            1: { value: build.boosts?.["1"] ?? [] },
            2: { value: build.boosts?.["2"] ?? [] },
            5: { value: build.boosts?.["5"] ?? [] },
            10: { value: build.boosts?.["10"] ?? [] },
            15: { value: build.boosts?.["15"] ?? [] },
            20: { value: build.boosts?.["20"] ?? [] },
          },
        },
      },
      pfs: {
        playerNumber: null,
        characterNumber: null,
        levelBump: false,
        currentFaction: "EA",
        school: null,
        reputation: { EA: null, GA: null, HH: null, VS: null, RO: null, VW: null },
      },
      exploration: [],
    },
    items,
    effects: [],
    flags: {},
    prototypeToken: {
      name: character.name,
      texture: { scaleX: 0.5, scaleY: 0.5, src: "icons/svg/mystery-man.svg" },
      bar1: { attribute: "attributes.hp" },
      bar2: { attribute: null },
      displayName: 3,
      disposition: 1,
      displayBars: 3,
      actorLink: true,
      appendNumber: false,
      lockRotation: true,
      flags: { pf2e: { linkToActorSize: true, autoscale: true } },
    },
  };

  return actor;
}
