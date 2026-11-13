# What Foundry stores versus what it computes

Pathfinder 2e in Foundry is a schema-driven system. An actor's *source* holds
only what cannot be derived; everything else is recomputed on every load. This
matters when transcribing a character, because the number you read on the sheet
is often not a number that appears in the export.

## Actor source shape

A PF2e character actor serialises roughly like this:

```jsonc
{
  "id": "rafa",
  "type": "Actor",
  "name": "Rafa",
  "img": "icons/svg/mystery-man.svg",
  "system": {
    "abilities":  { "str": { "base": 10, "mod": 0 }, "dex": { "base": 18, "mod": 4 } },
    "attributes": { "hp": { "value": 60, "temp": 0, "max": 60 },
                    "speed": { "value": 20, "otherSpeeds": [] } },
    "details":    { "level": { "value": 5 }, "languages": { "value": ["common", "goblin"] },
                    "keyability": { "value": "dex" }, "xp": { ... }, "biography": { ... } },
    "skills":     { "acrobatics": { "rank": 1 }, "arcana": { "rank": 0 } },
    "resources":  { "heroPoints": { "value": 0, "max": 2 } },
    "build":      { "attributes": { "manual": true, "boosts": { ... } } },
    "pfs":        { ... },
    "exploration": []
  },
  "items":  [ /* ancestry, heritage, background, class, deity, feats, weapons */ ],
  "effects": [],
  "flags": {},
  "prototypeToken": { ... }
}
```

## Stored versus computed

| Value | Where it lives | Notes |
| --- | --- | --- |
| Ability score and modifier | `system.abilities.<key>.base` / `.mod` | The modifier is recomputed from `base` plus boosts. |
| Ability boosts | `system.build.attributes.boosts`, plus the ancestry, background and class items | With `manual: true` the sheet stops applying the automatic boost maths and trusts `base`. |
| Hit points | `system.attributes.hp` | `max` is stored; the automatic total is recomputed. |
| Armor class | not stored | Computed from armor, the Dexterity cap and modifiers. |
| Saves, Perception, class DC | not stored | Computed from ability scores, proficiency and modifiers. |
| Skill ranks | `system.skills.<slug>.rank` | Ranks are stored; the numbers are computed. |
| Proficiency ranks | not stored for saves | Derived from class, ancestry, background and feats. Martial proficiency for gear is derived from the item's category and the class item. |
| Feats and features | `items[]` | Each feat is an item of type `feat` with `system.rules` holding the rule elements. |
| Hero points | `system.resources.heroPoints` | Stored, not derived. |

This is why a hand-written export can import and still show different numbers
than the source sheet: Foundry recomputes everything from the items, and an
item with no rule elements contributes nothing.

## Rule elements

A rule element is a JSON instruction attached to an item. The shapes used by
the exporter in `tools/lib/export.mjs`:

```jsonc
// flat modifier
{ "key": "PF2E.RuleElementFlatModifier", "value": 2, "domain": "acrobatics",
  "predicate": { "in": ["action:tumble-through"] }, "label": "Bouncy Goblin" }

// dice
{ "key": "PF2E.RuleElementDice", "dice": 1, "die": "d4", "domain": "damage",
  "predicate": { "in": ["weapon:category:firearm"] } }

// proficiency
{ "key": "PF2E.RuleElementProficiency", "rank": "trained",
  "predicate": { "in": ["acrobatics"] } }
```

Common domains: `all`, `damage`, `initiative`, `acrobatics`, `will`.
Common predicates: `weapon:category:firearm`, `weapon:traits:repeating`,
`action:tumble-through`, `self:level:5`.

## Item types

PF2e item types include `ancestry`, `heritage`, `background`, `class`, `deity`,
`feat`, `lore`, `weapon`, `armor`, `shield`, `consumable`, `equipment`,
`treasure`, `action` and `spell`.

Ancestry, heritage, background, class and deity are items on the actor, not
fields on it. The sheet's Ancestry tab reads them back out of the item list.

Ammunition is a `consumable` with `system.category: "ammunition"` and a
`stackGroup`; the sheet's Ammunition section is derived from those.

## Sources worth keeping open

- The system source: `https://github.com/foundryvtt/pf2e` - `src/module/actor/character/data.ts`
  has the character source type, `static/template.json` has the defaults for
  every actor and item type.
- The Remaster change list: `https://github.com/foundryvtt/pf2e/wiki/Remaster-Changes`
- Rules text: `https://pf2.d20pfsrd.com` and `https://2e.aonprd.com`
