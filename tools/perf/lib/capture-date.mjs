// The calendar date a matrix section's evidence was captured on, and its age
// (ADR-0175). A matrix section is read by how old its evidence is, not by
// whether its product commit matches the tip, so every section in the manifest
// carries a `capturedOn` date beside its product commit.
//
// Dates are UTC calendar days (`YYYY-MM-DD`). A capture's own clock is the only
// source that says when it ran; the fold that writes the date runs later, often
// the next day, so the fold date is the fallback, never the first choice.

export const MATRIX_SECTIONS = ['drawing', 'undo', 'actions'];

// The iOS XCUITest drawing transport stamps the URL it loads with the wall clock
// in epoch milliseconds, so every relaunch is a fresh navigation. That stamp is
// recorded as `automation.loadedUrl`, which makes it the one capture time an
// artifact carries today. Android, desktop, and action transports record no
// such stamp, and their sections fall back to the fold date.
export const PERF_RUN_PARAM = 'perf-run';

const PERF_RUN_PATTERN = new RegExp(`[?&]${PERF_RUN_PARAM}=(\\d+)(?:[&#]|$)`);
const CAPTURE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function utcDate(epochMs) {
  return new Date(epochMs).toISOString().slice(0, 10);
}

export function isCaptureDate(value) {
  if (typeof value !== 'string' || !CAPTURE_DATE_PATTERN.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && utcDate(parsed) === value;
}

export function perfRunEpoch(artifact) {
  const loadedUrl = artifact?.automation?.loadedUrl;
  if (typeof loadedUrl !== 'string') return null;
  const match = loadedUrl.match(PERF_RUN_PATTERN);
  if (!match) return null;
  const epoch = Number(match[1]);
  return Number.isSafeInteger(epoch) ? epoch : null;
}

// A section built from several artifacts (four brushes, a full and a focused
// action sweep) is as old as its oldest one.
export function sectionCapturedOn(artifacts, fallbackDate) {
  const epochs = artifacts.map(perfRunEpoch).filter((epoch) => epoch !== null);
  return epochs.length ? utcDate(Math.min(...epochs)) : fallbackDate;
}

export function captureAgeDays(capturedOn, asOf) {
  if (!isCaptureDate(capturedOn) || !isCaptureDate(asOf)) return null;
  return Math.round(
    (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${capturedOn}T00:00:00Z`)) / MS_PER_DAY
  );
}
