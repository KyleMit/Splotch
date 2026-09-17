// Turns a harvested history into the ranked digest: masked flakes summed per test with the
// provenance of every occurrence, and a coverage account in which every report job that did not
// yield a counted record is a named gap rather than an implicit clean sample.

import {
  isCountedRecord,
  REPORT_ARTIFACT_RETENTION_DAYS,
  UPLOADING_CONCLUSIONS,
} from './flaky-history.mjs';

const FLAKY_DIGEST_SCHEMA_VERSION = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

// A scheduled harvest runs several times a day; one older than this means the schedule stopped.
const STALE_HARVEST_HOURS = 24;

// Gap rows listed individually in the Markdown; the JSON always carries every one.
const MARKDOWN_GAP_ROWS = 40;

const TRUNK_BRANCH = 'main';

/** `trunk` is main outside pull requests; everything else is a branch under review. */
function runScope(run) {
  return run.branch === TRUNK_BRANCH && run.event !== 'pull_request' ? 'trunk' : 'branch';
}

function shardLabel(artifact) {
  const shard = artifact.record?.shard;
  return shard ? `${shard.current}/${shard.total}` : artifact.name;
}

/**
 * Pairs each report job execution with the artifact it uploaded. A read record names its attempt;
 * an artifact that was never read does not, so it goes to the latest unmatched execution of that
 * name — the upload a re-run would have left in place.
 */
function pairExecutions(run, artifacts) {
  const pairs = [];
  const unmatchedArtifacts = [...artifacts];
  const executions = [...run.executions].sort((a, b) => b.attempt - a.attempt);
  const take = (predicate) => {
    const index = unmatchedArtifacts.findIndex(predicate);
    return index === -1 ? null : unmatchedArtifacts.splice(index, 1)[0];
  };
  const unpaired = [];
  for (const execution of executions) {
    const artifact = take(
      (candidate) =>
        candidate.name === execution.artifact &&
        candidate.state === 'read' &&
        candidate.record.run?.attempt === execution.attempt
    );
    if (artifact) pairs.push({ execution, artifact });
    else unpaired.push(execution);
  }
  for (const execution of unpaired) {
    const artifact = UPLOADING_CONCLUSIONS.has(execution.conclusion)
      ? take((candidate) => candidate.name === execution.artifact && candidate.state !== 'read')
      : null;
    pairs.push({ execution, artifact });
  }
  return { pairs, unmatchedArtifacts };
}

function gapReason({ execution, artifact }, artifacts) {
  if (!UPLOADING_CONCLUSIONS.has(execution.conclusion)) return `job-${execution.conclusion}`;
  if (!artifact) {
    const replaced = artifacts.some(
      (candidate) =>
        candidate.name === execution.artifact && candidate.record?.run?.attempt > execution.attempt
    );
    return replaced ? 'replaced-by-later-attempt' : 'no-artifact';
  }
  if (artifact.state === 'read') {
    return isCountedRecord(artifact.record) ? null : `status-${artifact.record.status}`;
  }
  if (artifact.state === 'unsupported-schema') {
    return `unsupported-schema-${artifact.schemaVersion}`;
  }
  return artifact.state;
}

function occurrenceFor(run, artifact, date, pass) {
  const identity = artifact.record.run;
  return {
    runId: run.id,
    runUrl: run.url,
    attempt: identity?.attempt ?? null,
    branch: identity?.branch ?? run.branch,
    event: identity?.event ?? run.event,
    sha: identity?.sha ?? run.headSha,
    headSha: run.headSha,
    date,
    shard: shardLabel(artifact),
    artifact: artifact.name,
    scope: runScope(run),
    attempts: pass.attempts,
  };
}

function emptyTally() {
  return { runs: 0, samples: 0, tests: 0, flakeEvents: 0 };
}

function recordSample(context, run, artifact, date) {
  const scope = runScope(run);
  const tally = context.tallies[scope];
  tally.samples += 1;
  tally.tests += artifact.record.tests;
  for (const pass of artifact.record.flaky) {
    tally.flakeEvents += 1;
    const key = `${pass.project}|${pass.file}|${pass.title}`;
    const entry = context.ranking.get(key) ?? {
      title: pass.title,
      project: pass.project,
      file: pass.file,
      events: 0,
      trunkEvents: 0,
      branchEvents: 0,
      lastSeen: date,
      occurrences: [],
    };
    entry.events += 1;
    entry[`${scope}Events`] += 1;
    if (date > entry.lastSeen) entry.lastSeen = date;
    entry.occurrences.push(occurrenceFor(run, artifact, date, pass));
    context.ranking.set(key, entry);
  }
  context.sampleDates.push(date);
}

