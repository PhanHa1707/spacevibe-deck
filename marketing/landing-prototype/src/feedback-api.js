/**
 * The landing's side of the feedback contract served by `backend/`
 * (DECK-101). The Worker owns validation and the Linear round trip; this
 * module only shapes the request and refuses to trust the response.
 */

export const FEEDBACK_API_URL = "https://api.deck.spacevibe.dev/v1/feedback";

/** Board columns, left to right. */
export const FEEDBACK_STATUSES = ["pending", "review", "done"];

export const FEEDBACK_CATEGORIES = ["bug", "idea", "other"];

export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const BODY_MAX = 2000;

/** Why a submission failed, so the page can pick the right sentence. */
export class FeedbackSubmitError extends Error {
  /** @param {"invalid" | "rate" | "server"} reason */
  constructor(reason) {
    super(`Feedback submission failed: ${reason}`);
    this.name = "FeedbackSubmitError";
    this.reason = reason;
  }
}

function isCard(item) {
  return (
    item !== null &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    item.title.length > 0 &&
    FEEDBACK_STATUSES.includes(item.status) &&
    FEEDBACK_CATEGORIES.includes(item.category) &&
    typeof item.updatedAt === "string" &&
    !Number.isNaN(Date.parse(item.updatedAt))
  );
}

/**
 * Group the Worker's flat list into board columns, newest first. Malformed
 * items are dropped rather than failing the whole board.
 *
 * @param {unknown} payload
 * @returns {Record<"pending" | "review" | "done", Array<{ id: string, title: string, category: string, status: string, updatedAt: string }>>}
 */
export function groupFeedbackBoard(payload) {
  if (payload === null || typeof payload !== "object" || !Array.isArray(payload.items)) {
    throw new Error("Feedback board response has no items list.");
  }

  const cards = payload.items
    .filter(isCard)
    .toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  return Object.fromEntries(
    FEEDBACK_STATUSES.map((status) => [status, cards.filter((card) => card.status === status)]),
  );
}

export async function fetchFeedbackBoard(fetchImpl = fetch) {
  const response = await fetchImpl(FEEDBACK_API_URL, { headers: { accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`Feedback board request failed with ${response.status}.`);
  }

  return groupFeedbackBoard(await response.json());
}

/**
 * @param {{ title: string, body: string, category: string, website: string }} input
 */
export async function submitFeedback(input, fetchImpl = fetch) {
  let response;

  try {
    response = await fetchImpl(FEEDBACK_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        category: input.category,
        website: input.website,
      }),
    });
  } catch {
    throw new FeedbackSubmitError("server");
  }

  if (response.ok) {
    return;
  }

  if (response.status === 400 || response.status === 413) {
    throw new FeedbackSubmitError("invalid");
  }

  throw new FeedbackSubmitError(response.status === 429 ? "rate" : "server");
}
