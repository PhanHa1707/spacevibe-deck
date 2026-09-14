import "../styles/tokens.css";
import "../styles/frame.css";
import "../styles/changelog.css";
import "../styles/feedback.css";

import { messages } from "./copy.js";
import {
  BODY_MAX,
  FeedbackSubmitError,
  TITLE_MAX,
  fetchFeedbackBoard,
  submitFeedback,
} from "./feedback-api.js";
import {
  renderBoard,
  renderBoardError,
  renderBoardLoading,
  renderFeedbackShell,
  renderFormResult,
  updateFeedbackLocale,
} from "./feedback-view.js";
import { LOCALES, readLocale, writeLocale } from "./locale-state.js";

const SUBMIT_ERROR_COPY = {
  invalid: "feedbackErrorInvalid",
  rate: "feedbackErrorRate",
  server: "feedbackErrorServer",
};

const COUNT_LIMITS = { title: TITLE_MAX, body: BODY_MAX };

const root = document.querySelector("#feedback-root");

if (!root) {
  throw new Error("Feedback page root is missing.");
}

let locale = readLocale(window.location);
let requestId = 0;

renderFeedbackShell(root, messages[locale], locale);
document.documentElement.lang = locale;

async function loadBoard() {
  const currentRequest = ++requestId;
  renderBoardLoading(root, messages[locale]);

  try {
    const board = await fetchFeedbackBoard();

    if (currentRequest === requestId) {
      renderBoard(root, board, messages[locale], locale);
    }
  } catch {
    if (currentRequest === requestId) {
      renderBoardError(root, messages[locale]);
    }
  }
}

function readForm(form) {
  const data = new FormData(form);
  const text = (name) => String(data.get(name) ?? "").trim();

  return {
    title: text("title").replace(/\s+/g, " "),
    body: text("body"),
    category: text("category"),
    website: text("website"),
  };
}

async function handleSubmit(form) {
  const input = readForm(form);

  if (input.title.length < 3 || input.title.length > TITLE_MAX || input.body.length > BODY_MAX) {
    renderFormResult(root, "error", "feedbackErrorInvalid", messages[locale]);
    form.querySelector('[name="title"]')?.focus();
    return;
  }

  renderFormResult(root, "sending", null, messages[locale]);

  try {
    await submitFeedback(input);
    form.reset();
    updateCounts(form);
    renderFormResult(root, "sent", "feedbackSent", messages[locale]);
  } catch (error) {
    const reason = error instanceof FeedbackSubmitError ? error.reason : "server";
    renderFormResult(root, "error", SUBMIT_ERROR_COPY[reason], messages[locale]);
  }
}

function updateCounts(form) {
  for (const [name, limit] of Object.entries(COUNT_LIMITS)) {
    const field = form.querySelector(`[name="${name}"]`);
    const count = form.querySelector(`[data-count-for="${name}"]`);

    if (field && count) {
      count.textContent = `${field.value.length}/${limit}`;
    }
  }
}

root.addEventListener("submit", (event) => {
  const form = event.target.closest(".feedback-form");

  if (form) {
    event.preventDefault();
    void handleSubmit(form);
  }
});

root.addEventListener("input", (event) => {
  const form = event.target.closest(".feedback-form");

  if (form) {
    updateCounts(form);
  }
});

root.addEventListener("click", (event) => {
  const localeButton = event.target.closest("button[data-locale]");

  if (localeButton) {
    const nextLocale = localeButton.dataset.locale;

    if (LOCALES.includes(nextLocale) && nextLocale !== locale) {
      writeLocale(nextLocale);
      locale = readLocale(window.location);
      updateFeedbackLocale(root, messages[locale], locale);
      document.documentElement.lang = locale;
    }

    return;
  }

  if (event.target.closest("button[data-board-retry]")) {
    void loadBoard();
  }
});

void loadBoard();
