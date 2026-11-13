import { useEffect, useRef, useState } from "react";
import { Bot } from "@/components/animate-ui/icons/bot";
import { LoaderCircle } from "@/components/animate-ui/icons/loader-circle";
import { Send } from "@/components/animate-ui/icons/send";
import { TriangleAlert } from "@/components/animate-ui/icons/triangle-alert";
import { Sparkles, Square } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";

import {
  fetchChatModels,
  fetchChatSession,
  fetchChatStatus,
  fetchOpenAiModels,
  deleteChatSession,
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
      <div className="max-w-[min(85%,48rem)] space-y-1.5">
        <p className={`px-1 text-[11px] font-medium ${mine ? "text-right text-muted-foreground" : "text-muted-foreground"}`}>
          {mine ? "You" : "Assistant"}
        </p>
        <div className={mine
          ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
          : "bg-muted/70 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"}>
          {content}
        </div>
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
  const [conversationLoaded, setConversationLoaded] = useState(false);
  const [info, setInfo] = useState<ChatStatus | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState<"opencode" | "openai">("opencode");
  const [openAiModels, setOpenAiModels] = useState<{ id: string; name: string }[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([fetchChatStatus(), fetchChatModels(), fetchChatSession()]).then(async ([statusResult, modelsResult, sessionResult]) => {
      if (!active) return;

      const status = statusResult.status === "fulfilled" ? statusResult.value : null;
      if (status) setInfo(status);

      if (modelsResult.status === "fulfilled") {
        const list = modelsResult.value.models;
        setModels(list);
        const preferred =
          list.find((entry) => entry.id === status?.providers.opencode.model) ??
          list.find((entry) => entry.free) ??
          list[0];
        setModel(preferred?.id ?? "");
      }
      if (sessionResult.status === "fulfilled" && sessionResult.value.session) {
        const session = sessionResult.value.session;
        setTurns(session.messages.map(({ role, content }) => newTurn(role, content)));
        setSessionId(session.id);
        setProvider(session.provider);
        setModel(session.model);
      }
      if (status?.providerSelection) {
        try {
          const openAiResult = await fetchOpenAiModels();
          if (active) setOpenAiModels(openAiResult.models);
        } catch {
          if (active) setOpenAiModels([]);
        }
      }
      if (active) setConversationLoaded(true);
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
    setStatus(`Connecting to ${provider === "openai" ? "OpenAI" : "OpenCode Zen"}…`);
    setPending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        [...history, { role: "user", content: trimmed }],
        provider,
        model || undefined,
        sessionId,
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

  async function handleClear() {
    const previousSession = sessionId;
    setTurns([]);
    setError(null);
    setStatus(null);
    setSessionId(crypto.randomUUID());
    try {
      await deleteChatSession(previousSession);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  }

  const lastId = turns.at(-1)?.id;
  const activeModels = provider === "openai" ? openAiModels : models;
  const selected = models.find((entry) => entry.id === model);
  const providerStatus = info?.providers[provider];

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base">AI workspace</CardTitle>
              <p className="text-muted-foreground mt-0.5 text-xs">Choose a provider and model for this conversation</p>
            </div>
          </div>
          {providerStatus && (
            <Badge variant={providerStatus.configured ? "secondary" : "outline"} className="gap-1.5 font-normal">
              <span className={`size-1.5 rounded-full ${providerStatus.configured ? "bg-emerald-500" : "bg-muted-foreground"}`} />
              {providerStatus.configured ? "Connected" : "Not configured"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {providerStatus && !providerStatus.configured && (
          <p className="text-destructive flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {provider === "openai" ? (
                <>OpenAI is not configured. Add <code>OPENAI_API_KEY</code> to your server environment and restart.</>
              ) : (
                <>OpenCode Zen is not configured. Add <code>OPENCODE_ZEN_API_KEY</code> to <code>.env</code> and restart.</>
              )}
            </span>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-[minmax(11rem,0.7fr)_minmax(17rem,1.3fr)] sm:items-end">
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-medium" htmlFor="chat-provider">Provider</label>
            <Select value={provider} onValueChange={(value) => {
              const next = value as "opencode" | "openai";
              setProvider(next);
              setModel(next === "openai" ? openAiModels.find((entry) => entry.id === "gpt-4.1-mini")?.id ?? openAiModels[0]?.id ?? "" : info?.providers.opencode.model ?? "");
            }} disabled={pending}>
              <SelectTrigger id="chat-provider" className="h-10 w-full bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="opencode">OpenCode Zen{info?.providers.opencode.plan === "go" ? " · Go" : ""}</SelectItem>
                <SelectItem value="openai" disabled={!info?.providers.openai.configured}>OpenAI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-medium" htmlFor="chat-model">Model</label>
            <Select value={model} onValueChange={setModel} disabled={pending || activeModels.length === 0}>
              <SelectTrigger id="chat-model" className="h-10 w-full bg-background"><SelectValue placeholder={activeModels.length ? "Select a model" : "No models available"} /></SelectTrigger>
              <SelectContent>
                {provider === "opencode" ? (
                  <>
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">OpenCode Zen · {info?.providers.opencode.plan === "go" ? "Go catalog" : "Pay as you go"} · {models.length} models</div>
                    {models.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name}{entry.free ? " · free" : ""}</SelectItem>)}
                  </>
                ) : (
                  <>
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">OpenAI models</div>
                    {openAiModels.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          {provider === "opencode" && selected && <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            {selected.free && <Badge variant="secondary">free</Badge>}
            {selected.context && <span className="text-muted-foreground text-xs">{Math.round(selected.context / 1000)}K context</span>}
            {selected.reasoning && <Badge variant="outline">reasoning</Badge>}
            <span className="text-muted-foreground ml-auto text-xs">{models.length} models available</span>
          </div>}
        </div>

        <ScrollArea className="h-[min(56vh,36rem)] min-h-[22rem] rounded-xl border bg-background p-4 sm:p-6">
          {turns.length === 0 ? (
            <div className="mx-auto flex h-full min-h-[19rem] max-w-xl flex-col items-center justify-center py-8 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/5 text-primary">
                <Sparkles className="size-5" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight">What would you like to explore?</h3>
              <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
                Ask {provider === "openai" ? "OpenAI" : "OpenCode Zen"} about an idea, get help understanding a rule, or compare approaches.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {["Explain a tricky rule simply", "Help me brainstorm an idea", "Compare two possible approaches"].map((prompt) => (
                  <Button key={prompt} variant="outline" size="sm" className="h-auto whitespace-normal rounded-full px-3 py-2 text-xs" onClick={() => setInput(prompt)}>
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 pr-3">
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
          <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4" />
            {status}
          </p>
        )}

        {error && (
          <p role="alert" className="text-destructive flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="space-y-2 rounded-xl border bg-muted/20 p-3 sm:p-4">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={`Ask ${provider === "openai" ? "OpenAI" : "OpenCode Zen"} anything…`}
            className="min-h-24 resize-y border-0 bg-transparent shadow-none focus-visible:ring-0"
            rows={3}
            disabled={pending}
          />
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
              <Button size="sm" className="ml-auto" onClick={() => void handleSend()} disabled={!conversationLoaded || pending || !input.trim()}>
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
                onClick={() => void handleClear()}
                disabled={turns.length === 0}
              >
                Clear
              </Button>
            )}
            <span className="text-muted-foreground order-first text-xs sm:order-none">Ctrl+Enter to send</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
