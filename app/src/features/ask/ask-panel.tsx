import { useEffect, useState } from "react";
import { Bot } from "@/components/animate-ui/icons/bot";
import { LoaderCircle } from "@/components/animate-ui/icons/loader-circle";
import { Send } from "@/components/animate-ui/icons/send";
import { TriangleAlert } from "@/components/animate-ui/icons/triangle-alert";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import { askCharacter, fetchQuestions, type CharacterQuestion } from "@/lib/api";

function when(iso: string): string {
  return new Date(iso).toLocaleString();
}

function QuestionEntry({ entry }: { entry: CharacterQuestion }) {
  return (
    <div className="py-3">
      <div className="flex items-baseline gap-2">
        <Badge variant="outline" className="shrink-0">
          {entry.agent}
        </Badge>
        <span className="text-xs text-muted-foreground">{when(entry.askedAt)}</span>
        {entry.status === "error" && (
          <Badge variant="destructive" className="shrink-0">
            failed
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-sm font-medium">{entry.question}</p>
      {entry.answer ? (
        <p className="mt-1.5 text-sm whitespace-pre-wrap">{entry.answer}</p>
      ) : (
        <p className="text-destructive mt-1.5 flex items-center gap-1.5 text-sm">
          <TriangleAlert className="size-4" />
          {entry.error ?? "No answer was recorded."}
        </p>
      )}
    </div>
  );
}

export function AskPanel({ slug }: { slug: string }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<CharacterQuestion[]>([]);
  const [pending, setPending] = useState<{ question: string; answer: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchQuestions(slug)
      .then((result) => {
        if (active) setHistory(result.questions);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      });
    return () => {
      active = false;
    };
  }, [slug]);

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    setQuestion("");
    setError(null);
    setStatus("Asking…");
    setPending({ question: trimmed, answer: "" });

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
          setError(event.message);
          const failed = event.question;
          if (failed) setHistory((previous) => [failed, ...previous]);
        }
      });
    } catch (askError) {
      setPending(null);
      setStatus(null);
      setError(askError instanceof Error ? askError.message : String(askError));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot />
          Ask about this character
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleAsk();
              }
            }}
            placeholder="Why is this character's Athletics two points lower than the other untrained skills?"
            rows={3}
            disabled={pending !== null}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleAsk} disabled={pending !== null || !question.trim()}>
              {pending ? <LoaderCircle className="size-4" /> : <Send className="size-4" />}
              Ask
            </Button>
            <span className="text-muted-foreground text-xs">
              The answer is saved with the character. Ctrl+Enter to send.
            </span>
          </div>
        </div>

        {status && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4" />
            {status}
          </p>
        )}

        {error && (
          <p className="text-destructive flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        {pending && (
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">{pending.question}</p>
            <p className="text-muted-foreground mt-1.5 text-sm whitespace-pre-wrap">
              {pending.answer || "Thinking…"}
            </p>
          </div>
        )}

        <Separator />

        <div>
          <h3 className="text-muted-foreground mb-1 text-xs tracking-wide uppercase">
            Saved questions
          </h3>
          <ScrollArea className="h-[36rem] pr-3">
            {history.length === 0 ? (
              <p className="text-muted-foreground py-4 text-sm">
                Nothing asked yet. Questions and answers are stored in{" "}
                <code>characters/{slug}/questions.json</code>.
              </p>
            ) : (
              history.map((entry) => <QuestionEntry key={entry.id} entry={entry} />)
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
