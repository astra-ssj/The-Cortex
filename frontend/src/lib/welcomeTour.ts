/** First-visit product tour — local only, not cleared on logout. */

export const TOUR_STORAGE_KEY = "astra_grc_tour_done";
export const TOUR_REPLAY_EVENT = "astra:replay-tour";

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Matches [data-tour] on the sidebar. Empty = no spotlight (welcome). */
  target: string | null;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Astra GRC",
    body: "Community Edition. This page is home — the Audit Simulator. The rail on the left is how you move around.",
    target: null,
  },
  {
    id: "train",
    title: "Train",
    body: "Start here. Cases live in this group: pick a rehearsal, then work the scenario.",
    target: "train",
  },
  {
    id: "audit-simulator",
    title: "Audit Simulator",
    body: "Choose a framework and an audit type, then Run Assessment. That opens the case list.",
    target: "audit-simulator",
  },
  {
    id: "learning",
    title: "Learning Loop",
    body: "The case itself. You decide under pressure; answers are graded against framework-grounded references.",
    target: "learning",
  },
  {
    id: "discover",
    title: "Discover",
    body: "Control Gaps and Review fill in from your decisions. They stay empty until you complete a case.",
    target: "discover",
  },
  {
    id: "evidence",
    title: "Evidence",
    body: "A hash-chained trail of what you actually did — not a sample. Finish a case and it appears here.",
    target: "evidence",
  },
];

export function isTourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markTourDone(): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, "1");
  } catch {
    /* private mode / blocked storage — treat as done so we do not loop */
  }
}

export function replayTour(): void {
  window.dispatchEvent(new Event(TOUR_REPLAY_EVENT));
}

export function isWelcomeTourBlockingShortcuts(): boolean {
  return document.documentElement.dataset.welcomeTour === "1";
}
