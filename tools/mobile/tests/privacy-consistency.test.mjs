import { readFileSync } from 'node:fs';
import OpenAI from 'openai';
import apiOrigin from '../api-origin.cjs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  IMAGE_REPORT_RETENTION_DAYS,
  IMAGE_REPORT_REVIEW_HOURS,
} from '../../../src/lib/imageReport.ts';
import { USAGE_RECORD_RETENTION_DAYS } from '../../../src/lib/usageRecord.ts';
import { NATIVE_API_ORIGIN } from '../../../netlify/securityPolicy.ts';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const compact = (value) => value.replace(/\s+/g, ' ');
const privacyInventory = JSON.parse(read('tools/mobile/privacy-permission-inventory.json'));

const IOS_LISTING_PATH = 'store-assets/STORE-LISTING-IOS.md';
const ANDROID_LISTING_PATH = 'store-assets/STORE-LISTING-ANDROID.md';
const NATIVE_DOC_PATH = 'docs/MOBILE/native.md';
const ANDROID_DOC_PATH = 'docs/MOBILE/android.md';
const IOS_DOC_PATH = 'docs/MOBILE/ios.md';
const COMPLIANCE_DOC_PATH = 'docs/MOBILE/compliance.md';
const API_DOC_PATH = 'docs/API.md';
const IMAGE_REPORT_ADR_PATH = 'docs/adrs/0104-retain-reported-ai-images-for-thirty-days.md';
const GENERATION_JOB_ADR_PATH = 'docs/adrs/0115-background-generation-jobs.md';
const USAGE_RECORD_ADR_PATH = 'docs/adrs/0025-netlify-blobs-server-storage.md';

// Netlify reads a scheduled function's exported `config` statically, so the
// schedule stays a literal there. It is parsed rather than matched as text,
// which would also match a stale schedule quoted in a comment.
function scheduledCadence(path) {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest);
  const config = source.statements
    .filter((statement) => ts.isVariableStatement(statement))
    .filter(({ modifiers }) => modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword))
    .flatMap(({ declarationList }) => declarationList.declarations)
    .find(({ name }) => ts.isIdentifier(name) && name.text === 'config')?.initializer;
  const schedule =
    config && ts.isObjectLiteralExpression(config)
      ? config.properties.find(
          (property) =>
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === 'schedule'
        )?.initializer
      : undefined;
  return schedule && ts.isStringLiteralLike(schedule)
    ? /^@(\w+)$/.exec(schedule.text)?.[1]
    : undefined;
}

