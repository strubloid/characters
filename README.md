# Characters

Foundry VTT characters kept as reviewable source files. Each character is a
folder with a curated JSON file, a generated export you can import straight
into Foundry, and a generated readable sheet under `docs/`.

```
characters/goblin/
  character.json        source of truth, hand edited
  foundry-export.json   generated, import this into Foundry
  images/               the sheet screenshots it was transcribed from
docs/characters/goblin/
  character.md          generated readable sheet
docs/skills/foundry-character/
  SKILL.md              the workflow used to build these files
  references/
```

## Commands

The character tooling has no dependencies. Node 18 or newer.

```bash
npm run validate -- goblin   # check character.json against the schema
npm run render   -- goblin   # regenerate docs/characters/goblin/character.md
npm run build    -- goblin   # regenerate foundry-export.json
npm run audit    -- goblin   # compare the build against the sheet
npm run check    -- goblin   # validate + audit
```

## The viewer

A one page React app that shows the character and runs the tooling against it.

```bash
npm run setup     # install the viewer's dependencies, once
npm run dev       # http://localhost:5173
```

It shows the character as the repo stores it: identity, attributes, skills with
the build value beside the sheet value and the difference, features, inventory,
declared bonuses and the open questions. The right hand rail has the five
commands - Check, Validate, Audit, Render and Build - and every run's output,
so you can see what each command did without leaving the page.

The app talks to a small Express server (`app/server.mjs`) that reads the
character files and shells out to `tools/foundry.mjs`. Only the five commands
above can be run; anything else is rejected.

### Chat with OpenCode Zen

The **Chat** tab talks to OpenCode Zen through the same Express server, which
proxies the request so the API key never reaches the browser, and loads the
model list into a picker. Copy `.env.example` to `.env`, add an
`OPENCODE_ZEN_API_KEY`, set `OPENCODE_ZEN_PLAN=go` for a Go subscription (or
leave it for pay-as-you-go), and restart the dev server. `docs/big-pickle.md`
covers the verified endpoints, the streaming round trip and the limits.

## How a character is modelled

`character.json` holds two separate things on purpose.

**The structure.** Ability scores, proficiency ranks, feats, gear, and the
bonuses the character carries. This is what the Foundry export is generated
from.

**The observed sheet.** The numbers as they actually read on the Foundry
sheet. This is the ground truth.

`npm run audit` recomputes every statistic from the structure and prints the
difference against the observed sheet:

```
statistic               expected    sheet   residual
----------------------------------------------------
Armor Class                   22       22          0
acrobatics                     9        9          0
...
```

A residual of zero means the build explains the sheet. A non-zero residual
means something is missing, and the audit is where you find out what.

Anything that cannot be explained becomes an entry in `audit.openQuestions`,
which is rendered at the bottom of the Markdown sheet so the outstanding
questions are always visible.

## Importing into Foundry

Right-click the actor in the Actors sidebar, choose "Import Data", and pick
`foundry-export.json`.

The generated export carries the build, not the full automation. For the
authoritative version, export the actor from Foundry and save it as
`characters/goblin/foundry-native.json`; the round-trip procedure is in
`docs/skills/foundry-character/references/foundry-roundtrip.md`.

## The skill

`docs/skills/foundry-character/` holds the workflow used to build these
files: the `character.json` contract, the audit loop, the rules that trip
people up, and the Foundry import and export procedure. `opencode.json` points
opencode at that folder, and it is symlinked into the global skills directory
so it is available in any project.
