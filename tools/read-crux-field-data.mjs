// Reads Chrome UX Report (CrUX) field data for an origin and prints the p75 of each
// Core Web Vital with its good/needs-improvement/poor split. Read-only against a
// public Google API: nothing ships in the app bundle and no collection is added.
//
//   CRUX_API_KEY=… node tools/read-crux-field-data.mjs
//   CRUX_API_KEY=… node tools/read-crux-field-data.mjs --origin=https://splotch.art --form-factor=PHONE
//   CRUX_API_KEY=… node tools/read-crux-field-data.mjs --history      (40 weekly collection periods)
//   CRUX_API_KEY=… node tools/read-crux-field-data.mjs --json         (raw response)
//
// The key is a Google Cloud API key with the Chrome UX Report API enabled on its
// project; the API itself is free (default quota 150 queries per minute). Without a
// key every request returns a bare 404 HTML page, which is why this script insists
// on one instead of trying anonymously. An origin below CrUX's undisclosed traffic
// threshold answers 404 with a JSON `NOT_FOUND` status — that is the "no entry"
// outcome issue 1440 asks about, and this script exits 3 on it so a workflow can
// tell "no data" apart from "broken request".

import { parseArgs } from 'node:util';

const CRUX_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records';
const DEFAULT_ORIGIN = 'https://splotch.art';
const FORM_FACTORS = new Set(['PHONE', 'TABLET', 'DESKTOP', 'ALL']);
const METRIC_LABELS = {
  largest_contentful_paint: 'LCP (ms)',
  interaction_to_next_paint: 'INP (ms)',
  cumulative_layout_shift: 'CLS',
  first_contentful_paint: 'FCP (ms)',
  experimental_time_to_first_byte: 'TTFB (ms)',
  round_trip_time: 'RTT (ms)',
  form_factors: 'form factors',
  navigation_types: 'navigation types',
};
const EXIT_NO_DATA = 3;

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      origin: { type: 'string', default: DEFAULT_ORIGIN },
      'form-factor': { type: 'string', default: 'ALL' },
      history: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });
  const formFactor = values['form-factor'].toUpperCase();
  if (!FORM_FACTORS.has(formFactor)) {
    throw new Error(`--form-factor must be one of ${[...FORM_FACTORS].join(', ')}`);
  }
  return { origin: values.origin, formFactor, history: values.history, json: values.json };
}

export function buildRequest({ origin, formFactor, history }, apiKey) {
  const method = history ? 'queryHistoryRecord' : 'queryRecord';
  const body = { origin };
  if (formFactor !== 'ALL') body.formFactor = formFactor;
  return {
    url: `${CRUX_ENDPOINT}:${method}?key=${encodeURIComponent(apiKey)}`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  };
}

export function summarizeRecord(record) {
  const rows = [];
  for (const [metric, data] of Object.entries(record.metrics ?? {})) {
    if (!data.percentiles) continue;
    const p75 = data.percentiles.p75;
    const densities = (data.histogram ?? []).map((bin) => Math.round((bin.density ?? 0) * 100));
    rows.push({ metric: METRIC_LABELS[metric] ?? metric, p75, densities });
  }
  return rows;
}

function formatTable(rows) {
  const width = Math.max(...rows.map((row) => row.metric.length), 'metric'.length);
  const lines = [`${'metric'.padEnd(width)}  p75       good / needs-improvement / poor`];
  for (const row of rows) {
    const split = row.densities.length ? row.densities.map((d) => `${d}%`).join(' / ') : '—';
    lines.push(`${row.metric.padEnd(width)}  ${String(row.p75).padEnd(8)}  ${split}`);
  }
  return lines.join('\n');
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const apiKey = process.env.CRUX_API_KEY;
  if (!apiKey) {
    console.error(
      'CRUX_API_KEY is not set. Create a Google Cloud API key with the Chrome UX Report API enabled and export it.'
    );
    process.exitCode = 2;
    return;
  }

  const { url, init } = buildRequest(options, apiKey);
  const response = await fetch(url, init);
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    console.error(`CrUX returned HTTP ${response.status} with a non-JSON body:\n${text.slice(0, 400)}`);
    process.exitCode = 1;
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  }

  if (!response.ok) {
    const status = payload.error?.status;
    if (response.status === 404 && status === 'NOT_FOUND') {
      console.log(
        `No CrUX entry for ${options.origin} (${options.formFactor}): the origin is below the anonymization threshold.`
      );
      process.exitCode = EXIT_NO_DATA;
      return;
    }
    console.error(`CrUX error ${response.status} ${status ?? ''}: ${payload.error?.message ?? text}`);
    process.exitCode = 1;
    return;
  }

  if (options.json) return;

  if (options.history) {
    const periods = payload.record?.collectionPeriods ?? [];
    console.log(`${periods.length} weekly collection periods for ${options.origin}`);
    const lcp = payload.record?.metrics?.largest_contentful_paint?.percentilesTimeseries?.p75s ?? [];
    console.log(`LCP p75 series (oldest → newest): ${lcp.join(', ')}`);
    return;
  }

  const period = payload.record?.collectionPeriod;
  const from = period?.firstDate;
  const to = period?.lastDate;
  console.log(
    `CrUX ${options.formFactor} for ${options.origin}, 28-day window ${from?.year}-${from?.month}-${from?.day} → ${to?.year}-${to?.month}-${to?.day}`
  );
  console.log(formatTable(summarizeRecord(payload.record)));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