describe('privacy disclosure consistency', () => {
  read(IOS_LISTING_PATH);
  read(ANDROID_LISTING_PATH);
  read(NATIVE_DOC_PATH);
  read(API_DOC_PATH);

  it('is a non-vacuous, internally linked inventory', () => {
    const categoryIds = privacyInventory.dataCategories.map(({ id }) => id);
    const retentionIds = privacyInventory.retentionBoundaries.map(({ id }) => id);
    const hostIds = privacyInventory.outboundHosts.map(({ id }) => id);

    expect(privacyInventory.schemaVersion).toBe(1);
    expect(new Set(categoryIds).size).toBe(categoryIds.length);
    expect(new Set(retentionIds).size).toBe(retentionIds.length);
    expect(new Set(hostIds).size).toBe(hostIds.length);
    expect(categoryIds.length).toBeGreaterThan(0);
    expect(retentionIds.length).toBeGreaterThan(0);
    expect(hostIds.length).toBeGreaterThan(0);
    for (const host of privacyInventory.outboundHosts) {
      expect(host.dataCategoryIds.length, host.id).toBeGreaterThan(0);
      expect(
        host.dataCategoryIds.every((id) => categoryIds.includes(id)),
        host.id
      ).toBe(true);
      expect(host.implementationEvidence.length, host.id).toBeGreaterThan(0);
    }
    for (const { id, boundary, cleanupImplementation } of privacyInventory.retentionBoundaries) {
      expect(cleanupImplementation !== undefined, id).toBe(boundary.cleanupCadence !== undefined);
    }
    for (const categoryId of categoryIds) {
      expect(
        privacyInventory.outboundHosts.some(({ dataCategoryIds }) =>
          dataCategoryIds.includes(categoryId)
        ),
        categoryId
      ).toBe(true);
    }
  });

  it('repeats the report review window from IMAGE_REPORT_REVIEW_HOURS in every Markdown copy', () => {
    const hours = IMAGE_REPORT_REVIEW_HOURS;
    const promises = [
      [IOS_LISTING_PATH, `A human reviews reports within ${hours} hours`],
      [ANDROID_LISTING_PATH, `Reports are reviewed within ${hours} hours`],
      [ANDROID_DOC_PATH, `humans review within ${hours} hours`],
      [COMPLIANCE_DOC_PATH, `human review within ${hours} hours`],
      [API_DOC_PATH, `Humans commit to reviewing reports within ${hours} hours`],
      [IMAGE_REPORT_ADR_PATH, `A human reviews reports within ${hours} hours`],
      [IMAGE_REPORT_ADR_PATH, `The ${hours}-hour response commitment`],
    ];
    for (const [path, promise] of promises) expect(compact(read(path)), path).toContain(promise);
  });

  it('repeats each purge cadence from its cleanupCadence in every Markdown copy', () => {
    const cadenceOf = (id) =>
      privacyInventory.retentionBoundaries.find((retention) => retention.id === id).boundary
        .cleanupCadence;
    const reportCadence = cadenceOf('confirmed-ai-report');
    const jobCadence = cadenceOf('ordinary-generation-job');
    const usageCadence = cadenceOf('access-code-usage');
    const reportDays = IMAGE_REPORT_RETENTION_DAYS;
    const usageDays = USAGE_RECORD_RETENTION_DAYS;
    const statements = [
      [IOS_LISTING_PATH, `deletion after ${reportDays} days by a ${reportCadence} purge`],
      [ANDROID_LISTING_PATH, `deletion after ${reportDays} days by a ${reportCadence} purge`],
      [COMPLIANCE_DOC_PATH, `at most ${reportDays} days (${reportCadence} purge job)`],
      [API_DOC_PATH, `store page ${reportCadence} and deletes report objects older than`],
      [ANDROID_DOC_PATH, `A ${reportCadence} purge deletes the bundle after its ${reportDays}-day`],
      [NATIVE_DOC_PATH, `until a ${reportCadence} purge after its ${reportDays}-day retention`],
      [IOS_DOC_PATH, `until the ${reportCadence} purge after their ${reportDays}-day retention`],
      [IMAGE_REPORT_ADR_PATH, `purge-image-reports.ts\` runs ${reportCadence}, iterates all`],
      [IMAGE_REPORT_ADR_PATH, `The purge runs ${reportCadence} and deletes bundles`],
      [IMAGE_REPORT_ADR_PATH, `deletion after ${reportDays} days by a ${reportCadence} purge`],
      [API_DOC_PATH, `an ${jobCadence} sweep deletes whatever was never collected`],
      [ANDROID_DOC_PATH, `an ${jobCadence} cleanup removes it`],
      [NATIVE_DOC_PATH, `an ${jobCadence} cleanup removes them`],
      [GENERATION_JOB_ADR_PATH, `an ${jobCadence} \`purge-generation-jobs\` sweep`],
      [API_DOC_PATH, `a ${usageCadence} scheduled function removes expired inactive records`],
      [ANDROID_DOC_PATH, `a ${usageCadence} purge removes expired records`],
      [IOS_DOC_PATH, `fixed ${usageDays}-day window plus ${usageCadence} and revocation cleanup`],
      [USAGE_RECORD_ADR_PATH, `purge-usage-records.ts\` scans the store ${usageCadence}`],
    ];
    for (const [path, statement] of statements) {
      expect(compact(read(path)), path).toContain(statement);
    }
  });

  for (const retention of privacyInventory.retentionBoundaries.filter(
    ({ boundary }) => boundary.cleanupCadence !== undefined
  )) {
    it(`runs the ${retention.id} cleanup on the cadence the policy states`, () => {
      expect(retention.cleanupImplementation, retention.id).toMatch(
        /^netlify\/functions\/[\w-]+\.ts$/
      );
      const cadence = scheduledCadence(retention.cleanupImplementation);

      expect(cadence, retention.cleanupImplementation).toBe(retention.boundary.cleanupCadence);
      expect(
        retention.privacyPageFacts.some((fact) =>
          fact.toLowerCase().includes(`${cadence} cleanup`)
        ),
        retention.id
      ).toBe(true);
    });
  }

  it('pins production defaults without freezing native build origins or same-origin hosts', () => {
    const firstParty = privacyInventory.outboundHosts.find(
      ({ id }) => id === 'first-party-services'
    );
    const github = privacyInventory.outboundHosts.find(({ id }) => id === 'github-api');
    const openai = privacyInventory.outboundHosts.find(({ id }) => id === 'openai-api');
    const githubSource = read('netlify/server/githubProduction.ts');
    const openaiSource = read('netlify/server/ai/openai.ts');

    expect(firstParty.hostPolicy).toBe('same-origin-web-and-worker-build-time-native');
    expect(firstParty.productionHosts).toEqual([new URL(NATIVE_API_ORIGIN).host]);
    expect(apiOrigin.readApiOrigin({})).toBe(NATIVE_API_ORIGIN);
    expect(
      apiOrigin.readApiOrigin({ EXPO_PUBLIC_SPLOTCH_API_ORIGIN: 'https://test.splotch.art' })
    ).toBe('https://test.splotch.art');
    for (const evidence of firstParty.implementationEvidence)
      expect(read(evidence.path)).toContain(evidence.contains);
    expect(github.productionHosts).toEqual([
      new URL(githubSource.match(/GITHUB_API = '([^']+)'/)?.[1]).host,
    ]);
    expect(openai.hostPolicy).toBe('openai-sdk-default');
    expect(openaiSource).not.toMatch(/\bbaseURL\s*:/);
    const previousBaseUrl = process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_BASE_URL;
    try {
      expect(openai.productionHosts).toEqual([
        new URL(new OpenAI({ apiKey: 'test' }).baseURL).host,
      ]);
    } finally {
      if (previousBaseUrl !== undefined) process.env.OPENAI_BASE_URL = previousBaseUrl;
    }
  });
});
