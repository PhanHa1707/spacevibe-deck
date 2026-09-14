import { BODY_MAX, FEEDBACK_CATEGORIES, TITLE_MAX } from "./feedback-api.js";

/**
 * The feedback draft kept on this device while sending is closed (DECK-101).
 * The confirm step that follows the Worker launch reads this exact shape, so
 * the key is versioned. localStorage rather than a cookie: nothing here needs
 * the server, and a cookie would ride every request to Vercel.
 *
 * Storage can refuse (quota, private mode, blocked context). Every function
 * reports that through its return value instead of throwing, so a refused
 * draft never breaks the form.
 */
export const FEEDBACK_DRAFT_KEY = "deck.landing.feedbackDraft.v1";

/** @returns {{ title: string, body: string, category: string, savedAt: string } | null} */
export function readDraft(storage) {
  let raw = null;

  try {
    raw = storage?.getItem(FEEDBACK_DRAFT_KEY) ?? null;
  } catch {
    return null;
  }

  if (raw === null) {
    return null;
  }

  let draft;

  try {
    draft = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof draft?.title !== "string" || typeof draft.body !== "string") {
    return null;
  }

  return {
    title: draft.title.slice(0, TITLE_MAX),
    body: draft.body.slice(0, BODY_MAX),
    category: FEEDBACK_CATEGORIES.includes(draft.category)
      ? draft.category
      : FEEDBACK_CATEGORIES[0],
    savedAt: typeof draft.savedAt === "string" ? draft.savedAt : "",
  };
}

/**
 * Save the draft, or drop it once both fields are empty.
 *
 * @returns {"saved" | "empty" | "refused"}
 */
export function writeDraft(storage, { title, body, category }, now = new Date()) {
  if (!storage) {
    return "refused";
  }

  try {
    if (title.trim() === "" && body.trim() === "") {
      storage.removeItem(FEEDBACK_DRAFT_KEY);
      return "empty";
    }

    storage.setItem(
      FEEDBACK_DRAFT_KEY,
      JSON.stringify({ title, body, category, savedAt: now.toISOString() }),
    );
    return "saved";
  } catch {
    return "refused";
  }
}

/** @returns {boolean} whether the draft is gone */
export function clearDraft(storage) {
  try {
    storage?.removeItem(FEEDBACK_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}
