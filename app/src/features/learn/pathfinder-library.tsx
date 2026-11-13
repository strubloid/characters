import { useEffect, useState } from "react";
import { BookOpen, Bookmark, ExternalLink, LoaderCircle, Search, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  fetchPathfinderProgress,
  fetchPathfinderTopics,
  savePathfinderProgress,
  type PathfinderProgress,
  type PathfinderTopic,
} from "@/lib/api";

export function PathfinderLibrary() {
  const [topics, setTopics] = useState<PathfinderTopic[]>([]);
  const [progress, setProgress] = useState<Record<string, PathfinderProgress>>({});
  const [selectedId, setSelectedId] = useState("three-actions");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetchPathfinderTopics(), fetchPathfinderProgress()])
      .then(([catalog, stored]) => {
        if (!active) return;
        setTopics(catalog.topics);
        setProgress(stored.progress);
        const firstTopic = catalog.topics.find((entry) => entry.id === "three-actions") ?? catalog.topics[0];
        if (firstTopic) {
          setSelectedId(firstTopic.id);
          setNote(stored.progress[firstTopic.id]?.note ?? "");
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = [...new Set(topics.map((topic) => topic.category))];
  const filtered = topics.filter((topic) => {
    const searchText = `${topic.title} ${topic.summary} ${topic.content} ${topic.category}`.toLowerCase();
    return (category === "all" || topic.category === category) && searchText.includes(query.trim().toLowerCase());
  });
  const selected = topics.find((topic) => topic.id === selectedId) ?? filtered[0] ?? null;
  const selectedProgress = selected ? progress[selected.id] : undefined;

  function handleSelect(topic: PathfinderTopic) {
    setSelectedId(topic.id);
    setNote(progress[topic.id]?.note ?? "");
    setSaved(false);
  }

  async function persistProgress(next: PathfinderProgress) {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await savePathfinderProgress(selected.id, next);
      setProgress(result.progress);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight">Pathfinder field guide</h2>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Study the rules, keep personal notes in SQLite, and follow each topic to the full Archives of Nethys reference.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <Card className="min-h-[34rem] overflow-hidden">
          <CardHeader className="gap-3 border-b bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="size-4" />
              Rules library
              {topics.length > 0 && <Badge variant="secondary" className="ml-auto">{filtered.length} / {topics.length}</Badge>}
            </CardTitle>
            <div className="relative">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the guide" className="pl-9" aria-label="Search Pathfinder topics" />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Filter Pathfinder topics by category"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((entry) => <SelectItem key={entry} value={entry}>{entry}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <ScrollArea className="h-[28rem] xl:h-[calc(100vh-27rem)] xl:min-h-96">
            <nav aria-label="Pathfinder topics" className="space-y-1 p-2">
              {loading ? (
                <p role="status" className="text-muted-foreground flex items-center gap-2 p-3 text-sm"><LoaderCircle className="size-4" />Loading the field guide…</p>
              ) : error && topics.length === 0 ? (
                <p role="alert" className="text-destructive flex items-center gap-2 p-3 text-sm"><TriangleAlert className="size-4" />{error}</p>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">No topics match this search.</p>
              ) : filtered.map((topic) => (
                <Button
                  key={topic.id}
                  variant={topic.id === selected?.id ? "secondary" : "ghost"}
                  className="h-auto w-full justify-start whitespace-normal px-3 py-3 text-left"
                  onClick={() => handleSelect(topic)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{topic.title}</span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">{topic.category}</span>
                  </span>
                  {progress[topic.id]?.bookmarked && <Bookmark className="size-4 fill-current" aria-label="Bookmarked" />}
                </Button>
              ))}
            </nav>
          </ScrollArea>
        </Card>

        {selected ? (
          <Card className="min-h-[34rem]">
            <CardHeader className="border-b bg-muted/20 sm:px-6 sm:py-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{selected.category}</Badge>
                {selectedProgress?.bookmarked && <Badge variant="secondary">Saved topic</Badge>}
              </div>
              <CardTitle className="mt-2 text-xl">{selected.title}</CardTitle>
              <p className="text-muted-foreground text-sm">{selected.summary}</p>
            </CardHeader>
            <CardContent className="space-y-6 p-4 sm:p-6">
              <p className="max-w-3xl text-sm leading-7 text-pretty">{selected.content}</p>
              <a href={selected.url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline">
                Read {selected.source} at Archives of Nethys <ExternalLink className="size-4" />
              </a>
              <div className="space-y-2 border-t pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label htmlFor="pathfinder-note" className="text-sm font-medium">Your notes</label>
                  <Button
                    variant={selectedProgress?.bookmarked ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => void persistProgress({ bookmarked: !selectedProgress?.bookmarked, note })}
                    disabled={saving}
                  >
                    <Bookmark className={`size-4 ${selectedProgress?.bookmarked ? "fill-current" : ""}`} />
                    {selectedProgress?.bookmarked ? "Bookmarked" : "Bookmark topic"}
                  </Button>
                </div>
                <Textarea
                  id="pathfinder-note"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setSaved(false);
                  }}
                  placeholder="Write a reminder, table ruling, or example to revisit…"
                  rows={4}
                />
                <div className="flex items-center justify-between gap-3">
                  <span role="status" className="text-muted-foreground text-xs">{saved ? "Saved in SQLite" : "Notes stay with this workspace"}</span>
                  <Button size="sm" onClick={() => void persistProgress({ bookmarked: Boolean(selectedProgress?.bookmarked), note })} disabled={saving || (saved && note === (selectedProgress?.note ?? ""))}>
                    {saving ? "Saving…" : "Save note"}
                  </Button>
                </div>
              </div>
              {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="text-muted-foreground flex min-h-64 items-center justify-center text-sm">Choose a topic to begin.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
