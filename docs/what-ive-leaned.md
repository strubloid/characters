# What I have learned

A working record of this repository: what it is, how the character was
reconstructed, how the tooling behaves, how the viewer is wired, and every
gotcha found on the way. Written 2026-11-13.

---

## 1. The repository

A Foundry VTT character repo. Characters are reviewable source files, not
opaque Foundry blobs.

```
AGENTS.md              agent guide, at the root
README.md              homepage, at the root
opencode.json          opencode config: skills path + the bigpickle agent
package.json           root scripts, delegates to app/ for the viewer
characters/<slug>/     source of truth and images
docs/                  every markdown file lives here
schema/                JSON Schema for character.json
tools/                 dependency-free Node tooling
app/                   the viewer (Vite + React + TS + Express)
```

**The layout rule the user set:** only `AGENTS.md` and `README.md` sit at the
root. All other markdown lives under `docs/`. Code, schema and character data
stay at the root. This is why the skill is at `docs/skills/foundry-character/`
and is wired up through `opencode.json` rather than `.opencode/skills/`.

**The character file contract** is `schema/character.schema.json`. It is
enforced by a hand-written validator in `tools/foundry.mjs` (no dependencies).

---

## 2. The character: Rafa

Goblin / Unbreakable Goblin heritage / Bandit background / Gunslinger (Way of
the Pistolero) / Rogue Dedication at 2nd level / Desna / level 5 / 0 of 1000 XP.

Transcribed from six Foundry screenshots in `characters/goblin/images/`.

| Tab | File | What it gave |
| --- | --- | --- |
| Character | `01-foundry.jpeg` | identity, abilities, AC, HP, perception, initiative, saves, speed, senses, languages |
| Actions | `02-foundry.jpeg` | three attacks, actions, reactions, free actions |
| Inventory | `03-foundry.jpeg` | weapons, armor, ammunition, bulk, currency |
| Proficiencies | `04-foundry.jpeg` | every skill with rank and modifier, attack and defense ranks, class DCs, lore |
| Feats | `05-foundry.jpeg` | every feat and class feature, grouped and levelled |
| Biography | `06-foundry.jpeg` | empty - the sheet was never filled in |

### Identity

- Ancestry Goblin, heritage Unbreakable Goblin, background Bandit
- Class Gunslinger, archetype Rogue Dedication (2nd level)
- Deity Desna
- Age 15, gender/pronouns "Ele", ethnicity "Alkenstar Goblin", nationality "Nex"
- Languages: Common (Taldane), Dwarven, Goblin, Kelsh

### Ability scores

Final modifiers read off the sheet: STR +0, DEX +4, CON +2, INT +2, WIS +0,
CHA +4.

The scores are the standard inverse of the modifier: 10 / 18 / 14 / 14 / 10 / 18.

**Caveat, still open:** DEX +4 and CHA +4 need 24 points of ability boosts at
5th level. Remaster gives about 18. So either something is granting ability
modifiers that the sheet does not show, or the character was built outside the
standard progression. The Foundry export stores the real boost allocation, so
a native export settles this.

### Derived values, and how they were checked

**Hit points: 60.** Verified two ways. Unbreakable Goblin grants 10 ancestry
HP instead of 6. Gunslinger is 8 HP per level plus Constitution: (8 + 2) x 5 +
10 ancestry = 60. Exact.

**Proficiency ranks come from the class, not from the badges alone:**

- Fortitude Expert, Reflex Expert - Gunslinger grants Expert in both at 1st level.
- Will Expert - Gunslinger starts Trained, and the 3rd level class feature
  **Stubborn** raises Will to Expert.
- Perception Expert - Gunslinger grants Expert in Perception at 1st level.
- Attack ranks - **Gunslinger Weapon Mastery** (5th level) raises simple and
  martial firearms/crossbows to Master, and advanced firearms/crossbows, simple
  weapons, martial weapons and unarmed attacks to Expert. That is exactly what
  the sheet shows.
- Class DC Gunslinger and Rogue both Trained.

**Remaster Gunslinger facts worth remembering:**

- Class feats land at 1, 2, then every even level. This character's are
  Dual-Weapon Reload (1), Quick Draw (2), Alchemical Shot (4).
- The Way of the Pistolero gives the **slinger's reload** action **Raconteur's
  Reload** (one action) and the initial deed **Ten Paces** (free action on
  initiative, +2 circumstance to initiative, draw a one-handed firearm).
- **Singular Expertise** (1st level) gives +1 circumstance to damage rolls with
  firearms and crossbows and caps other weapon proficiency.
- **Slinger's Precision** gives +2 precision with non-repeating crossbows and
  an extra 1d4 precision with non-repeating firearms.

