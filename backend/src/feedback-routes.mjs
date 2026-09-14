import { readFeedback } from "./feedback-payload.mjs";
import { createFeedbackIssue, listFeedbackBoard } from "./linear-feedback.mjs";
import { PayloadError } from "./payload.mjs";

export const FEEDBACK_PATH = "/v1/feedback";
const ALLOWED_ORIGINS = [
  "https://deck.spacevibe.dev",
  // `npm run prototype:landing` serves the page from here.
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];
const METHODS = "GET, POST, OPTIONS";
const BOARD_MAX_AGE_SECONDS = 60;
// A synthetic key: one board for every visitor, whatever their origin.
const BOARD_CACHE_KEY = "https://api.deck.spacevibe.dev/v1/feedback";

const HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

function corsHeaders(request) {
  const origin = request.headers.get("origin");
  return ALLOWED_ORIGINS.includes(origin)
    ? { "access-control-allow-origin": origin, vary: "origin" }
    : { vary: "origin" };
}

/**
 * The board body is cached without CORS headers and wrapped per request, so a
 * response built for one origin is never replayed to another.
 */
async function readBoard(env) {
  const cache = globalThis.caches?.default;
  const key = new Request(BOARD_CACHE_KEY);
  const cached = await cache?.match(key);
  if (cached) return cached.text();
  const body = JSON.stringify({ items: await listFeedbackBoard(env) });
  await cache?.put(
    key,
    new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${BOARD_MAX_AGE_SECONDS}`,
      },
    }),
  );
  return body;
}

async function board(env, headers) {
  try {
    return new Response(await readBoard(env), {
      status: 200,
      headers: {
        ...headers,
        "content-type": "application/json",
        "cache-control": `public, max-age=${BOARD_MAX_AGE_SECONDS}`,
      },
    });
  } catch {
    // Never log a Linear error; it can echo issue content.
    return new Response(null, { status: 503, headers });
  }
}

async function submit(request, env, headers) {
  try {
    const feedback = await readFeedback(request);
    // A bot sees success and moves on; nothing reaches Linear or the limiter.
    if (feedback.spam) return new Response(null, { status: 204, headers });
    // A shared per-location budget bounds writes without reading an IP address.
    const limit = await env.FEEDBACK_LIMITER.limit({ key: "feedback" });
    if (!limit.success) return new Response(null, { status: 429, headers });
    await createFeedbackIssue(env, feedback);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    // Never log the submission or a Linear error. Body errors are the sender's;
    // anything else is an infrastructure failure worth retrying.
    const status = error instanceof PayloadError ? error.status : 503;
    return new Response(null, { status, headers });
  }
}

export function handleFeedback(request, env) {
  const headers = { ...HEADERS, ...corsHeaders(request) };
  switch (request.method) {
    case "OPTIONS":
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "access-control-allow-methods": METHODS,
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    case "GET":
      return board(env, headers);
    case "POST":
      return submit(request, env, headers);
    default:
      return new Response(null, { status: 405, headers: { ...headers, allow: METHODS } });
  }
}
