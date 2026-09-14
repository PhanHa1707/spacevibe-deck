import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./worker.mjs";

const URL_FEEDBACK = "https://api.deck.spacevibe.dev/v1/feedback";
const ORIGIN = "https://deck.spacevibe.dev";
const feedback = {
  title: "Split panes lose focus",
  body: "After closing a pane the terminal\nno longer takes keys.",
  category: "bug",
  website: "",
};

function environment(overrides = {}) {
  return {
    LINEAR_API_KEY: "lin_api_test",
    FEEDBACK_TEAM_ID: "team-id",
    FEEDBACK_LABEL_ID: "feedback-label",
    FEEDBACK_BACKLOG_STATE_ID: "backlog-state",
    FEEDBACK_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  };
}

function submit(body = feedback, init = {}) {
  return new Request(URL_FEEDBACK, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}

/** Record every Linear call and answer with `reply`. */
function stubLinear(t, reply) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init, request: JSON.parse(init.body) });
    return reply(calls.at(-1));
  });
  return calls;
}

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

test("a honeypot submission answers 204 without touching Linear or the limiter", async (t) => {
  const calls = stubLinear(t, () => json({ data: { issueCreate: { success: true } } }));
  let limited = 0;
  const env = environment({
    FEEDBACK_LIMITER: { limit: async () => (limited++, { success: true }) },
  });
  const response = await worker.fetch(submit({ ...feedback, website: "https://spam" }), env);
  assert.equal(response.status, 204);
  assert.equal(calls.length, 0);
  assert.equal(limited, 0);
});

test("malformed submissions are terminal and never reach Linear", async (t) => {
  const calls = stubLinear(t, () => json({ data: { issueCreate: { success: true } } }));
  for (const body of [
    { ...feedback, email: "someone@example.com" },
    { ...feedback, title: "x".repeat(121) },
    { ...feedback, title: " \n\t " },
    { ...feedback, body: "y".repeat(2001) },
    { ...feedback, category: "praise" },
    { ...feedback, title: 42 },
    { body: "no title", category: "idea" },
    "{",
  ]) {
    assert.equal((await worker.fetch(submit(body), environment())).status, 400);
  }
  const wrongType = submit(feedback, { headers: { "content-type": "text/plain" } });
  assert.equal((await worker.fetch(wrongType, environment())).status, 400);
  assert.equal(calls.length, 0);
});

