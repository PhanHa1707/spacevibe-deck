import { PayloadError, readJsonBody } from "./payload.mjs";

/** The public feedback form's wire contract (DECK-101), mirrored by the landing. */
export const FEEDBACK_BODY_LIMIT = 4096;
export const FEEDBACK_CATEGORIES = ["bug", "idea", "other"];
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const BODY_MAX = 2000;
const REQUIRED_FIELDS = ["title", "category"];
// `website` is a honeypot: the form hides it, so only a bot fills it in.
const OPTIONAL_FIELDS = ["body", "website"];
const CONTROL = /[\x00-\x1f\x7f]/g;
const CONTROL_EXCEPT_NEWLINE = /[\x00-\x09\x0b-\x1f\x7f]/g;

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Line breaks and tabs become spaces, then runs of whitespace collapse. */
function cleanTitle(value) {
  return value.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

/** Keep paragraphs; drop every other control character. */
function cleanBody(value) {
  return value.replace(/\r\n?/g, "\n").replace(CONTROL_EXCEPT_NEWLINE, "").trim();
}

export function parseFeedback(value) {
  if (
    !record(value) ||
    !Object.keys(value).every(
      (key) => REQUIRED_FIELDS.includes(key) || OPTIONAL_FIELDS.includes(key),
    ) ||
    !REQUIRED_FIELDS.every((key) => Object.hasOwn(value, key)) ||
    !Object.values(value).every((field) => typeof field === "string") ||
    !FEEDBACK_CATEGORIES.includes(value.category)
  ) {
    return undefined;
  }
  const title = cleanTitle(value.title);
  const body = cleanBody(value.body ?? "");
  if (title.length < TITLE_MIN || title.length > TITLE_MAX || body.length > BODY_MAX) {
    return undefined;
  }
  return { title, body, category: value.category, spam: (value.website ?? "").trim() !== "" };
}

export async function readFeedback(request) {
  const feedback = parseFeedback(await readJsonBody(request, FEEDBACK_BODY_LIMIT));
  if (!feedback) throw new PayloadError(400);
  return feedback;
}
