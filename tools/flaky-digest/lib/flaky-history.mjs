// The persisted history a digest ranks: every Tests-workflow report job the harvester has seen,
// every report artifact it has read, and the flaky.json record each one carried. Report artifacts
// expire (`retention-days` on the upload steps in .github/workflows/test.yml); this history is
// what outlives them, carried forward from one scheduled harvest to the next as its own artifact.

// Deliberately a local literal rather than an import of FLAKY_RECORD_SCHEMA_VERSION: it names the
// record shape this reader understands, so a producer bump fails flaky-history.test.mjs until the
// reader is taught the new shape instead of silently misreading it.
export const READABLE_FLAKY_RECORD_SCHEMA_VERSION = 1;
export const FLAKY_RECORD_FILENAME = 'flaky.json';

// Bumped when a stored field changes meaning or goes away. A history this reader cannot read is
// fatal rather than restarted, because restarting would drop every expired artifact it summarised.
const FLAKY_HISTORY_SCHEMA_VERSION = 1;
export const FLAKY_HISTORY_FILENAME = 'flaky-history.json';
export const FLAKY_HISTORY_ARTIFACT_NAME = 'flaky-digest-history';

// How far back the history keeps runs. Independent of how long any one history artifact is
// retained: every harvest re-uploads the whole rolled-forward history.
export const HISTORY_RETENTION_DAYS = 90;

// The report artifacts' own retention, matched against test.yml by flaky-digest-workflow.test.mjs.
export const REPORT_ARTIFACT_RETENTION_DAYS = 7;

export const TESTS_WORKFLOW_FILE = 'test.yml';

const DAY_MS = 24 * 60 * 60 * 1000;

// Job name → the artifact its upload step writes. The names are test.yml's `name:` templates for
// the sharded Tests job and the two engine smoke jobs; flaky-digest-workflow.test.mjs pins both
// sides.
const REPORT_JOBS = [
  {
    pattern: /^Tests \((\d+)\/(\d+)\)$/,
    artifact: (match) => `playwright-report-shard-${match[1]}`,
  },
  { pattern: /^Firefox smoke$/, artifact: () => 'playwright-report-firefox' },
  { pattern: /^WebKit smoke$/, artifact: () => 'playwright-report-webkit' },
];

export const REPORT_ARTIFACT_PATTERN = /^playwright-report-(shard-\d+|firefox|webkit)$/;

export function reportArtifactForJob(jobName) {
  for (const { pattern, artifact } of REPORT_JOBS) {
    const match = pattern.exec(jobName);
    if (match) return artifact(match);
  }
  return null;
}

// The upload steps run `if: !cancelled()`, so a job only uploads when it reached a verdict. A job
// cut off by `timeout-minutes` concludes `cancelled` and uploads nothing.
export const UPLOADING_CONCLUSIONS = new Set(['success', 'failure']);

// Playwright statuses a digest counts. An interrupted or timed-out run still writes a record, and
// counting it would read as a small clean sample (see FlakyRecord.status in the reporter).
const COUNTED_RECORD_STATUSES = new Set(['passed', 'failed']);

export function createHistory() {
  return {
    schemaVersion: FLAKY_HISTORY_SCHEMA_VERSION,
    harvests: [],
    runs: {},
    artifacts: {},
  };
}

