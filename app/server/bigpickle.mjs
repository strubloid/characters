/**
 * Big Pickle, spoken over OpenCode Zen's OpenAI-compatible Chat Completions API.
 *
 * Verified endpoint: https://opencode.ai/inference/openai/v1/chat/completions
 * (see docs/big-pickle.md for how this was checked and its limitations).
 *
 * The API key is read from the server environment only. It is never sent to,
 * or read by, the browser.
 */

const DEFAULT_INFERENCE_URL = "https://opencode.ai/inference";
const DEFAULT_MODEL = "big-pickle";

// Callers sometimes paste the full chat URL. Keep only the inference root.
function normalizeInferenceUrl(raw) {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/openai\/v1$/, "")
    .replace(/\/openai$/, "");
}

export function resolveInferenceUrl(env = process.env) {
  const explicit = env.OPENCODE_ZEN_BASE_URL?.trim();
  if (explicit) return normalizeInferenceUrl(explicit);

  // Pay-as-you-go and Go live under different roots (see docs/big-pickle.md).
  const plan = (env.OPENCODE_ZEN_PLAN ?? "").trim().toLowerCase();
  if (plan.startsWith("go")) return `${DEFAULT_INFERENCE_URL}/go`;

  return DEFAULT_INFERENCE_URL;
}

export function bigpickleConfig(env = process.env) {
  const inferenceUrl = resolveInferenceUrl(env);
  return {
    apiKey: env.OPENCODE_ZEN_API_KEY ?? "",
    plan: inferenceUrl.endsWith("/go") ? "go" : "payg",
    inferenceUrl,
    model: env.OPENCODE_ZEN_MODEL ?? DEFAULT_MODEL,
    chatUrl: `${inferenceUrl}/openai/v1/chat/completions`,
    modelsUrl: `${inferenceUrl}/v1/models`,
  };
}

export function buildChatBody(messages, { model, stream }) {
  return {
    model,
    messages: messages.map(({ role, content }) => ({ role, content })),
    stream,
  };
}

/**
 * Split a growing SSE buffer into complete `data:` payloads.
 *
 * Returns the payloads found plus the trailing bytes that are not yet a whole
 * event, so the caller can prepend them to the next chunk.
 */
export function parseSseBuffer(buffer) {
  const events = [];
  let rest = buffer;
  let boundary = rest.indexOf("\n\n");

  while (boundary !== -1) {
    const block = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);

    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload) events.push(payload);
    }

    boundary = rest.indexOf("\n\n");
  }

  return { events, rest };
}

export function deltaFromChunk(payload) {
  try {
    const parsed = JSON.parse(payload);
    return parsed.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}

async function describeError(response) {
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    raw = "";
  }

  let detail = raw;
  try {
    const parsed = JSON.parse(raw);
    detail = parsed?.error?.message ?? parsed?.error?.type ?? raw;
  } catch {
    // not JSON; keep the raw text
  }

  return `Big Pickle request failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}`;
}

function requestInit({ apiKey, chatUrl, messages, model, stream, signal, sessionId, plan }) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": "foundry-characters/1.0",
  };
  if (plan === "go" && sessionId) headers["x-opencode-session"] = sessionId;

  return [
    chatUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(buildChatBody(messages, { model, stream })),
      signal,
    },
  ];
}

export function normalizeModel(raw) {
  const inputPrice = raw.cost?.text?.input?.price ?? 0;
  const outputPrice = raw.cost?.text?.output?.price ?? 0;

  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    description: raw.description ?? "",
    context: raw.limit?.context ?? null,
    maxOutput: raw.limit?.output ?? null,
    modalities: raw.modalities?.input ?? [],
    reasoning: Boolean(raw.capabilities?.reasoning?.supported),
    free: inputPrice === 0 && outputPrice === 0,
    inputPrice,
    outputPrice,
  };
}

/**
 * List the models the configured endpoint offers.
 *
 * The endpoint is public, but a bad key still trips a 401, so fall back to an
 * anonymous request when the configured key is rejected.
 */
export async function fetchModels({ env = process.env, fetchImpl = fetch } = {}) {
  const { apiKey, modelsUrl } = bigpickleConfig(env);

  const send = (headers) => fetchImpl(modelsUrl, { headers });
  let response = await send(apiKey ? { Authorization: `Bearer ${apiKey}` } : {});
  if (response.status === 401 && apiKey) {
    response = await send({});
  }
  if (!response.ok) {
    throw new Error(await describeError(response));
  }

  const data = await response.json();
  return (data.data ?? [])
    .filter((model) => (model.type ?? "chat") === "chat")
    .map(normalizeModel);
}

/**
 * Stream a completion, invoking `onDelta(delta, textSoFar)` as tokens arrive.
 *
 * Resolves with the full answer once the stream ends.
 */
export async function streamChatCompletion({
  messages,
  model,
  signal,
  sessionId,
  onDelta,
  env = process.env,
  fetchImpl = fetch,
}) {
  const config = bigpickleConfig(env);
  if (!config.apiKey) {
    throw new Error("OPENCODE_ZEN_API_KEY is not set. Add it to .env (see .env.example).");
  }

  const [url, init] = requestInit({
    ...config,
    messages,
    model: model ?? config.model,
    stream: true,
    signal,
    sessionId,
  });

  const response = await fetchImpl(url, init);
  if (!response.ok || !response.body) {
    throw new Error(await describeError(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer(buffer);
    buffer = rest;

    for (const payload of events) {
      if (payload === "[DONE]") continue;
      const delta = deltaFromChunk(payload);
      if (!delta) continue;
      text += delta;
      onDelta?.(delta, text);
    }
  }

  return text;
}

/** Single-shot completion, used when a caller does not want to stream. */
export async function chatCompletion({ messages, model, signal, sessionId, env = process.env, fetchImpl = fetch }) {
  const config = bigpickleConfig(env);
  if (!config.apiKey) {
    throw new Error("OPENCODE_ZEN_API_KEY is not set. Add it to .env (see .env.example).");
  }

  const [url, init] = requestInit({
    ...config,
    messages,
    model: model ?? config.model,
    stream: false,
    signal,
    sessionId,
  });

  const response = await fetchImpl(url, init);
  if (!response.ok) {
    throw new Error(await describeError(response));
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}
