import { readFileSync } from 'node:fs';
import { SEVERITIES } from './seeds.mjs';

// A finding anchored within this many lines of the seeded range still counts: the rival may anchor
// to the context line that motivates the finding rather than the changed line itself, and the
// packet renders three lines of context around every hunk.
export const ANCHOR_TOLERANCE_LINES = 3;

const severityRank = (severity) => SEVERITIES.indexOf(severity);

function anchorsNear(finding, [first, last]) {
  const start = finding.startLine ?? finding.line;
  return finding.line >= first - ANCHOR_TOLERANCE_LINES && start <= last + ANCHOR_TOLERANCE_LINES;
}

function namesDefect(finding, keywords) {
  const body = finding.body.toLowerCase();
  return keywords.some((keyword) => body.includes(keyword.toLowerCase()));
}

// A finding matches the key when it anchors to the seeded file at the seeded lines, or anchors to
// the seeded file and names the defect. Path is required either way: a finding about the same words
// in a different file is a different finding.
export function matchesKey(finding, key) {
  if (finding.path !== key.path) return false;
  return anchorsNear(finding, key.lines) || namesDefect(finding, key.keywords);
}

export function scoreCell({ key, findings }) {
  if (key.control) {
    return { detected: null, severityMet: null, falsePositives: findings.length, matching: [] };
  }
  const matching = findings.filter((finding) => matchesKey(finding, key));
  const detected = matching.length > 0;
  const severityMet =
    detected &&
    matching.some((finding) => severityRank(finding.severity) >= severityRank(key.severity));
  return { detected, severityMet, falsePositives: findings.length - matching.length, matching };
}

// Both vendors report usage differently: Codex's input_tokens already includes the cached share,
// Claude's excludes it and reports cache reads and writes beside it.
export function normalizeUsage(rival, usage) {
  if (!usage) return { input: 0, cached: 0, output: 0 };
  if (rival === 'claude') {
    const cached = (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
    return { input: (usage.input_tokens ?? 0) + cached, cached, output: usage.output_tokens ?? 0 };
  }
  return {
    input: usage.input_tokens ?? 0,
    cached: usage.cached_input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
  };
}

// The rival's own shell activity, read from the stream log the launcher kept: how much it verified
// itself before asking, and how much of that its sandbox refused.
export function countLocalCommands(logPath, rival) {
  let started = 0;
  let failed = 0;
  // Claude's failed results are matched to the Bash calls they answer; a refused Read or an
  // errored broker call is not a failed local command (the first Claude rival round found the
  // count inflated by both).
  const bashCalls = new Set();
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (rival === 'claude') {
      if (event.type === 'assistant') {
        for (const block of event.message?.content ?? []) {
          if (block.type === 'tool_use' && block.name === 'Bash') {
            started += 1;
            bashCalls.add(block.id);
          }
        }
      } else if (event.type === 'user') {
        for (const block of event.message?.content ?? []) {
          if (block.type === 'tool_result' && block.is_error && bashCalls.has(block.tool_use_id)) {
            failed += 1;
          }
        }
      }
      continue;
    }
    if (event.item?.type !== 'command_execution') continue;
    if (event.type === 'item.started') started += 1;
    if (event.type === 'item.completed' && event.item.exit_code) failed += 1;
  }
  return { started, failed };
}

const mean = (values) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

// One row per rival: recall over the seeded cells, false positives over the controls, and the cost
// side (handler turns, local commands, wall clock, tokens) over every finished cell.
export function summarize(cells) {
  const rivals = [...new Set(cells.map((cell) => cell.rival))];
  return rivals.map((rival) => {
    const finished = cells.filter((cell) => cell.rival === rival && !cell.failed);
    const seeded = finished.filter((cell) => !cell.control);
    const controls = finished.filter((cell) => cell.control);
    return {
      rival,
      cells: cells.filter((cell) => cell.rival === rival).length,
      failedCells: cells.filter((cell) => cell.rival === rival && cell.failed).length,
      seededCells: seeded.length,
      detected: seeded.filter((cell) => cell.score.detected).length,
      severityMet: seeded.filter((cell) => cell.score.severityMet).length,
      seededFalsePositives: seeded.reduce((sum, cell) => sum + cell.score.falsePositives, 0),
      controlCells: controls.length,
      controlFalsePositives: controls.reduce((sum, cell) => sum + cell.score.falsePositives, 0),
      unverified: finished.reduce((sum, cell) => sum + cell.unverified, 0),
      meanTurns: mean(finished.map((cell) => cell.turns.approved + cell.turns.declined)),
      meanDeclined: mean(finished.map((cell) => cell.turns.declined)),
      meanLocalCommands: mean(finished.map((cell) => cell.localCommands.started)),
      meanLocalFailed: mean(finished.map((cell) => cell.localCommands.failed)),
      meanWallSeconds: mean(finished.map((cell) => cell.wallSeconds)),
      meanInput: mean(finished.map((cell) => cell.usage.input)),
      meanCached: mean(finished.map((cell) => cell.usage.cached)),
      meanOutput: mean(finished.map((cell) => cell.usage.output)),
    };
  });
}
