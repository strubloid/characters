import { useCallback, useEffect, useState } from "react";
import { Bot } from "@/components/animate-ui/icons/bot";
import { CircleCheck } from "@/components/animate-ui/icons/circle-check";
import { LoaderCircle } from "@/components/animate-ui/icons/loader-circle";
import { TriangleAlert } from "@/components/animate-ui/icons/triangle-alert";
import { ScrollText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CharacterSheet } from "@/features/character/character-sheet";
import { AskPanel } from "@/features/ask/ask-panel";
import { RunPanel } from "@/features/runs/run-panel";

import {
  fetchCharacter,
  fetchCharacters,
  fetchSheet,
  runTool,
  type Audit,
  type Character,
  type CharacterSummary,
  type ToolCommand,
  type ToolRun,
} from "@/lib/api";

function AuditSummary({ audit }: { audit: Audit }) {
  const clean = audit.mismatches.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {clean ? (
            <CircleCheck className="text-emerald-500 size-5" />
          ) : (
            <TriangleAlert className="text-amber-500 size-5" />
          )}
          Audit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          {audit.checked} of {audit.total} sheet statistics are reproduced by the build.
        </p>
        {clean ? (
          <p className="text-emerald-600">Every statistic matches.</p>
        ) : (
          <ul className="space-y-1">
            {audit.mismatches.map((row) => (
              <li key={row.key} className="flex items-center gap-2">
                <span className="capitalize">{row.label}</span>
                <Badge variant="destructive">
                  {row.residual !== null && row.residual > 0 ? "+" : ""}
                  {row.residual}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function App() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [slug, setSlug] = useState<string>("");
  const [character, setCharacter] = useState<Character | null>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [running, setRunning] = useState<ToolCommand | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target: string) => {
    try {
      const [result, sheet] = await Promise.all([fetchCharacter(target), fetchSheet(target)]);
      setCharacter(result.character);
      setAudit(result.audit);
      setMarkdown(sheet);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, []);

  useEffect(() => {
    fetchCharacters()
      .then((list) => {
        setCharacters(list);
        if (list.length > 0) {
          setSlug(list[0].slug);
          void load(list[0].slug);
        }
      })
      .catch((loadError) => setError(String(loadError)));
  }, [load]);

  function handleSelect(next: string) {
    setSlug(next);
    void load(next);
  }

  async function handleRun(command: ToolCommand) {
    if (!slug) return;
    setRunning(command);
    try {
      const run = await runTool(slug, command);
      setRuns((previous) => [run, ...previous]);
      await load(slug);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="bg-background/95 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <h1 className="text-lg leading-tight font-semibold">Foundry Characters</h1>
            <p className="text-muted-foreground text-xs">
              characters/ is the source of truth · docs/ holds the markdown
            </p>
          </div>

          <Select value={slug} onValueChange={handleSelect}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a character" />
            </SelectTrigger>
            <SelectContent>
              {characters.map((entry) => (
                <SelectItem key={entry.slug} value={entry.slug}>
                  {entry.name} · {entry.ancestry} {entry.class} {entry.level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <main className="mx-auto grid max-w-[110rem] gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0">
          {error && (
            <Card className="border-destructive mb-4">
              <CardContent className="text-destructive flex items-center gap-2 text-sm">
                <TriangleAlert className="size-4" />
                {error}
              </CardContent>
            </Card>
          )}

          {running && (
            <div className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
              <LoaderCircle className="size-4" />
              Running {running}…
            </div>
          )}

          {!character || !audit ? (
            <Card>
              <CardContent className="text-muted-foreground py-12 text-center text-sm">
                {characters.length === 0 ? "No characters found." : "Loading character…"}
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="sheet">
              <TabsList>
                <TabsTrigger value="sheet">
                  <ScrollText />
                  Sheet
                </TabsTrigger>
                <TabsTrigger value="ask">
                  <Bot />
                  Ask
                </TabsTrigger>
                <TabsTrigger value="markdown">Markdown</TabsTrigger>
                <TabsTrigger value="bonuses">Bonuses</TabsTrigger>
              </TabsList>

              <TabsContent value="sheet" className="mt-4">
                <CharacterSheet character={character} audit={audit} />
              </TabsContent>

              <TabsContent value="ask" className="mt-4">
                <AskPanel slug={slug} />
              </TabsContent>

              <TabsContent value="markdown" className="mt-4">
                <Card>
                  <CardContent>
                    <pre className="max-h-[70vh] overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap">
                      {markdown || "Run Render to generate the markdown sheet."}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bonuses" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Declared bonuses</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(character.bonuses ?? []).map((bonus) => (
                      <div key={bonus.id} className="border-l-2 pl-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{bonus.id}</span>
                          <Badge variant={bonus.source === "unattributed" ? "destructive" : "outline"}>
                            {bonus.source}
                          </Badge>
                          <Badge variant="secondary">
                            {bonus.value >= 0 ? "+" : ""}
                            {bonus.value}
                          </Badge>
                        </div>
                        {bonus.note && (
                          <p className="text-muted-foreground mt-1 text-xs">{bonus.note}</p>
                        )}
                        <p className="text-muted-foreground mt-1 font-mono text-xs">
                          applies to {bonus.appliesTo.join(", ")}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {audit && <AuditSummary audit={audit} />}
          <RunPanel runs={runs} running={running} onRun={handleRun} />
        </aside>
      </main>
    </div>
  );
}
