# AGENTS.md

This repo holds Foundry VTT characters as reviewable source files.

## Read this first

The character skill lives at `docs/skills/foundry-character/SKILL.md`. Load it
whenever the work touches a character: creating one, changing one, transcribing
one from a screenshot, answering "what should I change on this character", or
preparing one for import into Foundry.

## Layout

```
AGENTS.md              this file
README.md              the homepage
opencode.json          points opencode at docs/skills
characters/<slug>/
  character.json       source of truth, hand edited
  foundry-export.json  generated, import this into Foundry
  foundry-native.json  optional, a real export captured from the game
  images/              portraits, tokens, sheet screenshots
docs/
  characters/<slug>/
    character.md       generated readable sheet
  skills/foundry-character/
    SKILL.md
    references/
schema/character.schema.json
tools/foundry.mjs      build | validate | render | check | audit
tools/lib/             rules, audit, export and render helpers
app/                   the viewer: Vite + React frontend and an API server
```

Markdown lives under `docs/`. Code, schema and character data live at the root.
Only `AGENTS.md` and `README.md` sit at the top level.

## Commands

```bash
npm run validate -- <slug>   # schema check
npm run render   -- <slug>   # regenerate docs/characters/<slug>/character.md
npm run build    -- <slug>   # regenerate foundry-export.json
npm run audit    -- <slug>   # build versus sheet
npm run check    -- <slug>   # validate + audit

npm run setup                # install the viewer's dependencies
npm run dev                  # viewer on http://localhost:5173
npm run app:build            # production build of the viewer
npm run app:lint             # lint the viewer
npm run app:typecheck        # typecheck the viewer
```

Omit the slug when there is only one character. The character tooling has no
dependencies; only the viewer does.

## Conventions

- `character.json` is the only file a human edits. `character.md` and
  `foundry-export.json` are generated; never hand-edit them.
- `observed` holds the numbers as they read on the real sheet. `build` and
  `proficiencies` hold the character's structure. Never copy one into the
  other to silence a mismatch - that is the signal the audit depends on.
- Every entry in `bonuses` needs a `source`. `"unattributed"` is allowed for a
  bonus whose origin is not known yet, but it must be tracked as an open
  question.
- Anything the audit cannot explain belongs in `audit.openQuestions` with a
  specific question and why it matters.
- Slugs are lowercase and hyphenated. The folder name matches the slug.
- Sheet screenshots stay in `characters/<slug>/images/`. They are the evidence
  behind `observed`, so keep them until the character has a native Foundry
  export.

## Workflow expectations

1. Change `character.json`.
2. Run `npm run check -- <slug>`.
3. Run `npm run render -- <slug>` and `npm run build -- <slug>`.
4. Report what changed and what is still open.

Do not commit unless asked.