test("the body cap is measured in bytes", async (t) => {
  const calls = stubLinear(t, () => json({}));
  const response = await worker.fetch(
    submit({ ...feedback, body: "📝".repeat(1100) }),
    environment(),
  );
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test("the limiter answers a retryable 429 before Linear", async (t) => {
  const calls = stubLinear(t, () => json({}));
  const env = environment({ FEEDBACK_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal((await worker.fetch(submit(), env)).status, 429);
  assert.equal(calls.length, 0);
});

test("a valid submission creates one Backlog issue with the Feedback and Type labels", async (t) => {
  const calls = stubLinear(t, () => json({ data: { issueCreate: { success: true } } }));
  const response = await worker.fetch(
    submit({ ...feedback, title: "  Split\tpanes \n lose   focus " }),
    environment(),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.linear.app/graphql");
  assert.equal(calls[0].init.headers.authorization, "lin_api_test");
  const { input } = calls[0].request.variables;
  assert.equal(input.teamId, "team-id");
  assert.equal(input.stateId, "backlog-state");
  assert.equal(input.title, "Split panes lose focus");
  assert.deepEqual(input.labelIds, ["feedback-label", "ed9079dd-f534-4092-98ec-241335972834"]);
  assert.match(input.description, /^After closing a pane the terminal\nno longer takes keys\./);
  assert.match(
    input.description,
    /---\n\nSubmitted through deck\.spacevibe\.dev\/feedback · category: bug$/,
  );
});

test("ideas carry the Feature label; other carries only Feedback", async (t) => {
  const calls = stubLinear(t, () => json({ data: { issueCreate: { success: true } } }));
  await worker.fetch(submit({ ...feedback, category: "idea" }), environment());
  await worker.fetch(submit({ ...feedback, category: "other" }), environment());
  assert.deepEqual(calls[0].request.variables.input.labelIds, [
    "feedback-label",
    "404554e5-9175-474e-b211-1a31ebde49e2",
  ]);
  assert.deepEqual(calls[1].request.variables.input.labelIds, ["feedback-label"]);
});

test("every Linear failure is a retryable 503", async (t) => {
  for (const reply of [
    () => json({ errors: [{ message: "bad" }] }),
    () => json({ data: { issueCreate: { success: false } } }),
    () => json({}, 500),
    () => {
      throw new TypeError("network down");
    },
  ]) {
    t.mock.restoreAll();
    stubLinear(t, reply);
    assert.equal((await worker.fetch(submit(), environment())).status, 503);
  }
  t.mock.restoreAll();
  const calls = stubLinear(t, () => json({}));
  const missingKey = environment({ LINEAR_API_KEY: undefined });
  assert.equal((await worker.fetch(submit(), missingKey)).status, 503);
  assert.equal(calls.length, 0);
});

const issue = (identifier, state, updatedAt, labels = []) => ({
  identifier,
  title: `${identifier} title`,
  updatedAt,
  state: { name: state },
  labels: { nodes: labels.map((id) => ({ id })) },
  description: "PRIVATE BODY TEXT",
});

function board(url = URL_FEEDBACK) {
  return new Request(url, { headers: { origin: ORIGIN } });
}

test("the board maps Linear states to three columns and hides the rest", async (t) => {
  const calls = stubLinear(t, () =>
    json({
      data: {
        issues: {
          nodes: [
            issue("DECK-1", "Backlog", "2026-09-14T10:00:00.000Z"),
            issue("DECK-2", "Todo", "2026-09-14T09:00:00.000Z", [
              "ed9079dd-f534-4092-98ec-241335972834",
            ]),
            issue("DECK-3", "In Progress", "2026-09-14T11:00:00.000Z", [
              "ad32e36f-0027-41db-9e49-ad99864dc7cc",
            ]),
            issue("DECK-4", "Blocked", "2026-09-13T11:00:00.000Z"),
            issue("DECK-5", "Ready for Review", "2026-09-12T11:00:00.000Z"),
            issue("DECK-6", "Done", "2026-09-11T11:00:00.000Z"),
            issue("DECK-7", "Canceled", "2026-09-14T12:00:00.000Z"),
            issue("DECK-8", "Duplicate", "2026-09-14T12:00:00.000Z"),
          ],
        },
      },
    }),
  );
  const response = await worker.fetch(board(), environment());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=60");
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  const text = await response.text();
  assert.doesNotMatch(text, /PRIVATE BODY TEXT|description/);
  const { items } = JSON.parse(text);
  assert.deepEqual(
    items.map(({ id, status, category }) => [id, status, category]),
    [
      ["DECK-3", "review", "idea"],
      ["DECK-2", "pending", "bug"],
      ["DECK-4", "review", "other"],
      ["DECK-5", "review", "other"],
      ["DECK-6", "done", "other"],
    ],
  );
  assert.deepEqual(Object.keys(items[0]).sort(), [
    "category",
    "id",
    "status",
    "title",
    "updatedAt",
  ]);
  assert.deepEqual(calls[0].request.variables, { team: "team-id", label: "feedback-label" });
});

test("the Done column keeps only the 30 most recent items", async (t) => {
  const nodes = Array.from({ length: 40 }, (_, index) =>
    issue(`DECK-${index}`, "Done", new Date(Date.UTC(2026, 8, 1, index)).toISOString()),
  );
  stubLinear(t, () => json({ data: { issues: { nodes } } }));
  const { items } = await (await worker.fetch(board(), environment())).json();
  assert.equal(items.length, 30);
  assert.equal(items[0].id, "DECK-39");
  assert.equal(items.at(-1).id, "DECK-10");
});

test("a Linear failure on the board is a 503", async (t) => {
  stubLinear(t, () => json({ errors: [{ message: "bad" }] }));
  assert.equal((await worker.fetch(board(), environment())).status, 503);
});

test("CORS: preflight answers the allowed origin; others get no allow-origin", async () => {
  const preflight = await worker.fetch(
    new Request(URL_FEEDBACK, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:5173" } }),
    environment(),
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");
  assert.equal(preflight.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assert.equal(preflight.headers.get("access-control-allow-headers"), "content-type");
  assert.equal(preflight.headers.get("access-control-max-age"), "86400");
  assert.equal(preflight.headers.get("vary"), "origin");
  const foreign = await worker.fetch(
    new Request(URL_FEEDBACK, { method: "OPTIONS", headers: { origin: "https://evil.example" } }),
    environment(),
  );
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);
  const put = await worker.fetch(new Request(URL_FEEDBACK, { method: "PUT" }), environment());
  assert.equal(put.status, 405);
  assert.equal(put.headers.get("allow"), "GET, POST, OPTIONS");
});
