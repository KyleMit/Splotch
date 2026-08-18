import { readFileSync } from 'node:fs';
import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { GENERATION_JOB_TTL_MS } from '../../../web/src/lib/ai/limits.ts';
import { FREE_GENERATION_LIMIT } from '../../../web/src/lib/freeGenerations.ts';
import { IMAGE_REPORT_RETENTION_DAYS } from '../../../web/src/lib/imageReport.ts';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const compact = (value) => value.replace(/\s+/g, ' ');
const privacyInventory = JSON.parse(read('tools/mobile/privacy-permission-inventory.json'));

const IOS_LISTING_PATH = 'store-assets/STORE-LISTING-IOS.md';
const ANDROID_LISTING_PATH = 'store-assets/STORE-LISTING-ANDROID.md';
const PRIVACY_PAGE_PATH = 'web/src/routes/privacy/+page.svelte';
const NATIVE_DOC_PATH = 'docs/MOBILE/native.md';
const API_DOC_PATH = 'docs/API.md';

describe('privacy disclosure consistency', () => {
  const iosListing = read(IOS_LISTING_PATH);
  const androidListing = read(ANDROID_LISTING_PATH);
  const privacyPage = read(PRIVACY_PAGE_PATH);
  const nativeDoc = read(NATIVE_DOC_PATH);
  const apiDoc = read(API_DOC_PATH);

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
      expect(
        host.dataCategoryIds.every((id) => categoryIds.includes(id)),
        host.id
      ).toBe(true);
      expect(host.implementationEvidence.length, host.id).toBeGreaterThan(0);
    }
  });

  for (const category of privacyInventory.dataCategories) {
    it(`keeps ${category.id} aligned across the store declarations and parent-facing policy`, () => {
      for (const fact of category.storeListingFacts.ios) expect(iosListing).toContain(fact);
      for (const fact of category.storeListingFacts.android) expect(androidListing).toContain(fact);
      for (const fact of category.privacyPageFacts) {
        expect(compact(privacyPage)).toContain(fact);
      }
    });
  }

  it('derives driftable privacy claims from their implementation constants', () => {
    const freeLimit = String(FREE_GENERATION_LIMIT);
    const reportDays = String(IMAGE_REPORT_RETENTION_DAYS);
    const jobMinutes = String(GENERATION_JOB_TTL_MS / 60_000);

    expect(privacyPage).toContain('FREE_GENERATION_LIMIT');
    expect(privacyPage).toContain('IMAGE_REPORT_RETENTION_DAYS');
    expect(privacyPage).toContain('GENERATION_JOB_TTL_MS');
    expect(iosListing).toContain(`up to ${freeLimit} free creations`);
    expect(androidListing).toContain(`up to ${freeLimit} free creations`);
    expect(iosListing).toContain(`after ${reportDays} days`);
    expect(androidListing).toContain(`after ${reportDays} days`);
    expect(compact(nativeDoc)).toContain(`expire after ${jobMinutes} minutes`);
    expect(compact(apiDoc)).toContain(`expires after ${jobMinutes} minutes`);
    expect(
      privacyInventory.retentionBoundaries.find(({ id }) => id === 'ordinary-generation-job')
        .boundary
    ).toMatchObject({ value: Number(jobMinutes), unit: 'minutes', cleanupCadence: 'hourly' });
    expect(
      privacyInventory.retentionBoundaries.find(({ id }) => id === 'confirmed-ai-report').boundary
    ).toMatchObject({ value: Number(reportDays), unit: 'days', cleanupCadence: 'daily' });
  });

  for (const retention of privacyInventory.retentionBoundaries) {
    it(`keeps the ${retention.id} boundary in the parent-facing policy`, () => {
      for (const fact of retention.privacyPageFacts) {
        expect(compact(privacyPage)).toContain(fact);
      }
    });
  }

  for (const host of privacyInventory.outboundHosts) {
    it(`grounds the ${host.id} host class in shipped call sites and the parent-facing policy`, () => {
      for (const evidence of host.implementationEvidence) {
        expect(read(evidence.path), `${host.id}: ${evidence.path}`).toContain(evidence.contains);
      }
      for (const fact of host.privacyPageFacts) {
        expect(compact(privacyPage), host.id).toContain(fact);
      }
    });
  }

  it('pins fixed production hosts without freezing same-origin development and preview hosts', () => {
    const firstParty = privacyInventory.outboundHosts.find(
      ({ id }) => id === 'first-party-services'
    );
    const github = privacyInventory.outboundHosts.find(({ id }) => id === 'github-api');
    const openai = privacyInventory.outboundHosts.find(({ id }) => id === 'openai-api');
    const viteConfig = read('web/vite.config.ts');
    const githubSource = read('web/src/lib/server/github.ts');
    const openaiSource = read('web/src/lib/server/ai/openai.ts');

    expect(firstParty.hostPolicy).toBe('same-origin-web-and-worker-fixed-production-native');
    expect(firstParty.productionHosts).toEqual([
      new URL(viteConfig.match(/NATIVE_API_BASE = isCapacitor \? '([^']+)'/)?.[1]).host,
    ]);
    expect(github.productionHosts).toEqual([
      new URL(githubSource.match(/GITHUB_API = '([^']+)'/)?.[1]).host,
    ]);
    expect(openai.hostPolicy).toBe('openai-sdk-default');
    expect(openaiSource).not.toMatch(/\bbaseURL\s*:/);
    expect(openai.productionHosts).toEqual([new URL(new OpenAI({ apiKey: 'test' }).baseURL).host]);
  });
});
