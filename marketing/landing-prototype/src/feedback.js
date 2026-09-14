import "../styles/tokens.css";
import "../styles/frame.css";
import "../styles/changelog.css";
import "../styles/feedback.css";
import "../styles/feedback-board.css";

import { messages } from "./copy.js";
import {
  BODY_MAX,
  FeedbackSubmitError,
  TITLE_MAX,
  TITLE_MIN,
  fetchFeedbackBoard,
  submitFeedback,
} from "./feedback-api.js";
import {
  renderBoard,
  renderBoardError,
  renderBoardLoading,
  selectBoardColumn,
} from "./feedback-board-view.js";
import { resetComposer, setComposerState, updateFormMeters } from "./feedback-form-view.js";
import { renderFeedbackShell, updateFeedbackLocale } from "./feedback-view.js";
import { LOCALES, readLocale, writeLocale } from "./locale-state.js";

const SUBMIT_ERROR_COPY = {
  invalid: "feedbackErrorInvalid",
  rate: "feedbackErrorRate",
  server: "feedbackErrorServer",
};

// Review-only switch, live under `npm run prototype:landing` alone: `?demo`
// swaps the Worker for fixtures (see feedback-demo.js).
const params = new URLSearchParams(window.location.search);
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);

const root = document.querySelector("#feedback-root");

if (!root) {
  throw new Error("Feedback page root is missing.");
}

let api = { fetchBoard: fetchFeedbackBoard, submit: submitFeedback };
let locale = readLocale(window.location);
let requestId = 0;

renderFeedbackShell(root, messages[locale], locale);
document.documentElement.lang = locale;

const form = root.querySelector(".feedback-form");
const shortcut = root.querySelector("[data-shortcut]");

if (!form || !shortcut) {
  throw new Error("Feedback composer is missing.");
}

shortcut.textContent = IS_MAC ? "⌘ ↵" : "Ctrl ↵";

async function loadBoard() {
  const currentRequest = ++requestId;
  renderBoardLoading(root, messages[locale]);

  try {
    const board = await api.fetchBoard();

    if (currentRequest === requestId) {
      renderBoard(root, board, messages[locale], locale);
    }
  } catch {
    if (currentRequest === requestId) {
      renderBoardError(root, messages[locale]);
    }
  }
}

function readForm() {
  const data = new FormData(form);
  const text = (name) => String(data.get(name) ?? "").trim();

  return {
    title: text("title").replace(/\s+/g, " "),
    body: text("body"),
    category: text("category"),
    website: text("website"),
  };
}

async function handleSubmit() {
  const input = readForm();

  if (
    input.title.length < TITLE_MIN ||
    input.title.length > TITLE_MAX ||
    input.body.length > BODY_MAX
  ) {
    setComposerState(root, "error", "feedbackErrorInvalid", messages[locale]);
    form.querySelector('[name="title"]')?.focus();
    return;
  }

  setComposerState(root, "sending", null, messages[locale]);

  try {
    await api.submit(input);
    form.reset();
    updateFormMeters(form);
    setComposerState(root, "sent", null, messages[locale]);
    root.querySelector("[data-send-another]")?.focus();
  } catch (error) {
    const reason = error instanceof FeedbackSubmitError ? error.reason : "server";
    setComposerState(root, "error", SUBMIT_ERROR_COPY[reason], messages[locale]);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void handleSubmit();
});

form.addEventListener("input", () => updateFormMeters(form));

form.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

function switchLocale(nextLocale) {
  if (!LOCALES.includes(nextLocale) || nextLocale === locale) {
    return;
  }

  writeLocale(nextLocale);
  locale = readLocale(window.location);
  updateFeedbackLocale(root, messages[locale], locale);
  document.documentElement.lang = locale;
}

root.addEventListener("click", (event) => {
  const target = event.target;
  const localeButton = target.closest("button[data-locale]");
  const tab = target.closest("[data-tab]");

  if (localeButton) {
    switchLocale(localeButton.dataset.locale);
  } else if (target.closest("[data-send-another]")) {
    resetComposer(root, messages[locale]);
    form.querySelector('[name="title"]')?.focus();
  } else if (tab) {
    selectBoardColumn(root, tab.dataset.tab);
  } else if (target.closest("button[data-board-retry]")) {
    void loadBoard();
  }
});

async function start() {
  if (import.meta.env.DEV && params.has("demo")) {
    const { createDemoFeedbackApi } = await import("./feedback-demo.js");
    api = createDemoFeedbackApi(params.get("demo"));
  }

  updateFormMeters(form);
  await loadBoard();
}

void start();
