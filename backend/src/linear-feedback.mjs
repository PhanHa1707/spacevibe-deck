/**
 * Linear is the only store for public feedback (DECK-101): the Worker creates
 * issues and reads their state back; the owner moves them in Linear itself.
 */
const LINEAR_ENDPOINT = "https://api.linear.app/graphql";
// A hung Linear call must not hang the visitor; the landing keeps the draft.
const LINEAR_TIMEOUT_MS = 10_000;

/**
 * Hourly config probe. It has its own cron so a broken feedback setup shows up
 * as a failed invocation that is never confused with usage retention.
 */
export const FEEDBACK_PROBE_CRON = "17 * * * *";

/** Workspace labels in SpaceVibe-Deck. */
const BUG_LABEL = "ed9079dd-f534-4092-98ec-241335972834";
const FEATURE_LABEL = "404554e5-9175-474e-b211-1a31ebde49e2";
const IMPROVEMENT_LABEL = "ad32e36f-0027-41db-9e49-ad99864dc7cc";
// "Other" carries no Type; the owner picks one while triaging.
const NEEDS_DECISION_LABEL = "0968e82c-0db3-48ce-83c5-fe4afd04a5b3";
const LABEL_BY_CATEGORY = { bug: BUG_LABEL, idea: FEATURE_LABEL, other: NEEDS_DECISION_LABEL };
const TYPE_LABELS = [BUG_LABEL, FEATURE_LABEL, IMPROVEMENT_LABEL];
const CATEGORY_NAME = { bug: "Bug", idea: "Idea", other: "Other" };

/**
 * Backlog is the moderation gate: an unreviewed submission is never public.
 * Moving it to Todo publishes it. The board asks Linear for published state
 * types only, so Backlog, Canceled and Duplicate never take its slots, and it
 * maps by type so renaming a status neither hides nor leaks cards.
 */
const STATUS_BY_STATE_TYPE = { unstarted: "pending", started: "review", completed: "done" };
export const DONE_LIMIT = 30;
const OPEN_LIMIT = 100;

const CREATE_ISSUE = `mutation CreateFeedback($input: IssueCreateInput!) {
  issueCreate(input: $input) { success }
}`;

const FIND_ISSUE = `query FindFeedback($id: String!) {
  issue(id: $id) { id }
}`;

// Every connection names its own `first`: Linear prices an unbounded one at 50
// nodes, and its complexity budget is shared with the key owner's other tools.
const BOARD_FILTER = "team: { id: { eq: $team } }, labels: { some: { id: { eq: $label } } }";
const LIST_ISSUES = `query FeedbackBoard($team: ID!, $label: ID!, $types: [ID!]) {
  open: issues(
    first: ${OPEN_LIMIT}
    orderBy: updatedAt
    filter: { ${BOARD_FILTER}, state: { type: { in: ["unstarted", "started"] } } }
  ) { nodes { ...BoardIssue } }
  done: issues(
    first: ${DONE_LIMIT}
    orderBy: updatedAt
    filter: { ${BOARD_FILTER}, state: { type: { eq: "completed" } } }
  ) { nodes { ...BoardIssue } }
}
fragment BoardIssue on Issue {
  identifier
  title
  updatedAt
  state { type }
  labels(first: 3, filter: { id: { in: $types } }) { nodes { id } }
}`;

const PROBE = `query FeedbackProbe(
  $team: String!, $label: String!, $state: String!,
  $bug: String!, $feature: String!, $decision: String!
) {
  viewer { id }
  team(id: $team) { id }
  feedback: issueLabel(id: $label) { archivedAt }
  bug: issueLabel(id: $bug) { archivedAt }
  feature: issueLabel(id: $feature) { archivedAt }
  decision: issueLabel(id: $decision) { archivedAt }
  backlog: workflowState(id: $state) { archivedAt }
}`;

