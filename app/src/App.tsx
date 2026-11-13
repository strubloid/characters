import { useCallback, useEffect, useState } from "react";
import { Bot } from "@/components/animate-ui/icons/bot";
import { CircleCheck } from "@/components/animate-ui/icons/circle-check";
import { LoaderCircle } from "@/components/animate-ui/icons/loader-circle";
import { TriangleAlert } from "@/components/animate-ui/icons/triangle-alert";
import { BookOpen, Boxes, FileJson, MessagesSquare, Moon, ScrollText, Sun } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CharacterSheet } from "@/features/character/character-sheet";
import { CharacterEditor } from "@/features/character/character-editor";
import { AskPanel } from "@/features/ask/ask-panel";
import { ChatPanel } from "@/features/chat/chat-panel";
import { PathfinderLibrary } from "@/features/learn/pathfinder-library";
import { RunPanel } from "@/features/runs/run-panel";

import {
  fetchCharacter,
  fetchCharacters,
  fetchSheet,
  fetchThemePreference,
  fetchToolRuns,
  runTool,
  saveThemePreference,
  type ThemePreference,
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

function AuditTable({ audit }: { audit: Audit }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Build versus sheet</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Statistic</TableHead>
              <TableHead className="text-right">Build</TableHead>
              <TableHead className="text-right">Sheet</TableHead>
              <TableHead className="text-right">Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {audit.rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium capitalize">{row.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.expected === null ? "-" : row.expected}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.actual}</TableCell>
                <TableCell className="text-right">
                  {row.residual === null ? (
                    <span className="text-muted-foreground">-</span>
                  ) : row.residual === 0 ? (
                    <span className="text-muted-foreground/50">0</span>
                  ) : (
                    <Badge variant="destructive">
                      {row.residual > 0 ? "+" : ""}
                      {row.residual}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function App() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [slug, setSlug] = useState<string>("");
  const [character, setCharacter] = useState<Character | null>(null);
  const [hasNativeExport, setHasNativeExport] = useState(false);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [running, setRunning] = useState<ToolCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [themeError, setThemeError] = useState<string | null>(null);

  const load = useCallback(async (target: string) => {
    try {
      const [result, sheet, savedRuns] = await Promise.all([fetchCharacter(target), fetchSheet(target), fetchToolRuns(target)]);
      setCharacter(result.character);
      setAudit(result.audit);
      setHasNativeExport(result.hasNativeExport ?? false);
      setMarkdown(sheet);
      setRuns(savedRuns.runs);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchThemePreference()
      .then(({ theme }) => {
        if (active) setThemePreference(theme);
      })
      .catch((themeLoadError) => {
        if (active) setThemeError(themeLoadError instanceof Error ? themeLoadError.message : String(themeLoadError));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.classList.toggle("dark", themePreference === "dark" || (themePreference === "system" && media.matches));
    apply();
    if (themePreference !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themePreference]);

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

  async function handleThemeToggle() {
    const isDark = themePreference === "dark" || (themePreference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    setThemePreference(next);
    setThemeError(null);
    try {
      await saveThemePreference(next);
    } catch (saveError) {
      setThemeError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }

  function handleCharacterSaved(result: { character: Character; audit: Audit; hasNativeExport: boolean }) {
    setCharacter(result.character);
    setAudit(result.audit);
    setHasNativeExport(result.hasNativeExport);
    setError(null);
    void fetchSheet(slug).then(setMarkdown).catch((sheetError) => setError(String(sheetError)));
    void fetchCharacters().then(setCharacters).catch((listError) => setError(String(listError)));
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
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="mr-auto flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Boxes className="size-5" />
            </div>
            <div>
              <h1 className="text-base leading-tight font-semibold">Character workshop</h1>
              <p className="text-muted-foreground text-xs">Build, reference, and prepare Foundry actors</p>
            </div>
          </div>

          <Select value={slug} onValueChange={handleSelect}>
            <SelectTrigger className="w-full sm:w-72">
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
          <Button variant="outline" size="icon" onClick={() => void handleThemeToggle()} aria-label="Toggle dark mode" title="Toggle dark mode">
            {themePreference === "dark" || (themePreference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
              ? <Sun className="size-4" />
              : <Moon className="size-4" />}
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[100rem] gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {error && (
            <Card className="mb-4 border-destructive/50">
              <CardContent className="text-destructive flex items-center gap-2 text-sm">
                <TriangleAlert className="size-4 shrink-0" />
                {error}
              </CardContent>
            </Card>
          )}
          {themeError && <p role="status" className="text-muted-foreground mb-3 text-xs">Theme preference could not be saved: {themeError}</p>}

          {running && (
            <div role="status" className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
              <LoaderCircle className="size-4" />
              Running {running}…
            </div>
          )}

          {!character || !audit ? (
            <Card>
              <CardContent className="text-muted-foreground flex min-h-72 items-center justify-center gap-2 text-sm">
                <LoaderCircle className="size-4" />
                {characters.length === 0 ? "No characters found. Add a character folder to begin." : "Loading character…"}
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="sheet" orientation="vertical" className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
              <TabsList className="sticky top-[4.5rem] z-10 grid h-auto w-full grid-cols-3 justify-start gap-1 border bg-background/95 p-2 shadow-sm backdrop-blur lg:top-24 lg:flex lg:w-48 lg:flex-col lg:items-stretch lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
                <TabsTrigger value="sheet" className="justify-start gap-2 px-3 py-2"><ScrollText />Overview</TabsTrigger>
                <TabsTrigger value="edit" className="justify-start gap-2 px-3 py-2"><FileJson />Edit</TabsTrigger>
                <TabsTrigger value="learn" className="justify-start gap-2 px-3 py-2"><BookOpen />Learn</TabsTrigger>
                <TabsTrigger value="ask" className="justify-start gap-2 px-3 py-2"><Bot />Ask</TabsTrigger>
                <TabsTrigger value="chat" className="justify-start gap-2 px-3 py-2"><MessagesSquare />Chat</TabsTrigger>
                <TabsTrigger value="records" className="justify-start gap-2 px-3 py-2">Records</TabsTrigger>
              </TabsList>

              <div className="min-w-0 flex-1">
                <TabsContent value="sheet" className="mt-0 space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-muted-foreground text-sm">{character.identity.ancestry} {character.identity.class} · level {character.identity.level}</p>
                      <h2 className="text-2xl font-semibold tracking-tight">{character.name}</h2>
                    </div>
                    <Badge variant={audit.mismatches.length ? "destructive" : "secondary"}>
                      {audit.mismatches.length ? `${audit.mismatches.length} audit mismatches` : "Build matches sheet"}
                    </Badge>
                  </div>
                  <CharacterSheet character={character} audit={audit} />
                </TabsContent>

                <TabsContent value="edit" className="mt-0">
                  <CharacterEditor key={slug} slug={slug} character={character} hasNativeExport={hasNativeExport} onSaved={handleCharacterSaved} />
                </TabsContent>

                <TabsContent value="learn" className="mt-0">
                  <PathfinderLibrary />
                </TabsContent>

                <TabsContent value="ask" className="mt-0">
                  <AskPanel slug={slug} characterName={character.name} />
                </TabsContent>

                <TabsContent value="chat" className="mt-0">
                  <ChatPanel />
                </TabsContent>

                <TabsContent value="records" className="mt-0">
                  <Tabs defaultValue="audit" className="space-y-4">
                    <TabsList variant="line" className="w-full justify-start overflow-x-auto">
                      <TabsTrigger value="audit">Audit</TabsTrigger>
                      <TabsTrigger value="bonuses">Bonuses</TabsTrigger>
                      <TabsTrigger value="markdown">Readable sheet</TabsTrigger>
                    </TabsList>
                    <TabsContent value="audit" className="space-y-4">
                      <AuditSummary audit={audit} />
                      <AuditTable audit={audit} />
                    </TabsContent>
                    <TabsContent value="bonuses">
                      <Card>
                        <CardHeader><CardTitle>Declared bonuses</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                          {(character.bonuses ?? []).map((bonus) => (
                            <div key={bonus.id} className="rounded-lg border p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-medium">{bonus.id}</span>
                                <Badge variant={bonus.source === "unattributed" ? "destructive" : "outline"}>{bonus.source}</Badge>
                                <Badge variant="secondary">{bonus.value >= 0 ? "+" : ""}{bonus.value}</Badge>
                              </div>
                              {bonus.note && <p className="text-muted-foreground mt-2 text-sm">{bonus.note}</p>}
                              <p className="text-muted-foreground mt-2 font-mono text-xs">Applies to {bonus.appliesTo.join(", ")}</p>
                            </div>
                          ))}
                          {(character.bonuses ?? []).length === 0 && <p className="text-muted-foreground text-sm">No declared bonuses.</p>}
                        </CardContent>
                      </Card>
                    </TabsContent>
                    <TabsContent value="markdown">
                      <Card>
                        <CardContent>
                          <pre className="max-h-[70vh] overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap">{markdown || "Run Render to generate the markdown sheet."}</pre>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <RunPanel runs={runs} running={running} onRun={handleRun} />
        </aside>
      </main>
    </div>
  );
}