**Remaster Goblin facts worth remembering:**

- 6 HP, Small, **25 ft** speed, boosts Dexterity and Charisma, Wisdom flaw,
  Common and Goblin.
- Traits are only Goblin, Humanoid and Darkvision. **There is no Goblin Sneak
  and no Athletics penalty.** The sheet's Stealth value is consistent with no
  Sneak, which is a useful confirmation that this is a Remaster character.

### The modifier algebra

This was the hard part, and it is worth writing down because the reasoning
generalises.

Every statistic on the sheet sits above the baseline derived from ability
scores plus proficiency ranks. The offsets:

| Group | Offset above "ability + proficiency" |
| --- | --- |
| AC, saves, Perception, class DCs, attack rolls | **+5** |
| Trained skills, except the three Dexterity ones | **+5** |
| Acrobatics, Stealth, Thievery (all trained, all Dexterity) | **+3** |
| Untrained skills | **0** |
| Nature and Religion (untrained, Intelligence) | **-2** |
| Athletics (untrained, Strength) | **-2** |
| Initiative | **-2** versus Perception + Dexterity |

Two deductions pinned this down:

1. **Untrained skills carry no bonus** while trained skills carry +5, so the
   bonus applies only to statistics with a proficiency rank.
2. **Dexterity is +2, not +4.** Initiative is Perception + Dexterity in PF2e.
   The sheet shows Perception +9 and Initiative +11, so Dexterity must be +2
   for that pair to work. But then Reflex saves, AC and attack rolls need a
   further +2 to land on 13, 22 and 15.

That contradiction is why the build declares the offsets as **explicit
`bonuses` entries** rather than pretending they are explained. Each one has
`source: "unattributed"` and a matching open question. The model reproduces
every sheet number exactly; what it cannot yet do is say *why*.

**The five unattributed bonuses, as recorded:**

| id | value | applies to |
| --- | --- | --- |
| `unattributed-plus-5` | +5 | ac, saves, perception, classDC, attacks, trained skills |
| `unattributed-dexterity-skills-minus-2` | -2 | acrobatics, stealth, thievery |
| `unattributed-nature-religion-minus-2` | -2 | nature, religion |
| `unattributed-athletics-minus-2` | -2 | athletics |
| `unattributed-initiative-minus-2` | -2 | initiative |

A likely candidate for the +5 is a campaign boon, a homebrew item, or a Foundry
world setting. It matches no published feat, ancestry trait or class feature.

### Other values confirmed from the images

- **Hero points: 1 of 3.** Resolved by cropping and upscaling the pip row.
- **Speed: land 20 ft only.** Swim and climb show the prohibited icon, fly and
  burrow show a dash.
- **No shield** equipped. Armor class is 22 with a plain +3 breastplate.
- **Dueling Pistol x2**, Breastplate, 30 rounds of dueling pistol ammunition.
  Bulk 2, strength 5, encumbered 5, max bulk 10, invested 0/10.
- Total wealth 32.30 gp, all currency counters at zero.
- Attacks: Dueling Pistol +15 (MAP -5, -10) twice, Unarmed +13 (MAP -4, -8).

### Open questions still standing

1. `global-plus-5` - what grants the +5?
2. `dexterity-skills-minus-2` - why are the three Dexterity skills 2 low?
3. `nature-religion-minus-2` - why 0 when the other Intelligence skills are +2?
4. `initiative-minus-2` - why +11 when Perception + Dexterity is +13?
5. `athletics-minus-2` - where from, given Remaster Goblin has no penalty?
6. `attribute-boost-allocation` - which boosts went where?
7. `armor-magic` - is the breastplate magic, or does it carry runes?

`hero-points` was resolved from the screenshots.

---

## 3. The tooling

Dependency-free Node, in `tools/`.

```bash
npm run validate -- <slug>   # schema check
npm run render   -- <slug>   # regenerate docs/characters/<slug>/character.md
npm run build    -- <slug>   # regenerate foundry-export.json
npm run audit    -- <slug>   # build versus sheet
npm run check    -- <slug>   # validate + audit
```

`tools/lib/` holds `rules.mjs` (proficiency tables, ability modifiers, bonus
resolution, derived-value computation), `audit.mjs` (the comparison, shared
with the viewer API), `export.mjs` (character.json to a Foundry actor source)
and `render.mjs` (character.json to Markdown).

### The audit is the heart of it

`observed` holds the numbers as they read on the real sheet. `build` and
`proficiencies` hold the character's structure. The audit recomputes every
statistic from the structure and prints the difference. A residual of zero
means the build explains the sheet. This is the mechanism for turning "what
should I change on this character" into a concrete list.

**Never copy one side into the other to silence a mismatch.** That destroys the
only signal the audit has.