/** Any failure throws; callers answer 503 and never log the error, which can echo input. */
async function linear(env, query, variables) {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY is not configured");
  // Personal API keys go in the header bare, without a Bearer prefix.
  const response = await fetch(LINEAR_ENDPOINT, {
    method: "POST",
    headers: { authorization: env.LINEAR_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(LINEAR_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Linear answered ${response.status}`);
  const result = await response.json();
  if (result.errors?.length || !result.data) throw new Error("Linear returned errors");
  return result.data;
}

/**
 * Fence the visitor's text so Linear shows it verbatim: no link, image or
 * heading renders from it. The fence outgrows any backtick run inside.
 */
function fence(text) {
  const longest = Math.max(0, ...Array.from(text.matchAll(/`+/g), ([run]) => run.length));
  const marks = "`".repeat(Math.max(3, longest + 1));
  // A pasted linear.app URL turns into a live mention, which notifies people.
  return `${marks}text\n${text.replace(/linear\.app/gi, "linear[.]app")}\n${marks}`;
}

export function describeFeedback({ body, category }) {
  return [
    "## User report",
    "",
    body ? fence(body) : "No details were given.",
    "",
    "## Submission",
    "",
    `- Category: ${CATEGORY_NAME[category]}`,
    "- Source: deck.spacevibe.dev/feedback",
  ].join("\n");
}

async function issueExists(env, id) {
  try {
    const data = await linear(env, FIND_ISSUE, { id });
    return data.issue?.id === id;
  } catch {
    return false;
  }
}

export async function createFeedbackIssue(env, feedback) {
  const input = {
    teamId: env.FEEDBACK_TEAM_ID,
    title: feedback.title,
    description: describeFeedback(feedback),
    labelIds: [env.FEEDBACK_LABEL_ID, LABEL_BY_CATEGORY[feedback.category]],
    stateId: env.FEEDBACK_BACKLOG_STATE_ID,
    // The landing's per-draft UUID: a retry names the same issue, not a new one.
    ...(feedback.id ? { id: feedback.id } : {}),
  };
  try {
    const data = await linear(env, CREATE_ISSUE, { input });
    if (data.issueCreate?.success !== true) throw new Error("Linear refused the issue");
  } catch (error) {
    // The answer to an earlier try was lost but the issue landed: that is success.
    if (feedback.id && (await issueExists(env, feedback.id))) return;
    throw error;
  }
}

function category(labelIds) {
  if (labelIds.includes(BUG_LABEL)) return "bug";
  if (labelIds.includes(FEATURE_LABEL) || labelIds.includes(IMPROVEMENT_LABEL)) return "idea";
  return "other";
}

/** Only these five fields leave the Worker; the description never does. */
export function toBoardItem(issue) {
  const status = STATUS_BY_STATE_TYPE[issue?.state?.type];
  if (
    !status ||
    typeof issue.identifier !== "string" ||
    typeof issue.title !== "string" ||
    typeof issue.updatedAt !== "string"
  ) {
    return undefined;
  }
  const labelIds = (issue.labels?.nodes ?? []).map((label) => label?.id);
  return {
    id: issue.identifier,
    title: issue.title,
    category: category(labelIds),
    status,
    updatedAt: issue.updatedAt,
  };
}

export function toBoard(nodes) {
  const items = nodes
    .map(toBoardItem)
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let done = 0;
  // Done only grows; the column keeps the most recent items instead of the whole history.
  return items.filter((item) => item.status !== "done" || ++done <= DONE_LIMIT);
}

export async function listFeedbackBoard(env) {
  const data = await linear(env, LIST_ISSUES, {
    team: env.FEEDBACK_TEAM_ID,
    label: env.FEEDBACK_LABEL_ID,
    types: TYPE_LABELS,
  });
  const open = data.open?.nodes;
  const done = data.done?.nodes;
  if (!Array.isArray(open) || !Array.isArray(done))
    throw new Error("Linear returned no issue list");
  return toBoard([...open, ...done]);
}

/**
 * Reject unless the key works and the team, labels and Backlog state it writes
 * to still exist unarchived. Names only — nothing a visitor typed.
 */
export async function probeFeedbackConfig(env) {
  const data = await linear(env, PROBE, {
    team: env.FEEDBACK_TEAM_ID,
    label: env.FEEDBACK_LABEL_ID,
    state: env.FEEDBACK_BACKLOG_STATE_ID,
    bug: BUG_LABEL,
    feature: FEATURE_LABEL,
    decision: NEEDS_DECISION_LABEL,
  });
  const broken = ["viewer", "team", "feedback", "bug", "feature", "decision", "backlog"].filter(
    (name) => !data[name] || data[name].archivedAt,
  );
  if (broken.length > 0) throw new Error(`Feedback config is broken: ${broken.join(", ")}`);
}
