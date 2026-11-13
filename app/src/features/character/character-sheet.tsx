import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { Audit, Character, Feature, InventoryItem } from "@/lib/api";

function sign(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function Residual({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  if (value === 0) return <span className="text-muted-foreground/50">0</span>;
  return <Badge variant="destructive">{sign(value)}</Badge>;
}

function IdentityCard({ character }: { character: Character }) {
  const { identity } = character;
  const rows: [string, string][] = [
    ["Ancestry", identity.ancestry],
    ["Heritage", identity.heritage ?? "-"],
    ["Background", identity.background ?? "-"],
    ["Class", identity.class],
    ["Archetype", identity.archetype ? `${identity.archetype.name} (${identity.archetype.name && identity.archetype.level})` : "-"],
    ["Deity", identity.deity ?? "-"],
    ["Level", `${identity.level}`],
    ["Experience", identity.xp ? `${identity.xp.value} / ${identity.xp.max}` : "-"],
    ["Age", identity.age || "-"],
    ["Gender / pronouns", identity.gender || "-"],
    ["Ethnicity", identity.ethnicity || "-"],
    ["Nationality", identity.nationality || "-"],
    ["Languages", identity.languages?.join(", ") ?? "-"],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-xs tracking-wide uppercase">{label}</dt>
              <dd className="mt-0.5 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function AttributesCard({ character, audit }: { character: Character; audit: Audit }) {
  const stat = (key: string) => audit.rows.find((row) => row.key === key);

  const tiles: { label: string; value: string }[] = [
    { label: "Armor class", value: sign(stat("ac")?.actual ?? 0) },
    { label: "Hit points", value: String(character.build.hp.max) },
    { label: "Fortitude", value: sign(stat("fortitude")?.actual ?? 0) },
    { label: "Reflex", value: sign(stat("reflex")?.actual ?? 0) },
    { label: "Will", value: sign(stat("will")?.actual ?? 0) },
    { label: "Perception", value: sign(stat("perception")?.actual ?? 0) },
    { label: "Initiative", value: sign(stat("initiative")?.actual ?? 0) },
  ];

  const classDCs = Object.entries(character.proficiencies.classDC ?? {}).map(([name]) => ({
    label: `${name} class DC`,
    value: sign(stat(`classDC:${name}`)?.actual ?? 0),
  }));

  const speeds = character.build.speed;
  const senses = character.build.senses ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attributes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {Object.entries(character.build.abilities).map(([key, ability]) => (
            <div key={key} className="rounded-lg border px-3 py-2 text-center">
              <div className="text-muted-foreground text-xs tracking-wide uppercase">{key}</div>
              <div className="text-2xl font-semibold tabular-nums">
                {sign(ability.mod ?? Math.floor((ability.score - 10) / 2))}
              </div>
              <div className="text-muted-foreground text-xs tabular-nums">{ability.score}</div>
            </div>
          ))}
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[...tiles, ...classDCs].map((tile) => (
            <div key={tile.label} className="rounded-lg border px-3 py-2">
              <div className="text-muted-foreground text-xs tracking-wide uppercase">{tile.label}</div>
              <div className="text-xl font-semibold tabular-nums">{tile.value}</div>
            </div>
          ))}
        </div>

        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>Speed {speeds?.land} ft</span>
          {senses.map((sense) => (
            <span key={sense.name}>
              {sense.name}
              {sense.range ? ` ${sense.range} ft` : ""}
            </span>
          ))}
          {character.resources?.heroPoints && (
            <span>
              Hero points {character.resources.heroPoints.value}/{character.resources.heroPoints.max}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SkillsCard({ character, audit }: { character: Character; audit: Audit }) {
  const rows = Object.entries(character.proficiencies.skills)
    .filter(([name]) => name !== "lore")
    .map(([name, rank]) => {
      const result = audit.rows.find((row) => row.key === `skill:${name}`);
      return { name, rank, row: result };
    });

  const lore = Object.entries(character.proficiencies.skills.lore ?? {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Skill</TableHead>
              <TableHead>Rank</TableHead>
              <TableHead className="text-right">Build</TableHead>
              <TableHead className="text-right">Sheet</TableHead>
              <TableHead className="text-right">Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ name, rank, row }) => (
              <TableRow key={name}>
                <TableCell className="font-medium capitalize">{name}</TableCell>
                <TableCell>
                  <Badge variant={rank === "untrained" ? "secondary" : "outline"}>{rank}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row?.expected === null || row?.expected === undefined ? "-" : sign(row.expected)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{sign(row?.actual ?? 0)}</TableCell>
                <TableCell className="text-right">
                  <Residual value={row?.residual ?? null} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {lore.length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="flex flex-wrap gap-2">
              {lore.map(([name, rank]) => (
                <Badge key={name} variant="outline" className="capitalize">
                  {name.replace(/-/g, " ")} · {rank}
                </Badge>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const FEATURE_GROUPS: [keyof Character["features"], string][] = [
  ["ancestry", "Ancestry"],
  ["class", "Class features"],
  ["ancestryFeats", "Ancestry feats"],
  ["classFeats", "Class feats"],
  ["archetypeFeats", "Archetype feats"],
  ["skillFeats", "Skill feats"],
  ["generalFeats", "General feats"],
  ["bonusFeats", "Bonus feats"],
];

function FeatureList({ entries }: { entries: Feature[] }) {
  return (
    <ul className="space-y-2">
      {entries.map((feature) => (
        <li key={feature.name} className="text-sm">
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{feature.name}</span>
            {feature.level !== undefined && (
              <span className="text-muted-foreground text-xs">level {feature.level}</span>
            )}
            {feature.automated === false && (
              <span className="text-muted-foreground text-xs">not automated</span>
            )}
          </div>
          {feature.summary && <p className="text-muted-foreground mt-0.5">{feature.summary}</p>}
        </li>
      ))}
    </ul>
  );
}

function FeaturesCard({ character }: { character: Character }) {
  const groups = FEATURE_GROUPS.filter(([key]) => (character.features[key] ?? []).length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Features</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map(([key, label]) => (
          <div key={key}>
            <h3 className="text-muted-foreground mb-1.5 text-xs tracking-wide uppercase">{label}</h3>
            <FeatureList entries={character.features[key] ?? []} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InventoryCard({ character }: { character: Character }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Bulk</TableHead>
              <TableHead className="text-right">Equipped</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {character.inventory.map((item: InventoryItem) => (
              <TableRow key={item.name}>
                <TableCell>
                  <div className="font-medium">{item.name}</div>
                  {item.notes && <div className="text-muted-foreground text-xs">{item.notes}</div>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.quantity ?? 1}</TableCell>
                <TableCell className="text-right tabular-nums">{item.bulk ?? 0}</TableCell>
                <TableCell className="text-right">
                  {item.equipped ? <Badge variant="outline">yes</Badge> : <span className="text-muted-foreground">-</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {character.currency && (
          <p className="text-muted-foreground mt-3 text-sm">
            {character.currency.pp} pp · {character.currency.gp} gp · {character.currency.sp} sp ·{" "}
            {character.currency.cp} cp · {character.currency.totalWealthGp} gp total wealth
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionsCard({ character, audit }: { character: Character; audit: Audit }) {
  const questions = audit.openQuestions;

  if (questions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open questions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Nothing open. Every question is answered.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Open questions
          <Badge variant="secondary">{questions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {questions.map((question) => (
          <div key={question.id} className="border-l-2 pl-3">
            <p className="text-sm font-medium">{question.question}</p>
            {question.why && <p className="text-muted-foreground mt-0.5 text-xs">{question.why}</p>}
          </div>
        ))}
        {character.audit?.notes && (
          <p className="text-muted-foreground border-t pt-3 text-xs">{character.audit.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function CharacterSheet({ character, audit }: { character: Character; audit: Audit }) {
  return (
    <div className="space-y-4">
      <IdentityCard character={character} />
      <AttributesCard character={character} audit={audit} />
      <SkillsCard character={character} audit={audit} />
      <FeaturesCard character={character} />
      <InventoryCard character={character} />
      <QuestionsCard character={character} audit={audit} />
    </div>
  );
}
