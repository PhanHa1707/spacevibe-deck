import assert from "node:assert/strict";
import { test } from "node:test";
import { FEEDBACK_PROBE_CRON } from "./linear-feedback.mjs";
import worker from "./worker.mjs";

const URL_FEEDBACK = "https://api.deck.spacevibe.dev/v1/feedback";
const ORIGIN = "https://deck.spacevibe.dev";
const DRAFT_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const BUG_LABEL = "ed9079dd-f534-4092-98ec-241335972834";
const FEATURE_LABEL = "404554e5-9175-474e-b211-1a31ebde49e2";
const IMPROVEMENT_LABEL = "ad32e36f-0027-41db-9e49-ad99864dc7cc";
const NEEDS_DECISION_LABEL = "0968e82c-0db3-48ce-83c5-fe4afd04a5b3";
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
const created = () => json({ data: { issueCreate: { success: true } } });

test("a honeypot submission answers 204 without touching Linear or the limiter", async (t) => {
  const calls = stubLinear(t, created);
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
  const calls = stubLinear(t, created);
  for (const body of [
    { ...feedback, email: "someone@example.com" },
    { ...feedback, title: "x".repeat(121) },
    { ...feedback, title: " \n\t " },
    { ...feedback, body: "y".repeat(2001) },
    { ...feedback, category: "praise" },
    { ...feedback, title: 42 },
    { ...feedback, id: "not-a-uuid" },
    { body: "no title", category: "idea" },
    "{",
  ]) {
    assert.equal((await worker.fetch(submit(body), environment())).status, 400);
  }
  const wrongType = submit(feedback, { headers: { "content-type": "text/plain" } });
  assert.equal((await worker.fetch(wrongType, environment())).status, 400);
  assert.equal(calls.length, 0);
});

test("the body cap is measured in bytes and fits 2,000 characters of any script", async (t) => {
  const calls = stubLinear(t, created);
  const cjk = await worker.fetch(submit({ ...feedback, body: "漢".repeat(2000) }), environment());
  assert.equal(cjk.status, 204);
  const oversized = await worker.fetch(
    submit({ ...feedback, website: "x".repeat(17000) }),
    environment(),
  );
  assert.equal(oversized.status, 413);
  assert.equal(calls.length, 1);
});