### Rules worth writing down

- Proficiency bonuses: untrained 0, trained +2, expert +4, master +6, legendary +8.
- Ability modifier: `floor((score - 10) / 2)`. A +4 modifier is a score of 18, not 14.
- **Performance uses Charisma**, not Dexterity.
- Initiative is the Perception statistic plus Dexterity.
- Light armor caps Dexterity at +5 for armor class.
- Class DC is 10 + key ability modifier + proficiency.
- The key ability for Gunslinger is Dexterity.

### Foundry export

`foundry-export.json` imports through the actor's "Import Data" action. It
carries the build, not the automation: rule elements are only attached for
features whose published text is known with confidence (Bouncy Goblin, Vandal,
Stubborn, Slinger's Precision, Singular Expertise, Ten Paces). The boost
allocation is not reconstructed, so `build.attributes.manual` is set to true
and the base scores are written directly.

The authoritative artifact is a real Foundry export captured from the game and
saved as `characters/<slug>/foundry-native.json`. The reconciliation procedure
is in `docs/skills/foundry-character/references/foundry-roundtrip.md`.

---

## 4. The viewer

`app/` is a Vite + React 19 + TypeScript app with Tailwind v4 and shadcn/ui.
An Express server (`app/server.mjs`) serves the API and, in development, runs
Vite in middleware mode so one process and one port do everything.

```bash
npm run setup        # install the viewer's dependencies, once
npm run dev          # http://localhost:5173
npm run app:build    # production build
npm run app:lint     # oxlint
npm run app:typecheck
```

### API

| Route | Purpose |
| --- | --- |
| `GET /api/characters` | list of slugs with name, ancestry, class, level |
| `GET /api/characters/:slug` | the character plus the computed audit |
| `GET /api/characters/:slug/sheet` | the generated Markdown sheet |
| `GET /api/characters/:slug/questions` | the saved question log |
| `POST /api/characters/:slug/run` | run one of the five tool commands |
| `POST /api/characters/:slug/ask` | ask the bigpickle agent, as server sent events |
| `GET /api/images/:slug/:file` | the sheet screenshots |

**The run endpoint has a command whitelist.** Only `validate`, `audit`,
`render`, `build` and `check` are accepted; anything else is a 400. The slug is
passed as an argv element, never interpolated into a shell string.

**Unknown `/api/*` routes answer with JSON, not HTML.** This matters: the SPA
fallback would otherwise return `index.html` and the client would die with
"Unexpected token '<'". That is exactly the bug the user hit.

### The layout

The workshop uses a sticky character picker and a responsive workspace with
Overview, Edit, Learn, Ask, Chat, and Records areas. The right rail keeps the
five build commands and their stored run history in view. The editor validates
the full character document before saving, rebuilds the Foundry import and
Markdown sheet, and can merge a native Foundry actor export while preserving
that complete source export.

### The ask feature

The Ask tab asks the **bigpickle** opencode agent about the character being
viewed. Questions and answers persist in `app/data/questions.sqlite`, grouped by
character and kept across restarts. The same local database stores character
snapshots, theme preference, successful AI chat sessions, tool runs, Pathfinder
bookmarks/notes, and complete Foundry imports. Existing `questions.json`
histories are imported into the database on startup.

The server spawns `opencode run --agent bigpickle --format json <prompt>` with
the repository as the working directory, parses the JSON event stream, and
forwards the answer as server sent events: `status`, `text`, `done`, `error`.
Failures are persisted too, with the error message, so a broken setup is
visible rather than silent.

---

## 5. The bigpickle agent

Defined in `opencode.json`, not as a markdown file, so no markdown leaves
`docs/`.

```jsonc
{
  "agents": {
    "bigpickle": {
      "description": "Answers questions about a character in this Foundry characters repo",
      "mode": "primary",
      "system": "... read-only answering rules ...",
      "permission": { "*": "allow", "edit": "deny", "bash": "deny" }
    }
  }
}
```

The system prompt tells it to answer from the character file, to name the open
question when a number cannot be derived, to cite the source of each claim,
and to say exactly which field should change when a change is needed.

**The permission block is the V1 format, not V2.** The installed opencode is
1.18.35 and rejects the V2 `permissions` array outright with "V2 permissions
are not supported by OpenCode V1". V1 wants a flat map:

```jsonc
"permission": { "*": "allow", "edit": "deny", "bash": "deny" }
```

**`"*": "allow"` matters.** Without it, reading a file raises a permission
prompt, and because the child process has no terminal the agent waits forever.
Three agents hung this way before it was diagnosed. `stdin: "ignore"` is also
set on the spawn so this can never hang the server.

The prompt sent to the agent is built in `app/server/opencode.mjs`: the
character's identity, the repository paths, the audit summary, the open
questions, the full `character.json`, and then the user's question.

---

## 6. animate-ui and shadcn

The viewer uses official shadcn/ui primitives throughout: button, card, badge,
select, scroll-area, separator, table, tabs, tooltip, textarea.

animate-ui is installed as `@animate-ui/react` and `motion`. It animates
existing shadcn components by swapping the primitive import:

```bash
npx @animate-ui/cli@latest animate all
```

That animated **select**, **tabs** and **tooltip** in this project.
ScrollArea is not animated by animate-ui and was left alone.

`AnimateUIProvider` wraps the app in `src/main.tsx` with `tempo={0.9}`.

Animated icons come from the animate-ui registry and are installed one at a
time:

```bash
npx shadcn@latest add @animate-ui/icons-lucide-bot @animate-ui/icons-lucide-send ...
```

Installed: bot, send, loader-circle, circle-check, triangle-alert, terminal,
timer. They live in `src/components/animate-ui/icons/`.

---

## 7. Gotchas hit on the way

**The shadcn CLI resolves the `@` alias wrongly in this project.** It wrote
components to a literal `app/@/components/` directory instead of
`app/src/components/`. The cause was that the path alias lived only in
`tsconfig.app.json`; the CLI reads the root `tsconfig.json`. Fix: put
`compilerOptions.paths` in the root `tsconfig.json` too. With that in place
the CLI writes to `src/` correctly. If it happens again, move the files and
check the root tsconfig.

**TypeScript 7 removed `baseUrl`.** The alias now works with `paths` alone.

**The animate-ui icon files import React without using it**, which trips
`noUnusedLocals`. The unused `import * as React from 'react';` line was
removed from each generated file. A fresh `shadcn add` will reintroduce it.

**`opencode run --format json` emits one JSON object per line.** The shape that
matters:

```jsonc
{ "type": "text", "part": { "id": "prt_...", "text": "...", "time": { "start": ..., "end": ... } } }
```

Each text event carries the **full text of that part**, not a delta. A single
answer can arrive as several parts with different ids - the agent's preamble
("I'll read the character file.") and the final answer are separate parts.
Accumulate by part id and join the parts with a blank line.

**Tool events** arrive as `type: "tool"` with `part.state.status`.

**The agent is slow to trust, not slow to run.** A single question takes about
34 seconds end to end, most of it reading files. The server's timeout is 300
seconds and the curl or fetch timeout needs to be longer than that.

---

## 8. Where I left off

**The ask endpoint hangs when called through the server, but the same prompt
works from the command line in 34 seconds.** The probe scripts
(`/tmp/opencode/probe.mjs` and `probe2.mjs`) reproduce it: a plain
`spawn()` of the opencode binary from Node produces no stdout at all and never
closes, while the identical command from a shell works.

Things already ruled out:

- The prompt itself: the exact same prompt text works from the CLI.
- The permission hang: fixed by `"*": "allow"`, and the agent now reads files
  and answers.
- The server process: restarted after every change to `server.mjs` and
  `opencode.mjs`.

Things not yet ruled out:

- The spawn options. The difference between the working shell invocation and
  the failing Node invocation is `{ cwd, env: process.env, stdin: "ignore" }`
  versus the shell's inherited stdio. Worth trying `stdio: ["ignore", "pipe",
  "pipe"]` and dropping `env`, and checking whether the child needs a TTY or
  a different `PATH`.
- Whether the parent process being a long-lived Node server matters, as
  opposed to a short-lived script.

**Until that is fixed, the Ask tab returns the status event and then nothing.**
The question log shows the failure and the error message, which is at least
honest.

Everything else works: the viewer renders the character, all five tool commands
run from the buttons, the audit is green, and the question log persists.

---

## 9. Where to look for things

| Question | File |
| --- | --- |
| How a character file is shaped | `schema/character.schema.json` |
| The workflow for new characters | `docs/skills/foundry-character/SKILL.md` |
| What Foundry stores vs computes | `docs/skills/foundry-character/references/pf2e-data-model.md` |
| Import and export reconciliation | `docs/skills/foundry-character/references/foundry-roundtrip.md` |
| The character itself | `characters/goblin/character.json` |
| The readable sheet | `docs/characters/goblin/character.md` |
| The open questions | `audit.openQuestions` in character.json, rendered at the foot of the Markdown sheet |
| The derived-value maths | `tools/lib/rules.mjs` |
| The comparison | `tools/lib/audit.mjs` |
| The API | `app/server.mjs`, `app/server/opencode.mjs`, `app/server/questions.mjs` |
| The UI | `app/src/App.tsx`, `app/src/features/` |
