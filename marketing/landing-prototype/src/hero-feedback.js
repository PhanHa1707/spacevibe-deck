import { FEEDBACK_URL } from "./site-urls.js";

/**
 * The hero's way into the feedback page (DECK-101): a pill beside the release
 * pill, above the headline, so it is read in the first glance without pushing
 * the app window down. Its three dots are the board's column colours.
 */
export function renderHeroFeedbackPill(copy) {
  return `
    <a class="a-hero-feedback-pill" href="${FEEDBACK_URL}">
      <span class="a-hero-feedback-pill__dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span data-copy="heroFeedbackBoard">${copy.heroFeedbackBoard}</span>
      <span class="a-hero-feedback-pill__arrow" aria-hidden="true">→</span>
    </a>
  `;
}
