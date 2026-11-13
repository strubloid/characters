import { useEffect, useRef, useState } from "react";
import { Bot } from "@/components/animate-ui/icons/bot";
import { LoaderCircle } from "@/components/animate-ui/icons/loader-circle";
import { Send } from "@/components/animate-ui/icons/send";
import { TriangleAlert } from "@/components/animate-ui/icons/triangle-alert";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

import { askCharacter, fetchQuestions, type CharacterQuestion } from "@/lib/api";

function when(iso: string): string {
  return new Date(iso).toLocaleString();
}

function QuestionEntry({ entry, pending = false }: { entry: CharacterQuestion; pending?: boolean }) {
  return (
    <article className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[min(85%,48rem)] space-y-1.5">
          <p className="px-1 text-right text-[11px] font-medium text-muted-foreground">
            You <span className="font-normal">· {when(entry.askedAt)}</span>
          </p>
          <p className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
            {entry.question}
          </p>
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[min(85%,48rem)] space-y-1.5">
          <div className="flex items-center gap-2 px-1">
            <Badge variant="outline" className="font-normal">{entry.agent}</Badge>
            {entry.status === "error" && <Badge variant="destructive">failed</Badge>}
          </div>
          {entry.answer || pending ? (
            <p className="bg-muted/70 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
              {entry.answer || "Thinking…"}
            </p>
          ) : (
            <p className="text-destructive flex items-center gap-1.5 rounded-2xl bg-destructive/5 px-4 py-3 text-sm">
              <TriangleAlert className="size-4 shrink-0" />
              {entry.error ?? "No answer was recorded."}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export function AskPanel({ slug, characterName }: { slug: string; characterName: string }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<CharacterQuestion[]>([]);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const [pending, setPending] = useState<{ question: string; answer: string; askedAt: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<{ slug: string; message: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    fetchQuestions(slug)
      .then((result) => {
        if (active) setHistory(result.questions);
      })
      .catch((loadError) => {
        if (active) setError({ slug, message: loadError instanceof Error ? loadError.message : String(loadError) });
      })
      .finally(() => {
        if (active) setLoadedSlug(slug);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [history, pending, status]);

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    setQuestion("");
    setError(null);
    setStatus("Asking…");
    setPending({ question: trimmed, answer: "", askedAt: new Date().toISOString() });

    try {
      await askCharacter(slug, trimmed, (event) => {
        if (event.type === "status") setStatus(event.message);
        else if (event.type === "text") {
          setPending((current) => (current ? { ...current, answer: event.text } : current));
        } else if (event.type === "done") {
          setPending(null);
          setStatus(null);
          setHistory((previous) => [event.question, ...previous]);
        } else if (event.type === "error") {
          setPending(null);
          setStatus(null);
          setError({ slug, message: event.message });
          const failed = event.question;
          if (failed) setHistory((previous) => [failed, ...previous]);
        }
      });
    } catch (askError) {
      setPending(null);
      setStatus(null);
      setError({ slug, message: askError instanceof Error ? askError.message : String(askError) });
    }
  }

  const historyLoading = loadedSlug !== slug;
  const visibleHistory = historyLoading ? [] : history;
  const visibleError = error?.slug === slug ? error.message : null;

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base">Ask {characterName}</CardTitle>
              <p className="text-muted-foreground mt-0.5 text-xs">Character sheet and audit are included with every question</p>
            </div>
          </div>
          <Badge variant="outline" className="font-normal">SQLite history</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Conversation</h3>
          {visibleHistory.length > 0 && <span className="text-muted-foreground text-xs">{visibleHistory.length} saved {visibleHistory.length === 1 ? "exchange" : "exchanges"}</span>}
        </div>

        <ScrollArea className="h-[min(56vh,36rem)] min-h-[22rem] rounded-xl border bg-background p-4 sm:p-6">
          {historyLoading ? (
            <div className="text-muted-foreground flex min-h-[19rem] items-center justify-center gap-2 text-sm">
              <LoaderCircle className="size-4" />
              Loading this character’s conversation…
            </div>
          ) : visibleHistory.length === 0 && !pending ? (
            <div className="mx-auto flex min-h-[19rem] max-w-xl flex-col items-center justify-center py-8 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/5 text-primary">
                <Sparkles className="size-5" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight">What would you like to know about {characterName}?</h3>
              <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
                I’ll use the character sheet and audit as context, so you can ask about build choices, statistics, or open questions.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {["Summarize the character’s strengths", "Explain an audit mismatch", "What build questions are still open?"].map((prompt) => (
                  <Button key={prompt} variant="outline" size="sm" className="h-auto whitespace-normal rounded-full px-3 py-2 text-xs" onClick={() => setQuestion(prompt)}>
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 pr-3">
              {[...visibleHistory].reverse().map((entry) => <QuestionEntry key={entry.id} entry={entry} />)}
              {pending && (
                <QuestionEntry
                  entry={{
                    id: "pending",
                    question: pending.question,
                    answer: pending.answer,
                    askedAt: pending.askedAt,
                    agent: "Assistant",
                    status: "answered",
                    durationMs: 0,
                  }}
                  pending
                />
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {status && (
          <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4" />
            {status}
          </p>
        )}

        {visibleError && (
          <p role="alert" className="text-destructive flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {visibleError}
          </p>
        )}

        <div className="space-y-2 rounded-xl border bg-muted/20 p-3 sm:p-4">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleAsk();
              }
            }}
            placeholder={`Ask anything about ${characterName}…`}
            aria-label={`Ask a question about ${characterName}`}
            className="min-h-24 resize-y border-0 bg-transparent shadow-none focus-visible:ring-0"
            rows={3}
            disabled={pending !== null}
          />
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <span className="text-muted-foreground order-first text-xs">Ctrl+Enter to send</span>
            <Button size="sm" className="ml-auto" onClick={handleAsk} disabled={pending !== null || !question.trim()}>
              {pending ? <LoaderCircle className="size-4" /> : <Send className="size-4" />}
              Ask
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
