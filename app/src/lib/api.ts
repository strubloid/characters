export type Rank = "untrained" | "trained" | "expert" | "master" | "legendary";

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface Feature {
  name: string;
  level?: number;
  source?: string;
  summary?: string;
  notes?: string;
  automated?: boolean;
}

export interface FeatureGroups {
  ancestry?: Feature[];
  class?: Feature[];
  ancestryFeats?: Feature[];
  classFeats?: Feature[];
  archetypeFeats?: Feature[];
  skillFeats?: Feature[];
  generalFeats?: Feature[];
  bonusFeats?: Feature[];
}

export interface InventoryItem {
  name: string;
  type: string;
  quantity?: number;
  bulk?: number;
  equipped?: boolean;
  level?: number;
  price?: number;
  traits?: string[];
  notes?: string;
}

export interface OpenQuestion {
  id: string;
  question: string;
  why?: string;
  status: "open" | "resolved" | "wontfix";
  answer?: string;
}

export interface Character {
  id: string;
  name: string;
  summary?: string;
  identity: {
    ancestry: string;
    heritage?: string | null;
    background?: string | null;
    class: string;
    archetype?: { name: string; level: number } | null;
    deity?: string | null;
    level: number;
    xp?: { value: number; max: number };
    age?: string;
    gender?: string;
    ethnicity?: string;
    nationality?: string;
    languages?: string[];
  };
  build: {
    keyAbility: AbilityKey;
    abilities: Record<AbilityKey, { score: number; mod?: number }>;
    hp: { max: number; value?: number; temp?: number };
    armor?: { category?: string; acBonus?: number; dexCap?: number | null };
    speed?: { land: number; swim?: number | null; climb?: number | null };
    senses?: { name: string; range?: number | null }[];
  };
  proficiencies: {
    saves: Record<string, Rank>;
    perception: Rank;
    classDC?: Record<string, Rank>;
    skills: Record<string, Rank>;
    attacks?: Record<string, Rank>;
    defenses?: Record<string, Rank>;
  };
  resources?: { heroPoints?: { value: number; max: number } };
  bonuses?: {
    id: string;
    source: string;
    note?: string;
    value: number;
    type: string;
    requiresRank?: boolean;
    appliesTo: string[];
  }[];
  features: FeatureGroups;
  actions?: {
    actions?: { name: string; actionCost?: string; summary?: string }[];
    reactions?: { name: string; actionCost?: string; summary?: string }[];
    freeActions?: { name: string; actionCost?: string; summary?: string }[];
  };
  inventory: InventoryItem[];
  currency?: { pp: number; gp: number; sp: number; cp: number; totalWealthGp: number };
  observed?: {
    source?: string;
    ac?: number;
    hitPoints?: number;
    notes?: string;
  };
  audit?: {
    openQuestions?: OpenQuestion[];
    notes?: string;
  };
}

export interface AuditRow {
  key: string;
  label: string;
  expected: number | null;
  actual: number;
  residual: number | null;
}

export interface Audit {
  rows: AuditRow[];
  mismatches: AuditRow[];
  openQuestions: OpenQuestion[];
  total: number;
  checked: number;
}

export interface CharacterSummary {
  slug: string;
  name: string;
  ancestry?: string;
  class?: string;
  level?: number;
}

export type ToolCommand = "validate" | "audit" | "render" | "build" | "check";

export interface ToolRun {
  command: ToolCommand;
  slug: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  finishedAt: string;
}

export interface CharacterQuestion {
  id: string;
  question: string;
  answer: string;
  askedAt: string;
  agent: string;
  status: "answered" | "error";
  error?: string;
  durationMs: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function fetchCharacters(): Promise<CharacterSummary[]> {
  return request<CharacterSummary[]>("/api/characters");
}

export function fetchCharacter(slug: string): Promise<{ character: Character; audit: Audit }> {
  return request<{ character: Character; audit: Audit }>(`/api/characters/${slug}`);
}

export function fetchSheet(slug: string): Promise<string> {
  return fetch(`/api/characters/${slug}/sheet`).then((response) => response.text());
}

export function runTool(slug: string, command: ToolCommand): Promise<ToolRun> {
  return request<ToolRun>(`/api/characters/${slug}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
}

export function fetchQuestions(slug: string): Promise<{ questions: CharacterQuestion[] }> {
  return request<{ questions: CharacterQuestion[] }>(`/api/characters/${slug}/questions`);
}

async function readSse<T>(response: Response, onEvent: (event: T) => void): Promise<void> {
  if (!response.ok || !response.body) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let name = "message";
      const data: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (data.length > 0) {
        onEvent({ type: name, ...JSON.parse(data.join("\n")) } as T);
      }

      boundary = buffer.indexOf("\n\n");
    }
  }
}

export type AskEvent =
  | { type: "status"; message: string }
  | { type: "text"; text: string }
  | { type: "done"; question: CharacterQuestion }
  | { type: "error"; message: string; question?: CharacterQuestion };

/**
 * Ask the opencode agent about a character, streaming the answer as it lands.
 */
export async function askCharacter(
  slug: string,
  question: string,
  onEvent: (event: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/characters/${slug}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });

  await readSse<AskEvent>(response, onEvent);
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatStatus {
  configured: boolean;
  model: string;
  plan: "go" | "payg";
  baseUrl: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  context: number | null;
  maxOutput: number | null;
  modalities: string[];
  reasoning: boolean;
  free: boolean;
  inputPrice: number;
  outputPrice: number;
}

export type ChatEvent =
  | { type: "status"; message: string }
  | { type: "delta"; delta: string; text: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

export function fetchChatStatus(): Promise<ChatStatus> {
  return request<ChatStatus>("/api/chat/status");
}

export function fetchChatModels(): Promise<{ plan: "go" | "payg"; models: ModelInfo[] }> {
  return request<{ plan: "go" | "payg"; models: ModelInfo[] }>("/api/chat/models");
}

/**
 * Talk to Big Pickle over OpenCode Zen, streaming tokens back as they arrive.
 */
export async function streamChat(
  messages: ChatMessage[],
  model: string | undefined,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model }),
    signal,
  });

  await readSse<ChatEvent>(response, onEvent);
}
