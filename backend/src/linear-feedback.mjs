/**
 * Linear is the only store for public feedback (DECK-101): the Worker creates
 * issues and reads their state back; the owner moves them in Linear itself.
 */
const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

/** Workspace Type labels in SpaceVibe-Deck. */
const BUG_LABEL = "ed9079dd-f534-4092-98ec-241335972834";
const FEATURE_LABEL = "404554e5-9175-474e-b211-1a31ebde49e2";
const IMPROVEMENT_LABEL = "ad32e36f-0027-41db-9e49-ad99864dc7cc";
const TYPE_LABEL_BY_CATEGORY = { bug: BUG_LABEL, idea: FEATURE_LABEL };

/**
 * Backlog is the moderation gate: an unreviewed submission is never public.
 * Moving it to Todo publishes it. Canceled, Duplicate and unknown states stay
 * hidden, so renaming a status in Linear hides cards rather than leaking them.
 */
const STATUS_BY_STATE = {
  Todo: "pending",
  "In Progress": "review",
  Blocked: "review",
  "Ready for Review": "review",
  Done: "done",
};
export const DONE_LIMIT = 30;
const ISSUE_LIMIT = 100;

const CREATE_ISSUE = `mutation CreateFeedback($input: IssueCreateInput!) {
  issueCreate(input: $input) { success }
}`;

const LIST_ISSUES = `query FeedbackBoard($team: ID!, $label: ID!) {
  issues(
    first: ${ISSUE_LIMIT}
    orderBy: updatedAt
    filter: { team: { id: { eq: $team } }, labels: { some: { id: { eq: $label } } } }
  ) {
    nodes { identifier title updatedAt state { name } labels { nodes { id } } }
  }
}`;

/** Any failure throws; callers answer 503 and never log the error, which can echo input. */
async function linear(env, query, variables) {
  if (!env.LINEAR_API_KEY) throw new Error("LINEAR_API_KEY is not configured");
  // Personal API keys go in the header bare, without a Bearer prefix.
  const response = await fetch(LINEAR_ENDPOINT, {
    method: "POST",
    headers: { authorization: env.LINEAR_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Linear answered ${response.status}`);
  const result = await response.json();
  if (result.errors?.length || !result.data) throw new Error("Linear returned errors");
  return result.data;
}

export async function createFeedbackIssue(env, feedback) {
  const typeLabel = TYPE_LABEL_BY_CATEGORY[feedback.category];
  const footer = `Submitted through deck.spacevibe.dev/feedback · category: ${feedback.category}`;
  const data = await linear(env, CREATE_ISSUE, {
    input: {
      teamId: env.FEEDBACK_TEAM_ID,
      title: feedback.title,
      description: feedback.body ? `${feedback.body}\n\n---\n\n${footer}` : footer,
      labelIds: typeLabel ? [env.FEEDBACK_LABEL_ID, typeLabel] : [env.FEEDBACK_LABEL_ID],
      stateId: env.FEEDBACK_BACKLOG_STATE_ID,
    },
  });
  if (data.issueCreate?.success !== true) throw new Error("Linear refused the issue");
}

function category(labelIds) {
  if (labelIds.includes(BUG_LABEL)) return "bug";
  if (labelIds.includes(FEATURE_LABEL) || labelIds.includes(IMPROVEMENT_LABEL)) return "idea";
  return "other";
}

/** Only these five fields leave the Worker; the description never does. */
export function toBoardItem(issue) {
  const status = STATUS_BY_STATE[issue?.state?.name];
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
  });
  const nodes = data.issues?.nodes;
  if (!Array.isArray(nodes)) throw new Error("Linear returned no issue list");
  return toBoard(nodes);
}
