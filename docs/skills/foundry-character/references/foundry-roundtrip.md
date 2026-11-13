# The Foundry round trip

Two files can describe the same character and they will not agree byte for
byte. This is the procedure for reconciling them.

## What each file is good for

| File | Authoritative for | Not authoritative for |
| --- | --- | --- |
| `character.json` | The build, the audit trail, the open questions | Rule elements, boost allocation, item UUIDs |
| `foundry-export.json` | Being importable | Accuracy - it is generated from the build |
| `foundry-native.json` | Everything, because the game wrote it | Diffability - it is noisy and full of IDs |

## Round trip, from scratch

1. **Generate.** `npm run build -- <slug>` writes `foundry-export.json`.
2. **Import.** In Foundry, create an empty actor of the right type, then use
   the actor directory's "Import Data" action and pick `foundry-export.json`.
   Importing into an empty actor is cleaner than importing over an existing
   one.
3. **Look.** Open the sheet and compare the tabs against `character.md`.
   Anything Foundry shows that the build did not produce is a rule element the
   exporter does not emit yet. Anything the build produced that Foundry does
   not show is a field Foundry ignores or recomputes.
4. **Capture.** Right-click the actor, "Export Data", and save the file as
   `characters/<slug>/foundry-native.json`.
5. **Diff.** Compare the native export against `character.json` and note every
   disagreement. The native export wins for anything mechanical.
6. **Fold back.** Move the real values into `character.json` - boost
   allocation, hero points, item details, rule elements - then delete the
   hand-written duplicates. Re-run `npm run audit -- <slug>`; any statistic that
   changed must be updated in `observed` too.

## Diffing a native export

The native export is a Foundry actor source with the same top-level shape as
`foundry-export.json`, so a structural comparison works:

- `system.abilities.<key>.base` - the real ability scores.
- `system.build.attributes.boosts` - the real boost allocation, plus which
  boosts came from the ancestry, background and class items.
- `system.details.level.value`, `system.details.xp.value` - level and XP.
- `system.resources.heroPoints` - hero points.
- `items[]` - every item, with its `system.rules`. Look for rule elements the
  exporter does not know about.
- `system.details.languages.value` - language slugs, which are the reliable
  language list.
- `system.proficiencies` - martial proficiency ranks, when they have been
  customised.

The native export also contains things the curated file deliberately omits:
per-actor `_id`s, folder references, ownership, compendium UUIDs, and the
expanded defaults Foundry writes for every template. Ignore those.

## Keeping them in sync afterwards

Every change to `character.json` means regenerating:

```bash
npm run check -- <slug> && npm run render -- <slug> && npm run build -- <slug>
```

If a change also affects the game, re-import `foundry-export.json` into the
actor. That overwrites the items, so anything the player changed inside the
game is lost. When in doubt, capture a fresh native export first.

## Things the exporter deliberately does not do

- It does not reconstruct the ability boost allocation. It sets
  `build.attributes.manual` to `true` and writes the base scores directly, so
  the sheet shows the right modifiers even though the boost history is unknown.
- It only attaches rule elements for features whose published text is known
  with confidence. Everything else ships as a plain item.
- It does not link to compendium items. A character imported this way has its
  own copies of its ancestry, class and feats, which will not receive future
  system changes.
- It does not set a portrait. `art.portrait` points at a file in the character
  folder, which has to be uploaded to Foundry separately.