function addGap(context, run, reason, detail) {
  context.gaps.push({
    runId: run.id,
    runUrl: run.url,
    branch: run.branch,
    event: run.event,
    scope: runScope(run),
    createdAt: run.createdAt,
    reason,
    ...detail,
  });
}

function accountRun(context, run, artifacts) {
  context.tallies[runScope(run)].runs += 1;
  if (!run.executions) {
    addGap(context, run, run.status === 'completed' ? 'jobs-unavailable' : 'run-in-progress', {});
    return;
  }
  const { pairs, unmatchedArtifacts } = pairExecutions(run, artifacts);
  for (const pair of pairs) {
    const reason = gapReason(pair, artifacts);
    const date = pair.execution.completedAt ?? pair.artifact?.createdAt ?? run.createdAt;
    if (reason) {
      addGap(context, run, reason, {
        artifact: pair.execution.artifact,
        attempt: pair.execution.attempt,
        ...(pair.artifact?.error ? { error: pair.artifact.error } : {}),
      });
    } else {
      recordSample(context, run, pair.artifact, date);
    }
  }
  for (const artifact of unmatchedArtifacts) {
    if (artifact.state === 'read' && isCountedRecord(artifact.record)) {
      recordSample(context, run, artifact, artifact.createdAt);
      context.recordsWithoutJob += 1;
    }
  }
}

function historyCoversSince(history) {
  return history.harvests[0]?.listedSince ?? null;
}

function harvestWarnings(history, context, now, windowStart) {
  const warnings = [];
  const coversSince = historyCoversSince(history);
  if (coversSince && coversSince > windowStart) {
    warnings.push(
      `The history covers runs since ${coversSince}, after the window opens: earlier runs were never harvested.`
    );
  }
  if (context.recordsWithoutJob > 0) {
    warnings.push(
      `${context.recordsWithoutJob} records were counted without a matching report job; the job list and artifacts disagree.`
    );
  }
  const harvests = history.harvests;
  for (let index = 1; index < harvests.length; index += 1) {
    const gapMs = new Date(harvests[index].at) - new Date(harvests[index - 1].at);
    if (gapMs > REPORT_ARTIFACT_RETENTION_DAYS * DAY_MS) {
      warnings.push(
        `No harvest between ${harvests[index - 1].at} and ${harvests[index].at}, longer than report ` +
          `artifact retention (${REPORT_ARTIFACT_RETENTION_DAYS} days): artifacts from then expired unread.`
      );
    }
  }
  const last = harvests.at(-1);
  if (!last) {
    warnings.push('The history has never been harvested.');
  } else {
    if (now - new Date(last.at) > STALE_HARVEST_HOURS * 60 * 60 * 1000) {
      warnings.push(
        `The latest harvest (${last.at}) is more than ${STALE_HARVEST_HOURS} hours old.`
      );
    }
    for (const error of last.errors) warnings.push(`Latest harvest: ${error}`);
  }
  return warnings;
}