test("the limiter answers a retryable 429 before Linear", async (t) => {
  const calls = stubLinear(t, () => json({}));
  const env = environment({ FEEDBACK_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal((await worker.fetch(submit(), env)).status, 429);
  assert.equal(calls.length, 0);
});

test("a valid submission creates one Backlog issue in the agreed format", async (t) => {
  const calls = stubLinear(t, created);
  const response = await worker.fetch(
    submit({ ...feedback, title: "  Split\tpanes \n lose   focus ", id: DRAFT_ID }),
    environment(),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.linear.app/graphql");
  assert.equal(calls[0].init.headers.authorization, "lin_api_test");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  const { input } = calls[0].request.variables;
  assert.equal(input.id, DRAFT_ID);
  assert.equal(input.teamId, "team-id");
  assert.equal(input.stateId, "backlog-state");
  assert.equal(input.title, "Split panes lose focus");
  assert.deepEqual(input.labelIds, ["feedback-label", BUG_LABEL]);
  assert.equal(
    input.description,
    [
      "## User report",
      "",
      "```text",
      "After closing a pane the terminal",
      "no longer takes keys.",
      "```",
      "",
      "## Submission",
      "",
      "- Category: Bug",
      "- Source: deck.spacevibe.dev/feedback",
    ].join("\n"),
  );
});

test("visitor text stays inert: the fence outgrows backticks and linear.app links are defused", async (t) => {
  const calls = stubLinear(t, created);
  const body = "See ```` here ![x](https://evil.example/p.png) https://Linear.app/mxrsv/profiles/x";
  await worker.fetch(submit({ ...feedback, body }), environment());
  await worker.fetch(submit({ ...feedback, body: "" }), environment());
  const [fenced, empty] = calls.map((call) => call.request.variables.input.description);
  assert.match(fenced, /\n`````text\nSee ```` here !\[x\]\(https:\/\/evil\.example\/p\.png\) /);
  assert.match(fenced, /https:\/\/linear\[\.\]app\/mxrsv\/profiles\/x\n`````\n/);
  assert.match(empty, /^## User report\n\nNo details were given\.\n/);
});

test("ideas carry the Feature label; other asks for a decision", async (t) => {
  const calls = stubLinear(t, created);
  await worker.fetch(submit({ ...feedback, category: "idea" }), environment());
  await worker.fetch(submit({ ...feedback, category: "other" }), environment());
  assert.deepEqual(calls[0].request.variables.input.labelIds, ["feedback-label", FEATURE_LABEL]);
  assert.deepEqual(calls[1].request.variables.input.labelIds, [
    "feedback-label",
    NEEDS_DECISION_LABEL,
  ]);
  assert.match(calls[1].request.variables.input.description, /- Category: Other/);
});

test("every Linear failure is a retryable 503", async (t) => {
  for (const reply of [
    () => json({ errors: [{ message: "bad" }] }),
    () => json({ data: { issueCreate: { success: false } } }),
    () => json({}, 500),
    () => json({ errors: [{ extensions: { code: "RATELIMITED" } }] }, 400),
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

test("a retry whose issue already landed succeeds instead of duplicating", async (t) => {
  const calls = stubLinear(t, ({ request }) => {
    if (request.query.includes("issueCreate")) throw new TypeError("answer lost");
    return json({ data: { issue: { id: request.variables.id } } });
  });
  const response = await worker.fetch(submit({ ...feedback, id: DRAFT_ID }), environment());
  assert.equal(response.status, 204);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].request.variables, { id: DRAFT_ID });

  t.mock.restoreAll();
  const missing = stubLinear(t, ({ request }) =>
    request.query.includes("issueCreate")
      ? json({}, 500)
      : json({ errors: [{ message: "Entity not found" }] }),
  );
  assert.equal(
    (await worker.fetch(submit({ ...feedback, id: DRAFT_ID }), environment())).status,
    503,
  );
  assert.equal(missing.length, 2);
});

const issue = (identifier, type, updatedAt, labels = []) => ({
  identifier,
  title: `${identifier} title`,
  updatedAt,
  state: { type },
  labels: { nodes: labels.map((id) => ({ id })) },
  description: "PRIVATE BODY TEXT",
});

const boardReply = (open, done = []) =>
  json({ data: { open: { nodes: open }, done: { nodes: done } } });

function board(url = URL_FEEDBACK) {
  return new Request(url, { headers: { origin: ORIGIN } });
}

test("the board asks only for published states and maps them by type", async (t) => {
  const calls = stubLinear(t, () =>
    boardReply(
      [
        issue("DECK-2", "unstarted", "2026-09-14T09:00:00.000Z", [BUG_LABEL]),
        issue("DECK-3", "started", "2026-09-14T11:00:00.000Z", [IMPROVEMENT_LABEL]),
        issue("DECK-4", "started", "2026-09-13T11:00:00.000Z"),
        issue("DECK-7", "canceled", "2026-09-14T12:00:00.000Z"),
      ],
      [issue("DECK-6", "completed", "2026-09-11T11:00:00.000Z")],
    ),
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
  const { query, variables } = calls[0].request;
  assert.deepEqual(variables, {
    team: "team-id",
    label: "feedback-label",
    types: [BUG_LABEL, FEATURE_LABEL, IMPROVEMENT_LABEL],
  });
  assert.match(query, /state: \{ type: \{ in: \["unstarted", "started"\] \} \}/);
  assert.match(query, /state: \{ type: \{ eq: "completed" \} \}/);
  // No connection is left to Linear's 50-node default price.
  assert.match(query, /labels\(first: 3,/);
});

test("the Done column keeps only the 30 most recent items", async (t) => {
  const done = Array.from({ length: 40 }, (_, index) =>
    issue(`DECK-${index}`, "completed", new Date(Date.UTC(2026, 8, 1, index)).toISOString()),
  );
  stubLinear(t, () => boardReply([], done));
  const { items } = await (await worker.fetch(board(), environment())).json();
  assert.equal(items.length, 30);
  assert.equal(items[0].id, "DECK-39");
  assert.equal(items.at(-1).id, "DECK-10");
});

test("a Linear failure on the board is a 503", async (t) => {
  stubLinear(t, () => json({ errors: [{ message: "bad" }] }));
  assert.equal((await worker.fetch(board(), environment())).status, 503);
});

const probe = { cron: FEEDBACK_PROBE_CRON, scheduledTime: 0 };
const healthy = {
  viewer: { id: "user" },
  team: { id: "team-id" },
  feedback: { archivedAt: null },
  bug: { archivedAt: null },
  feature: { archivedAt: null },
  decision: { archivedAt: null },
  backlog: { archivedAt: null },
};

test("the hourly probe passes only while key, team, labels and Backlog all hold", async (t) => {
  const calls = stubLinear(t, () => json({ data: healthy }));
  await worker.scheduled(probe, environment());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.variables.state, "backlog-state");

  for (const data of [
    { ...healthy, feedback: { archivedAt: "2026-09-15T00:00:00.000Z" } },
    { ...healthy, backlog: null },
  ]) {
    t.mock.restoreAll();
    stubLinear(t, () => json({ data }));
    await assert.rejects(worker.scheduled(probe, environment()), /feedback|backlog/);
  }
  t.mock.restoreAll();
  stubLinear(t, () => json({}, 401));
  await assert.rejects(worker.scheduled(probe, environment()));
  await assert.rejects(worker.scheduled(probe, environment({ LINEAR_API_KEY: undefined })));
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
