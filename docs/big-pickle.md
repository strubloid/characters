# OpenCode Zen in the viewer

The viewer's **Chat** tab talks to OpenCode Zen over its OpenAI-compatible Chat
Completions API, and loads the model list from Zen's models endpoint. This note
records what was verified, how the pieces fit together, and the limits worth
knowing.

## What was verified

Checked live against Zen on 2026-11-13:

- Chat Completions base URL: `https://opencode.ai/inference/openai/v1`
  (pay-as-you-go) or `https://opencode.ai/inference/go/openai/v1` (Go).
- Models endpoint: `https://opencode.ai/inference/v1/models` and
  `https://opencode.ai/inference/go/v1/models`. Public; returns rich metadata
  (context, cost, modalities, capabilities). A bad key returns `401`, so the
  client falls back to an anonymous request.
- Every text model also works through Chat Completions, even when its native API
  is Responses, Anthropic Messages or Google. Zen translates.
- Big Pickle: id `big-pickle`, 200,000 context, 32,000 max output, free.
- Go models use dotted ids: `glm-5.3`, `kimi-k3`, `grok-4.7`, `iceman-contributor-free`, …

The brief mentioned `https://opencode.ai/zen/v1/chat/completions`; that is not
the current endpoint. Use the ones above.

## Plans and authentication

Zen has two roots. Which one you use depends on your plan:

| Plan            | Root                           | Models endpoint                |
| --------------- | ------------------------------ | ------------------------------ |
| Pay-as-you-go   | `https://opencode.ai/inference`      | `/v1/models`             |
| Go / Go Plus / Go Teams | `https://opencode.ai/inference/go` | `/go/v1/models`     |

Authenticate with `Authorization: Bearer oc_sk_…`. Create a key in the
[OpenCode Console](https://opencode.ai/console).

```bash
cp .env.example .env
# then put your key in .env
```

The server loads `.env` at startup and reads `OPENCODE_ZEN_API_KEY`. The key
stays server-side; the browser never sees it.

To use a Go subscription, set either:

```dotenv
OPENCODE_ZEN_PLAN=go
```

or point the root directly (this wins over the plan):

```dotenv
OPENCODE_ZEN_BASE_URL=https://opencode.ai/inference/go
```

Optional: `OPENCODE_ZEN_MODEL` sets the model the picker starts on.

## How it fits together

```
ChatPanel ──GET  /api/chat/models──▶ server.mjs ──▶ Zen /v1/models
ChatPanel ──POST /api/chat─────────▶ server.mjs ──▶ Zen /openai/v1/chat/completions
   ▲                                     │
   └──────────── SSE deltas ─────────────┘
```

- `app/server/bigpickle.mjs` — OpenAI-compatible client. Builds the request,
  parses the SSE stream, and normalises the model list. No dependencies.
- `app/server.mjs` — `POST /api/chat` streams deltas back as SSE
  (`status`, `delta`, `done`, `error`); `GET /api/chat/models` returns the model
  list (cached for five minutes); `GET /api/chat/status` reports the plan and
  whether a key is configured.
- `app/src/lib/api.ts` — `streamChat()`, `fetchChatModels()`, `fetchChatStatus()`.
- `app/src/features/chat/chat-panel.tsx` — the Chat tab UI: a model picker
  loaded from `/api/chat/models`, streaming replies, Stop and Clear.

Conversation history is kept in the tab's React state and replayed on each
request, so the model sees the whole thread. Nothing is persisted.

## Limitations

- **Pay-as-you-go free models are gated to OpenCode.** A live unauthenticated
  call returned `429 FreeUsageLimitError`, and the docs state free-tier chat
  models are only usable from inside OpenCode — other clients get `403` even
  with a Console API key. Use a paid model or a Go subscription for answers.
- **Go includes free models.** With a Go key you can pick `iceman-contributor-free`,
  `beam-free`, or `longcat-2.5-free` (limited time) at no extra cost.
- **Pricing and data handling vary by model.** Some models train on request data;
  the free pay-as-you-go period may use data to improve the model. Check the
  console before sending anything sensitive.
- **Text only from this client.** The picker filters to `type: "chat"`; the
  client sends text and does not upload images.

## Tests

`app/server/bigpickle.test.mjs` covers the SSE parser, the config/plan reader,
the model normaliser, the streaming round trip (against a local mock server),
auth headers, the stream flag, upstream error surfacing, the missing-key
message, and the anonymous fallback. It uses Node's built-in test runner and
needs no network.

```bash
npm run app:test
```
