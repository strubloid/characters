---
name: foundry-character
description: Use when creating, updating, reviewing or importing a Foundry VTT character in this repo - making a new character sheet, transcribing a character from Foundry screenshots or a paper sheet, changing a character's build, answering "what should I change on this character", or preparing a character for import into Foundry VTT. Covers the character.json contract, the build-versus-sheet audit loop, and the Foundry import/export round trip.
---

# Foundry characters

Characters live in this repo as reviewable source files, not as opaque Foundry
blobs. A character is one folder under `characters/` holding a curated JSON
file, a generated Foundry export and its images, plus a generated Markdown
sheet under `docs/`.

```
characters/<slug>/
  character.json        source of truth - the only file a human edits
  foundry-export.json   generated file you import into Foundry
  foundry-native.json   optional, a real Foundry export captured from the game
  images/               portraits, tokens, sheet screenshots
docs/characters/<slug>/
  character.md          generated readable sheet
```

## The one rule

`character.json` is the source of truth. `character.md` and `foundry-export.json`
are generated. Never hand-edit a generated file; change the JSON and re-run the
tool.

```bash
npm run validate -- <slug>   # check the JSON against the schema
npm run render   -- <slug>   # regenerate docs/characters/<slug>/character.md
npm run build    -- <slug>   # regenerate foundry-export.json
npm run audit    -- <slug>   # compare the build against the recorded sheet values
npm run check    -- <slug>   # validate + audit
```

## Creating a new character

1. Pick a slug (lowercase, hyphenated) and make `characters/<slug>/`.
2. Write `character.json` from scratch or copy an existing one and change it.
   The schema is `schema/character.schema.json`; read it for the field contract.
3. Fill in `observed` with the numbers as they appear on the real sheet.
   This is the ground truth the audit compares against.
4. Fill in `build` and `proficiencies` with the character's actual structure.
5. Run `npm run audit -- <slug>`. Every statistic should reach a residual of 0.
6. Anything the audit cannot explain goes into `audit.openQuestions`. Do not
   paper over a mismatch by editing `observed` to match your guess - that
   destroys the signal.
7. Run `npm run render -- <slug>` and `npm run build -- <slug>`.

## Reading a character from screenshots

Foundry sheet screenshots are the usual input. Read every tab: character,
actions, inventory, proficiencies, feats, biography.

- Transcribe the sheet's numbers into `observed`, not into `build`.
- Work out the structure separately: ability scores, proficiency ranks, gear,
  feats.
- Then let `npm run audit` tell you where the two disagree. The residual
  column is the fastest way to find a misread.

If a value is too small to read reliably, crop and upscale the image before
guessing (a 2x crop of the skills panel is usually enough).

## The audit loop - how to ask for improvements

`npm run audit` is the mechanism for turning vague requests into concrete work.
It prints every statistic the build predicts, the value on the sheet, and the
difference. Three outcomes:

- **Residual 0** - the build explains the sheet. Done.
- **Non-zero residual** - something is missing from the build. Either the
  character has a bonus you have not declared yet, or the transcription is
  wrong. Ask the player.
- **A statistic missing from one side** - the build or the sheet does not know
  about it. Add it.

Declared bonuses live in `bonuses`. Each entry needs a `source`, even when the
source is `"unattributed"`. When the player explains a bonus, replace the
source with the real one and drop the entry if the build already accounts for
it another way.

When you cannot explain a residual, open a question in `audit.openQuestions`
with the specific question and why it matters. The Markdown sheet renders that
list, so the player always sees the outstanding questions.

## Rules that trip people up

- **Proficiency bonuses** are untrained 0, trained +2, expert +4, master +6,
  legendary +8.
- **Ability modifier** is `floor((score - 10) / 2)`. A modifier of +4 means a
  score of 18, not 14.
- **Performance uses Charisma**, not Dexterity.
- **Initiative is the Perception statistic plus Dexterity.** If the sheet shows
  a different number, something is modifying it.
- **PF2e Remaster Goblin** has no Goblin Sneak and no Athletics penalty. If a
  character sheet shows either, find the real source.
- **Light armor caps Dexterity** at +5 for armor class.
- **Level 5 Remaster classes** give a class feat at 1, 2, then every even
  level, and a general feat at 3.

## Foundry import and export

`foundry-export.json` imports into Foundry through the actor's "Import Data"
action. It carries the build, not the automation: rule elements are only
included for features whose published text is known with confidence, and the
boost allocation is not reconstructed.

The authoritative artifact is a real Foundry export. Capture it with
"Export Data", save it as `characters/<slug>/foundry-native.json`, and diff the
two. See `references/foundry-roundtrip.md` for the full procedure and
`references/pf2e-data-model.md` for the shape of what Foundry stores.

## Reference

- `references/pf2e-data-model.md` - what Foundry stores versus what it computes
- `references/foundry-roundtrip.md` - the import/export reconciliation procedure
- `schema/character.schema.json` - the field contract, at the repo root