export function parseHistory(text, source) {
  let history;
  try {
    history = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${error.message}`, { cause: error });
  }
  if (history?.schemaVersion !== FLAKY_HISTORY_SCHEMA_VERSION) {
    throw new Error(
      `${source} has history schemaVersion ${JSON.stringify(history?.schemaVersion)}; this reader ` +
        `understands ${FLAKY_HISTORY_SCHEMA_VERSION}. Refusing to overwrite it.`
    );
  }
  return history;
}

/**
 * One entry per job execution. A re-run attempt lists the jobs it carried over from the previous
 * attempt again, unchanged; only the lowest attempt of an identical execution is the one that ran.
 */
export function reportExecutions(jobs) {
  const byExecution = new Map();
  for (const job of jobs) {
    const artifact = reportArtifactForJob(job.name);
    if (!artifact) continue;
    const key = `${job.name}|${job.started_at}|${job.completed_at}`;
    const existing = byExecution.get(key);
    if (existing && existing.attempt <= job.run_attempt) continue;
    byExecution.set(key, {
      artifact,
      attempt: job.run_attempt,
      conclusion: job.conclusion,
      completedAt: job.completed_at,
    });
  }
  return [...byExecution.values()].sort(
    (a, b) => a.artifact.localeCompare(b.artifact) || a.attempt - b.attempt
  );
}

export function classifyRecordText(text) {
  if (text === null) return { state: 'no-record' };
  let record;
  try {
    record = JSON.parse(text);
  } catch (error) {
    return { state: 'unreadable', error: `${FLAKY_RECORD_FILENAME} is not JSON: ${error.message}` };
  }
  if (record?.schemaVersion !== READABLE_FLAKY_RECORD_SCHEMA_VERSION) {
    return { state: 'unsupported-schema', schemaVersion: record?.schemaVersion ?? null };
  }
  if (!Array.isArray(record.flaky) || typeof record.tests !== 'number') {
    return { state: 'unreadable', error: `${FLAKY_RECORD_FILENAME} lacks flaky[] or tests` };
  }
  const { run, shard, status, tests, flaky } = record;
  return { state: 'read', record: { run, shard, status, tests, flaky } };
}

export function isCountedRecord(record) {
  return COUNTED_RECORD_STATUSES.has(record.status);
}

// Every harvest relists the whole retention window: a run re-run days later gains a new attempt and
// new artifacts, and a run still in progress at the previous harvest has finished since. When the
// previous harvest is older than that window, listing reaches back to it instead, so the runs
// whose artifacts expired during the outage are listed and surface as gaps rather than vanishing.
function listSince(history, now) {
  const retentionStart = now.getTime() - REPORT_ARTIFACT_RETENTION_DAYS * DAY_MS;
  const last = history.harvests.at(-1);
  if (!last) return new Date(retentionStart);
  return new Date(Math.min(retentionStart, new Date(last.at).getTime()));
}

// Parallel API requests. A scheduled harvest makes few, but a fresh history or one after an outage
// lists jobs for hundreds of runs and reads thousands of report zips, one request each.
const API_CONCURRENCY = 8;

/** Runs `step` over `items` in parallel until they run out or `canContinue` fails; returns the count left. */
async function forEachConcurrently(items, step, canContinue = () => true) {
  const queue = [...items];
  const worker = async () => {
    while (queue.length > 0 && canContinue()) await step(queue.shift());
  };
  await Promise.all(Array.from({ length: API_CONCURRENCY }, worker));
  return queue.length;
}

function recordRunArtifacts(history, runId, artifacts) {
  let added = 0;
  for (const artifact of artifacts) {
    if (!REPORT_ARTIFACT_PATTERN.test(artifact.name)) continue;
    const id = String(artifact.id);
    const known = history.artifacts[id];
    if (!known) added += 1;
    history.artifacts[id] = {
      ...known,
      id,
      name: artifact.name,
      runId,
      createdAt: artifact.created_at,
      expiresAt: artifact.expires_at,
      state: known?.state ?? (artifact.expired ? 'expired-unread' : 'pending'),
    };
  }
  return added;
}

/**
 * Lists the Tests runs since `since` and, for each completed run not already settled at its current
 * attempt, its report jobs and its artifacts. Artifacts are listed per run rather than from the
 * repository-wide list, whose id order does not reliably follow creation time. A rate limit stops
 * the fetching: the rest keep `executions: null`, surface as jobs-unavailable, and are fetched by
 * the next harvest.
 */
async function refreshRuns(api, history, since, errors) {
  const runs = await api.listWorkflowRuns(TESTS_WORKFLOW_FILE, since);
  const unsettled = runs.filter((run) => {
    const known = history.runs[run.id];
    return !(
      known?.status === 'completed' &&
      known.attempt === run.run_attempt &&
      known.executions
    );
  });
  const completed = [];
  for (const run of unsettled) {
    const entry = {
      id: String(run.id),
      event: run.event,
      branch: run.head_branch,
      headSha: run.head_sha,
      createdAt: run.created_at,
      status: run.status,
      conclusion: run.conclusion,
      attempt: run.run_attempt,
      url: run.html_url,
      executions: null,
    };
    history.runs[entry.id] = entry;
    if (run.status === 'completed') completed.push(entry);
  }
  let limited = false;
  let artifactsAdded = 0;
  await forEachConcurrently(
    completed,
    async (entry) => {
      try {
        const [jobs, artifacts] = await Promise.all([
          api.listJobs(entry.id),
          api.listRunArtifacts(entry.id),
        ]);
        artifactsAdded += recordRunArtifacts(history, entry.id, artifacts);
        entry.executions = reportExecutions(jobs);
      } catch (error) {
        if (error?.fatal) throw error;
        if (error?.rateLimited) limited = true;
        else errors.push(`run ${entry.id}: jobs or artifacts unavailable: ${error.message}`);
      }
    },
    () => !limited
  );
  if (limited) {
    const unfetched = completed.filter((entry) => !entry.executions).length;
    errors.push(`rate limit reached listing runs: ${unfetched} runs left for the next harvest`);
  }
  return { runsListed: runs.length, artifactsAdded };
}

async function readArtifact(api, artifact, errors) {
  try {
    const outcome = classifyRecordText(
      await api.readArtifactFile(artifact.id, FLAKY_RECORD_FILENAME)
    );
    delete artifact.error;
    Object.assign(artifact, outcome);
    return 'read';
  } catch (error) {
    if (error?.fatal) throw error;
    if (error?.rateLimited) return 'rate-limited';
    artifact.state = 'unreadable';
    artifact.error = error.message;
    errors.push(
      `artifact ${artifact.id} (${artifact.name}, run ${artifact.runId}): ${error.message}`
    );
    return 'unreadable';
  }
}

async function readPendingArtifacts(api, history, now, errors) {
  const nowIso = now.toISOString();
  const unread = Object.values(history.artifacts).filter(
    (artifact) => artifact.state === 'pending' || artifact.state === 'unreadable'
  );
  for (const artifact of unread) {
    if (artifact.expiresAt <= nowIso) artifact.state = 'expired-unread';
  }
  // Soonest-expiring first: when the rate-limit budget runs out, what is left is what survives
  // longest for the next harvest.
  const queue = unread
    .filter((artifact) => artifact.state !== 'expired-unread')
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  let read = 0;
  let limited = 0;
  const left = await forEachConcurrently(
    queue,
    async (artifact) => {
      const outcome = await readArtifact(api, artifact, errors);
      if (outcome === 'read') read += 1;
      if (outcome === 'rate-limited') limited += 1;
    },
    () => limited === 0 && api.hasBudgetForDownload()
  );
  if (left + limited > 0) {
    errors.push(`rate-limit budget reached: ${left + limited} artifacts left for the next harvest`);
  }
  return read;
}

function pruneHistory(history, now) {
  const cutoff = new Date(now.getTime() - HISTORY_RETENTION_DAYS * DAY_MS).toISOString();
  for (const [id, run] of Object.entries(history.runs)) {
    if (run.createdAt < cutoff) delete history.runs[id];
  }
  for (const [id, artifact] of Object.entries(history.artifacts)) {
    if (!history.runs[artifact.runId]) delete history.artifacts[id];
  }
}

/**
 * Brings the history up to date against the live Actions API. Per-item failures are recorded and
 * reported, never thrown: a partial harvest still persists what it read, and whatever it could not
 * read stays pending or unreadable for the next one.
 */
export async function harvest(api, history, now) {
  const since = listSince(history, now);
  const errors = [];
  const { runsListed, artifactsAdded } = await refreshRuns(api, history, since, errors);
  const artifactsRead = await readPendingArtifacts(api, history, now, errors);
  pruneHistory(history, now);
  const summary = {
    at: now.toISOString(),
    listedSince: since.toISOString(),
    runsListed,
    artifactsAdded,
    artifactsRead,
    errors,
  };
  history.harvests.push(summary);
  return summary;
}
