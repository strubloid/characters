import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { convertFoundryActor } from "../../tools/lib/import-foundry.mjs";
import { buildActor } from "../../tools/lib/export.mjs";
import { buildAudit } from "../../tools/lib/audit.mjs";

describe("Foundry character import", () => {
  it("merges the supplied Foundry export without losing curated scores and imports current feats, gear, and actions", async () => {
    const actor = {
      name: "Zé Cangapé",
      type: "character",
      _stats: { systemId: "pf2e", coreVersion: "14.369", systemVersion: "8.6.1" },
      system: {
        attributes: { hp: { value: 60, temp: 0 } },
        initiative: { statistic: "stealth" },
        details: {
          level: { value: 5 },
          age: { value: "15" },
          gender: { value: "Ele" },
          nationality: { value: "Nex" },
          languages: { value: ["dwarven", "kelish"] },
          keyability: { value: "str" },
          xp: { value: 120, max: 1000 },
        },
        resources: { heroPoints: { value: 1, max: 3 } },
        skills: { thievery: { rank: 2 }, stealth: { rank: 2 }, acrobatics: { rank: 1 } },
        build: { attributes: { boosts: { 1: ["dex", "cha", "con", "int"], 5: ["cha", "wis", "con", "dex"] } } },
      },
      items: [
        { name: "Gunslinger", type: "class", system: { keyAbility: { selected: "dex" }, savingThrows: { fortitude: 2, reflex: 2, will: 1 }, perception: 2, attacks: { simple: 1, martial: 1, advanced: 0, unarmed: 1 } } },
        { name: "Goblin", type: "ancestry", system: { traits: { value: ["goblin", "humanoid"] }, vision: "darkvision", boosts: { 0: { value: ["cha"] }, 1: { value: ["dex"] }, 2: { value: ["str", "dex", "con", "int", "wis", "cha"], selected: "int" } }, flaws: { 0: { value: ["wis"] } } } },
        { name: "Unbreakable Goblin", type: "heritage", system: {} },
        { name: "Bandit", type: "background", system: { boosts: { 0: { value: ["dex", "cha"], selected: "dex" }, 1: { value: ["str", "dex", "con", "int", "wis", "cha"], selected: "cha" } } } },
        { name: "Desna", type: "deity", system: {} },
        { name: "Rogue Dedication", type: "feat", system: { category: "class", level: { value: 2 }, traits: { value: ["archetype", "dedication"] } } },
        { name: "Surprise Attack", type: "feat", system: { category: "classfeature", level: { value: 2 }, traits: { value: ["rogue"] } } },
        { name: "Munitions Crafter", type: "feat", system: { category: "class", level: { value: 1 }, traits: { value: ["gunslinger"] } } },
        { name: "Alchemical Crafting", type: "feat", system: { category: "skill", level: { value: 1 }, traits: { value: ["skill"] } } },
        { name: "Basic Trickery", type: "feat", system: { category: "class", level: { value: 4 }, traits: { value: ["archetype"] } } },
        { name: "Ten Paces", type: "action", system: { actionType: { value: "free" }, actions: { value: null }, description: { value: "Gain a bonus to initiative." }, rules: [{ key: "FlatModifier", selector: "initiative", type: "circumstance", value: 2, predicate: ["ten-paces"] }] } },
        { _id: "pistol-1", name: "Dueling Pistol", type: "weapon", system: { quantity: 1, equipped: { carryType: "held", handsHeld: 1 }, bulk: { value: 0.1 }, traits: { value: ["firearm"] }, runes: { potency: 1, striking: 1, property: [] }, price: { value: { gp: 12 } } } },
        { _id: "pistol-2", name: "Dueling Pistol", type: "weapon", system: { quantity: 1, equipped: { carryType: "held", handsHeld: 1 }, bulk: { value: 0.1 }, traits: { value: ["firearm"] }, runes: { potency: 1, striking: 1, property: [] }, price: { value: { gp: 12 } } } },
        { name: "Leather Armor", type: "armor", system: { equipped: { carryType: "worn" }, category: "light", acBonus: 1, dexCap: 4 } },
        { name: "Spellscar Desert Lore", type: "lore", system: { slug: null, proficient: { value: 1 } } },
      ],
    };
    const existingCharacter = {
      $schema: "../../schema/character.schema.json",
      formatVersion: "1.0.0",
      id: "rafa",
      name: "Rafa",
      kind: "player-character",
      system: { id: "pf2e", ruleset: "remaster" },
      identity: { ancestry: "Goblin", class: "Gunslinger", level: 5, languages: [] },
      build: {
        keyAbility: "dex",
        abilities: { str: { score: 10 }, dex: { score: 18 }, con: { score: 14 }, int: { score: 14 }, wis: { score: 10 }, cha: { score: 18 } },
        hp: { max: 60 },
        speed: { land: 20 },
      },
      proficiencies: { saves: {}, perception: "untrained", skills: { thievery: "trained" } },
      features: {},
      inventory: [],
      bonuses: [{ id: "unattributed-initiative-minus-2", source: "unattributed", value: -2, type: "unattributed", appliesTo: ["initiative"] }],
      observed: { ac: 22, initiative: 8 },
      audit: { openQuestions: [{ id: "attribute-boost-allocation", question: "Which boosts went where?" }] },
    };

    const imported = convertFoundryActor(actor, { slug: "goblin", existingCharacter });

    assert.equal(imported.name, "Zé Cangapé");
    assert.equal(imported.id, existingCharacter.id);
    assert.equal(imported.identity.class, "Gunslinger");
    assert.equal(imported.identity.archetype.name, "Rogue Dedication");
    assert.equal(imported.build.abilities.dex.score, 19);
    assert.equal(imported.build.abilities.cha.score, 18);
    assert.equal(imported.build.abilities.wis.score, 10);
    assert.equal(imported.proficiencies.skills.thievery, "expert");
    assert.equal(imported.build.initiativeStatistic, "stealth");
    assert.deepEqual(imported.build.boosts["1"], ["dex", "cha", "con", "int"]);
    assert.equal(buildAudit(imported).rows.find(({ key }) => key === "initiative")?.expected, 8);
    assert.ok(imported.features.classFeats.some(({ name }) => name === "Munitions Crafter"));
    assert.ok(imported.features.skillFeats.some(({ name }) => name === "Alchemical Crafting"));
    assert.ok(imported.features.archetypeFeats.some(({ name }) => name === "Basic Trickery"));
    assert.ok(imported.features.archetypeFeats.some(({ name }) => name === "Surprise Attack"));
    assert.ok(imported.features.background.some(({ name }) => name === "Bandit"));
    assert.equal(imported.inventory.filter(({ name }) => name === "Dueling Pistol").length, 2);
    assert.equal(imported.inventory.find(({ name }) => name === "Dueling Pistol").runes.striking, 1);
    assert.ok(imported.inventory.some(({ name }) => name === "Leather Armor"));
    assert.ok(imported.actions.freeActions.some(({ name }) => name === "Ten Paces"));
    assert.equal(imported.observed.ac, existingCharacter.observed.ac);
    assert.equal(imported.audit.openQuestions[0].status, "resolved");
    assert.ok(!imported.bonuses.some(({ id }) => id === "unattributed-initiative-minus-2"));
    assert.ok(imported.audit.openQuestions.some(({ id }) => id === "ten-paces-initiative-toggle"));

    const rebuilt = buildActor(imported);
    assert.equal(rebuilt.type, "Actor");
    assert.equal(rebuilt.name, "Zé Cangapé");
    assert.equal(rebuilt.system.initiative.statistic, "stealth");
    assert.deepEqual(rebuilt.system.build.attributes.boosts["1"].value, ["dex", "cha", "con", "int"]);
    assert.equal(rebuilt.items.filter(({ type, name }) => type === "weapon" && name === "Dueling Pistol").length, 2);
    assert.ok(rebuilt.items.some(({ type, name }) => type === "feat" && name === "Munitions Crafter"));
    assert.ok(rebuilt.items.some(({ type, name }) => type === "lore" && name === "Spellscar Desert Lore"));
    assert.ok(rebuilt.items.find(({ type, name }) => type === "action" && name === "Ten Paces")?.system.rules.length);

    const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "foundry-import-"));
    const temporaryCharacter = path.join(temporaryDir, "character.json");
    try {
      await writeFile(temporaryCharacter, JSON.stringify(imported));
      const validation = spawnSync(process.execPath, [
        fileURLToPath(new URL("../../tools/foundry.mjs", import.meta.url)),
        "validate",
        temporaryCharacter,
      ], { encoding: "utf8" });
      assert.equal(validation.status, 0, validation.stderr || validation.stdout);
    } finally {
      await rm(temporaryDir, { recursive: true, force: true });
    }
  });

  it("rejects non-character exports instead of producing an incomplete sheet", () => {
    assert.throws(
      () => convertFoundryActor({ type: "npc", name: "Test", system: {}, items: [] }, { slug: "test" }),
      /actor type must be character/,
    );
  });
});
