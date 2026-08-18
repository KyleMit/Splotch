import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GENERATION_JOB_TTL_MS } from '../../../web/src/lib/ai/limits.ts';
import { FREE_GENERATION_LIMIT } from '../../../web/src/lib/freeGenerations.ts';
import { IMAGE_REPORT_RETENTION_DAYS } from '../../../web/src/lib/imageReport.ts';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const compact = (value) => value.replace(/\s+/g, ' ');

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

  it('keeps the store declarations and parent-facing policy aligned', () => {
    expect(iosListing).toContain('**User Content → Customer Support**');
    expect(iosListing).toContain('**Identifiers → Device ID**');
    expect(iosListing).toContain('**Usage Data → Product Interaction**');
    expect(androidListing).toContain('**Device or other IDs**');
    expect(androidListing).toContain('**App activity → App interactions**');
    expect(compact(privacyPage)).toContain('platform-provided app or vendor identifier');
    expect(compact(privacyPage)).toContain('attempt and success counts');
  });

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
  });
});
