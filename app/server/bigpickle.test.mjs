import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import {
  bigpickleConfig,
  chatCompletion,
  deltaFromChunk,
  fetchModels,
  parseSseBuffer,
  streamChatCompletion,
} from "./bigpickle.mjs";

function sse(chunks) {
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
}

function token(content) {
  return { choices: [{ delta: { content } }] };
}

let server;
let baseUrl;
let handler;

before(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (part) => (body += part));
    request.on("end", () => handler(request, response, body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const env = () => ({ OPENCODE_ZEN_API_KEY: "oc_sk_test", OPENCODE_ZEN_BASE_URL: baseUrl });

describe("parseSseBuffer", () => {
  it("splits complete events and keeps the trailing remainder", () => {
    const { events, rest } = parseSseBuffer("data: a\n\ndata: b\n\ndata: part");
    assert.deepEqual(events, ["a", "b"]);
    assert.equal(rest, "data: part");
  });

  it("ignores non-data lines and empty payloads", () => {
    const { events } = parseSseBuffer("event: message\ndata:\n\ndata: ok\n\n");
    assert.deepEqual(events, ["ok"]);
  });
});

describe("deltaFromChunk", () => {
  it("pulls the token out of a chunk", () => {
    assert.equal(deltaFromChunk(JSON.stringify(token("hello"))), "hello");
  });

  it("returns an empty string for non-content payloads", () => {
    assert.equal(deltaFromChunk("[DONE]"), "");
    assert.equal(deltaFromChunk(JSON.stringify({ choices: [{ delta: {} }] })), "");
  });
});

describe("bigpickleConfig", () => {
  it("defaults to the pay-as-you-go root and big-pickle", () => {
    const config = bigpickleConfig({});
    assert.equal(config.inferenceUrl, "https://opencode.ai/inference");
    assert.equal(config.chatUrl, "https://opencode.ai/inference/openai/v1/chat/completions");
    assert.equal(config.modelsUrl, "https://opencode.ai/inference/v1/models");
    assert.equal(config.model, "big-pickle");
    assert.equal(config.plan, "payg");
    assert.equal(config.apiKey, "");
  });

  it("points at the Go root when the plan is go", () => {
    const config = bigpickleConfig({ OPENCODE_ZEN_PLAN: "go" });
    assert.equal(config.inferenceUrl, "https://opencode.ai/inference/go");
    assert.equal(config.chatUrl, "https://opencode.ai/inference/go/openai/v1/chat/completions");
    assert.equal(config.modelsUrl, "https://opencode.ai/inference/go/v1/models");
    assert.equal(config.plan, "go");
  });

  it("lets an explicit base URL win and normalises a full chat URL", () => {
    const config = bigpickleConfig({ OPENCODE_ZEN_BASE_URL: "http://example.test/openai/v1/" });
    assert.equal(config.inferenceUrl, "http://example.test");
    assert.equal(config.chatUrl, "http://example.test/openai/v1/chat/completions");
  });

  it("reads the key and model overrides", () => {
    const config = bigpickleConfig({
      OPENCODE_ZEN_API_KEY: "oc_sk_test",
      OPENCODE_ZEN_MODEL: "some-model",
    });
    assert.equal(config.apiKey, "oc_sk_test");
    assert.equal(config.model, "some-model");
  });
});

describe("fetchModels", () => {
  it("normalises the list and flags free models", async () => {
    handler = (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          data: [
            {
              id: "glm-5.3",
              name: "GLM-5.3",
              type: "chat",
              limit: { context: 1000000, output: 131072 },
              modalities: { input: ["text"] },
              capabilities: { reasoning: { supported: true } },
              cost: { text: { input: { price: 1.4 }, output: { price: 4.4 } } },
            },
            {
              id: "iceman-contributor-free",
              name: "Iceman Contributor Free",
              type: "chat",
              cost: { text: { input: { price: 0 }, output: { price: 0 } } },
            },
            { id: "embed-1", name: "Embed", type: "embedding" },
          ],
        }),
      );
    };

    const models = await fetchModels({ env: env() });

    assert.deepEqual(
      models.map((model) => model.id),
      ["glm-5.3", "iceman-contributor-free"],
    );
    assert.equal(models[0].context, 1000000);
    assert.equal(models[0].free, false);
    assert.equal(models[0].inputPrice, 1.4);
    assert.equal(models[0].reasoning, true);
    assert.equal(models[1].free, true);
  });

  it("falls back to an anonymous request when the key is rejected", async () => {
    const seen = [];
    handler = (request, response) => {
      seen.push(request.headers.authorization ?? null);
      if (request.headers.authorization) {
        response.writeHead(401, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: { message: "expired" } }));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "glm-5.3", type: "chat" }] }));
    };

    const models = await fetchModels({ env: env() });

    assert.deepEqual(seen, ["Bearer oc_sk_test", null]);
    assert.deepEqual(
      models.map((model) => model.id),
      ["glm-5.3"],
    );
  });
});

describe("streamChatCompletion", () => {
  it("concatenates streamed tokens and reports each delta", async () => {
    handler = (_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(sse([token("Hel"), token("lo")]));
    };

    const deltas = [];
    const text = await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      env: env(),
      onDelta: (delta) => deltas.push(delta),
    });

    assert.equal(text, "Hello");
    assert.deepEqual(deltas, ["Hel", "lo"]);
  });

  it("authenticates and asks for a stream", async () => {
    let seen;
    handler = (request, response, body) => {
      seen = {
        auth: request.headers.authorization,
        userAgent: request.headers["user-agent"],
        body: JSON.parse(body),
      };
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(sse([token("ok")]));
    };

    await streamChatCompletion({ messages: [{ role: "user", content: "hi" }], env: env() });

    assert.equal(seen.auth, "Bearer oc_sk_test");
    assert.equal(seen.body.stream, true);
    assert.equal(seen.body.model, "big-pickle");
    assert.deepEqual(seen.body.messages, [{ role: "user", content: "hi" }]);
    assert.equal(seen.userAgent, "foundry-characters/1.0");
  });

  it("sends a stable session header for OpenCode Go conversations", async () => {
    let sessionHeader;
    handler = (request, response) => {
      sessionHeader = request.headers["x-opencode-session"];
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(sse([token("ok")]));
    };

    await streamChatCompletion({
      messages: [{ role: "user", content: "hi" }],
      sessionId: "f1c06f39-a937-4d6b-96a8-43303b908e34",
      env: { ...env(), OPENCODE_ZEN_BASE_URL: `${baseUrl}/go` },
    });

    assert.equal(sessionHeader, "f1c06f39-a937-4d6b-96a8-43303b908e34");
  });

  it("surfaces the upstream error message", async () => {
    handler = (_request, response) => {
      response.writeHead(429, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ error: { type: "FreeUsageLimitError", message: "Free usage limit reached." } }),
      );
    };

    await assert.rejects(
      streamChatCompletion({ messages: [{ role: "user", content: "hi" }], env: env() }),
      /Free usage limit reached/,
    );
  });

  it("explains a missing key before calling out", async () => {
    await assert.rejects(
      streamChatCompletion({ messages: [{ role: "user", content: "hi" }], env: {} }),
      /OPENCODE_ZEN_API_KEY/,
    );
  });
});

describe("chatCompletion", () => {
  it("returns the message content", async () => {
    handler = (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: "Hello" } }] }));
    };

    const text = await chatCompletion({ messages: [{ role: "user", content: "hi" }], env: env() });
    assert.equal(text, "Hello");
  });
});
