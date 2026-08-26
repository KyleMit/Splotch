import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';

// The longitudinal dataset issue 1299 wants: one row per WDA launch attempt,
// whoever made it. The operator harness was the only producer, which left the
// log with a handful of rows and the grant-lifetime question unanswerable —
// the preflight's own launches are the frequent ones, so it records here too.
// Tracked (perf-profiles/evidence is the one un-gitignored perf path), because
// an untracked log is one `rm -rf perf-profiles` from erasing the only
// grant-lifetime evidence.
export const GRANT_LOG = join(ROOT, 'perf-profiles', 'evidence', 'operator', 'ipad-grant-log.tsv');

// Values are flattened to single-line fields so a multi-sentence Appium
// message cannot break the TSV.
export function grantLogLine({ timestamp, udid, outcome, detail }) {
  const cell = (value) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  return `${cell(timestamp)}\t${cell(udid)}\t${cell(outcome)}\t${cell(detail)}\n`;
}

export function recordGrantAttempt(udid, outcome, detail, { logPath = GRANT_LOG } = {}) {
  mkdirSync(join(logPath, '..'), { recursive: true });
  if (!existsSync(logPath)) appendFileSync(logPath, 'timestamp\tudid\toutcome\tdetail\n');
  appendFileSync(
    logPath,
    grantLogLine({ timestamp: new Date().toISOString(), udid, outcome, detail })
  );
}

function readGrantLog({ logPath = GRANT_LOG } = {}) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [timestamp, udid, outcome, detail] = line.split('\t');
      return { timestamp, udid, outcome, detail };
    });
}

// The log's outcome vocabulary is classifyLaunchProbe's ('ok' / 'blocked'
// plus a detail); a blocked row is a GRANT denial only when its detail names
// the UI-automation prompt — a locked device or a failed WDA build says
// nothing about the grant.
export function isGrantDenial(entry) {
  return (
    entry.outcome !== 'ok' && /UI automation|Enter iPad Passcode/i.test(String(entry.detail ?? ''))
  );
}

// What the log can currently say about grant lifetime, computed rather than
// guessed. `lastOkAgeMs` is how stale the newest successful launch is.
// `shortestOkToDeniedMs` is the tightest observed bound on how long a grant
// lasted — an ok followed (in time) by a grant denial on the same device. Both
// are null until the log holds the rows to support them; the summary never
// invents a lifetime the data cannot carry (the campaign's calibration rule).
export function grantLogSummary(entries, { udid, now = Date.now() } = {}) {
  const rows = entries
    .filter((entry) => !udid || entry.udid === udid)
    .map((entry) => ({ ...entry, at: Date.parse(entry.timestamp) }))
    .filter((entry) => Number.isFinite(entry.at))
    .sort((a, b) => a.at - b.at);
  const oks = rows.filter((entry) => entry.outcome === 'ok');
  const lastOk = oks.at(-1) ?? null;
  let shortestOkToDeniedMs = null;
  for (const denial of rows.filter(isGrantDenial)) {
    const priorOk = oks.filter((entry) => entry.at < denial.at).at(-1);
    if (!priorOk) continue;
    const gap = denial.at - priorOk.at;
    if (shortestOkToDeniedMs === null || gap < shortestOkToDeniedMs) shortestOkToDeniedMs = gap;
  }
  return {
    attempts: rows.length,
    lastOkAgeMs: lastOk ? now - lastOk.at : null,
    shortestOkToDeniedMs,
  };
}

function formatAge(ms) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// The one-line grant context the preflight prints before it attempts a
// launch: how stale the last good grant is, and the tightest lifetime bound
// the log has actually observed — never a guessed one.
export function describeGrantHistory(udid, { entries = readGrantLog(), now = Date.now() } = {}) {
  const summary = grantLogSummary(entries, { udid, now });
  if (!summary.attempts) return 'Grant log: no recorded launch attempts for this iPad yet.';
  const lastOk =
    summary.lastOkAgeMs === null
      ? 'no successful launch on record'
      : `last successful launch ${formatAge(summary.lastOkAgeMs)} ago`;
  const lifetime =
    summary.shortestOkToDeniedMs === null
      ? 'grant lifetime unmeasured so far (no ok-then-denial pair on record)'
      : `shortest observed grant lifetime under ${formatAge(summary.shortestOkToDeniedMs)}`;
  return `Grant log: ${lastOk}; ${lifetime}.`;
}
