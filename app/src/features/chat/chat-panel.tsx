import { useEffect, useRef, useState } from "react";
import { Bot } from "@/components/animate-ui/icons/bot";
import { LoaderCircle } from "@/components/animate-ui/icons/loader-circle";
import { Send } from "@/components/animate-ui/icons/send";
import { TriangleAlert } from "@/components/animate-ui/icons/triangle-alert";
import { Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import {
  fetchChatModels,
  fetchChatStatus,
  streamChat,
  type ChatMessage,
  type ChatStatus,
  type ModelInfo,
} from "@/lib/api";

type Turn = ChatMessage & { id: string };

function newTurn(role: ChatMessage["role"], content: string): Turn {
  return { id: crypto.randomUUID(), role, content };
}

function Bubble({ role, content }: { role: ChatMessage["role"]; content: string }) {
  const mine = role === "user";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          mine
            ? "bg-primary text-primary-foreground max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
            : "bg-muted max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
        }
      >
        {content}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [info, setInfo] = useState<ChatStatus | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([fetchChatStatus(), fetchChatModels()]).then(([statusResult, modelsResult]) => {
      if (!active) return;

      const status = statusResult.status === "fulfilled" ? statusResult.value : null;
      if (status) setInfo(status);

      if (modelsResult.status === "fulfilled") {
        const list = modelsResult.value.models;
        setModels(list);
        const preferred =
          list.find((entry) => entry.id === status?.model) ??
          list.find((entry) => entry.free) ??
          list[0];
        setModel(preferred?.id ?? "");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns, status]);

  function setLast(content: string) {
    setTurns((current) => {
      const next = [...current];
      next[next.length - 1] = { ...next[next.length - 1], content };
      return next;
    });
  }

  function handleStop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPending(false);
    setStatus(null);
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || pending) return;

    const history = turns.map(({ role, content }) => ({ role, content }));
    setTurns((current) => [...current, newTurn("user", trimmed), newTurn("assistant", "")]);
    setInput("");
    setError(null);
    setStatus("Connecting to Big Pickle…");
    setPending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        [...history, { role: "user", content: trimmed }],
        model || undefined,
        (event) => {
          if (event.type === "status") {
            setStatus(event.message);
          } else if (event.type === "delta") {
            setStatus(null);
            setLast(event.text);
          } else if (event.type === "done") {
            setLast(event.text);
          } else if (event.type === "error") {
            setError(event.message);
            setTurns((current) => current.slice(0, -1));
          }
        },
        controller.signal,
      );
    } catch (sendError) {
      if (!controller.signal.aborted) {
        setError(sendError instanceof Error ? sendError.message : String(sendError));
        setTurns((current) => current.slice(0, -1));
      }
    } finally {
      abortRef.current = null;
      setPending(false);
      setStatus(null);
    }
  }

  function handleClear() {
    setTurns([]);
    setError(null);
    setStatus(null);
  }

  const lastId = turns.at(-1)?.id;
  const selected = models.find((entry) => entry.id === model);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot />
          Chat with Big Pickle
          {info && (
            <Badge variant="outline" className="ml-auto font-normal">
              {info.plan === "go" ? "Go" : "Pay-as-you-go"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {info && !info.configured && (
          <p className="text-destructive flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              No API key. Add <code>OPENCODE_ZEN_API_KEY</code> to <code>.env</code> (see{" "}
              <code>.env.example</code>) and restart the server.
            </span>
          </p>
        )}

        {models.length > 0 && (
          <div className="flex items-center gap-3">
            <Select value={model} onValueChange={setModel} disabled={pending}>
              <SelectTrigger className="w-full max-w-sm">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.free ? " · free" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected?.free && <Badge variant="secondary">free</Badge>}
            {selected?.context ? (
              <span className="text-muted-foreground text-xs">
                {Math.round(selected.context / 1000)}K context
              </span>
            ) : null}
          </div>
        )}

        <ScrollArea className="h-[32rem] rounded-lg border p-3">
          {turns.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Ask Big Pickle anything. The conversation stays in this tab.
            </p>
          ) : (
            <div className="space-y-3 pr-3">
              {turns.map((turn) => (
                <Bubble
                  key={turn.id}
                  role={turn.role}
                  content={turn.content || (pending && turn.id === lastId ? "Thinking…" : "")}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

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

        <Separator />

        <div className="space-y-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Ask Big Pickle anything…"
            rows={3}
            disabled={pending}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleSend} disabled={pending || !input.trim()}>
              {pending ? <LoaderCircle className="size-4" /> : <Send className="size-4" />}
              Send
            </Button>
            {pending ? (
              <Button size="sm" variant="outline" onClick={handleStop}>
                <Square className="size-4" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClear}
                disabled={turns.length === 0}
              >
                Clear
              </Button>
            )}
            <span className="text-muted-foreground text-xs">Ctrl+Enter to send.</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