export function buildDigest(history, { now, days }) {
  const windowStart = new Date(now.getTime() - days * DAY_MS).toISOString();
  const context = {
    tallies: { trunk: emptyTally(), branch: emptyTally() },
    ranking: new Map(),
    gaps: [],
    sampleDates: [],
    recordsWithoutJob: 0,
  };
  const artifactsByRun = new Map();
  for (const artifact of Object.values(history.artifacts)) {
    const list = artifactsByRun.get(artifact.runId) ?? [];
    list.push(artifact);
    artifactsByRun.set(artifact.runId, list);
  }
  const runs = Object.values(history.runs)
    .filter((run) => run.createdAt >= windowStart)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const run of runs) accountRun(context, run, artifactsByRun.get(run.id) ?? []);

  const ranking = [...context.ranking.values()]
    .map((entry) => ({
      ...entry,
      occurrences: entry.occurrences.sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort(
      (a, b) =>
        b.events - a.events || b.trunkEvents - a.trunkEvents || a.title.localeCompare(b.title)
    );
  const gapCounts = {};
  for (const gap of context.gaps) gapCounts[gap.reason] = (gapCounts[gap.reason] ?? 0) + 1;
  const dates = context.sampleDates.sort();

  return {
    schemaVersion: FLAKY_DIGEST_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    window: { days, from: windowStart, to: now.toISOString() },
    coverage: {
      historyCoversSince: historyCoversSince(history),
      lastHarvestAt: history.harvests.at(-1)?.at ?? null,
      firstSampleAt: dates[0] ?? null,
      lastSampleAt: dates.at(-1) ?? null,
      trunk: context.tallies.trunk,
      branch: context.tallies.branch,
      gapCounts,
    },
    warnings: harvestWarnings(history, context, now, windowStart),
    ranking,
    gaps: context.gaps,
  };
}

function escapeCell(text) {
  return String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function tallyLine(label, tally) {
  return `| ${label} | ${tally.runs} | ${tally.samples} | ${tally.tests} | ${tally.flakeEvents} |`;
}

function occurrenceLink(occurrence) {
  const label = `${occurrence.date.slice(0, 10)} ${occurrence.branch} run ${occurrence.runId} attempt ${occurrence.attempt} shard ${occurrence.shard}`;
  return occurrence.runUrl ? `[${escapeCell(label)}](${occurrence.runUrl})` : escapeCell(label);
}

export function renderDigestMarkdown(digest) {
  const { coverage, window } = digest;
  const lines = [
    `## Flaky test digest — last ${window.days} days`,
    '',
    `Window ${window.from} → ${window.to}. Samples span ${coverage.firstSampleAt ?? 'none'} → ${
      coverage.lastSampleAt ?? 'none'
    }; history covers runs since ${coverage.historyCoversSince ?? 'never'}, last harvest ${coverage.lastHarvestAt ?? 'never'}.`,
    '',
    '`trunk` is `main` outside pull requests; `branch` is every other run. A sample is one report job',
    'whose flaky.json was read, understood, and finished `passed` or `failed`.',
    '',
    '| Scope | Runs | Samples | Tests executed | Flake events |',
    '| --- | ---: | ---: | ---: | ---: |',
    tallyLine('trunk', coverage.trunk),
    tallyLine('branch', coverage.branch),
    '',
  ];
  if (digest.warnings.length > 0) {
    lines.push('### Warnings', '', ...digest.warnings.map((warning) => `* ${warning}`), '');
  }
  lines.push('### Ranking', '');
  if (digest.ranking.length === 0) {
    lines.push(
      'No masked flakes among the samples read. Check the gaps before reading this as clean.',
      ''
    );
  } else {
    lines.push(
      '| Events | trunk | branch | Last seen | Test | Occurrences |',
      '| ---: | ---: | ---: | --- | --- | --- |'
    );
    for (const entry of digest.ranking) {
      lines.push(
        `| ${entry.events} | ${entry.trunkEvents} | ${entry.branchEvents} | ${entry.lastSeen.slice(0, 10)} | ${escapeCell(
          `${entry.project} › ${entry.title}`
        )} | ${entry.occurrences.map(occurrenceLink).join('<br>')} |`
      );
    }
    lines.push('');
  }
  lines.push('### Gaps', '');
  const reasons = Object.entries(coverage.gapCounts).sort((a, b) => b[1] - a[1]);
  if (reasons.length === 0) {
    lines.push('Every report job in the window yielded a counted record.', '');
    return lines.join('\n');
  }
  lines.push(
    'Report jobs that yielded no counted record. None of these are clean runs.',
    '',
    '| Reason | Jobs |',
    '| --- | ---: |',
    ...reasons.map(([reason, count]) => `| ${reason} | ${count} |`),
    '',
    '| Run | Branch | Artifact | Attempt | Reason |',
    '| --- | --- | --- | ---: | --- |'
  );
  // A job that never reached an upload is listed after the gaps where a record was lost.
  const listed = [...digest.gaps].sort(
    (a, b) => Number(a.reason.startsWith('job-')) - Number(b.reason.startsWith('job-'))
  );
  for (const gap of listed.slice(0, MARKDOWN_GAP_ROWS)) {
    const run = gap.runUrl ? `[${gap.runId}](${gap.runUrl})` : gap.runId;
    lines.push(
      `| ${run} | ${escapeCell(gap.branch)} | ${gap.artifact ?? ''} | ${gap.attempt ?? ''} | ${gap.reason} |`
    );
  }
  if (digest.gaps.length > MARKDOWN_GAP_ROWS) {
    lines.push(
      '',
      `${digest.gaps.length - MARKDOWN_GAP_ROWS} more gaps are listed in flaky-digest.json.`
    );
  }
  lines.push('');
  return lines.join('\n');
}
