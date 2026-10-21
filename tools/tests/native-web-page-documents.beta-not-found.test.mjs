// The page documents step 3 of issue 3007 adds beside the route table's: the web-only /beta,
// the not-found document, and the drawing screen's own <noscript>.
import { describe, expect, it, vi } from 'vitest';
import {
  APP_PAGE_PATHS,
  DOCUMENT_ONLY_PAGE_PATHS,
  appPageAt,
} from '../../experiments/native-architecture/src/information/appPages.ts';
import { crossDocumentNavigation } from '../../experiments/native-architecture/src/pageDocument/appDocument.ts';
import {
  NATIVE_APP_DOCUMENT_PATHS,
  isNativeAppNavigation,
  withDrawingNoscript,
} from '../migration/build-native-web.mjs';

const EXPORTED_DOCUMENT = [
  '<!doctype html><html lang="en"><head><title>Splotch</title></head><body>',
  '<!-- Use static rendering with Expo Router to support running without JavaScript. -->',
  '<noscript> You need to enable JavaScript to run this app. </noscript>',
  '<div id="root"></div></body></html>',
].join('\n');

describe('the web-only beta document', () => {
  // /beta's store links stay out of the native app and the drawing screen's bundle, so the drawing
  // screen never routes to it: a host serves beta.html, and the shell answers it as not found.
  it('keeps a document-only page out of the paths the drawing screen routes', () => {
    expect(APP_PAGE_PATHS).not.toHaveProperty('beta');
    expect(appPageAt(DOCUMENT_ONLY_PAGE_PATHS.beta)).toBe('notFound');
    expect(NATIVE_APP_DOCUMENT_PATHS).not.toContain(DOCUMENT_ONLY_PAGE_PATHS.beta);
    expect(
      isNativeAppNavigation({
        request: { mode: 'navigate' },
        url: new URL('https://splotch.art/beta'),
      })
    ).toBe(false);
  });
});

describe("the not-found document's navigation", () => {
  it('loads every page by its document from the not-found document', () => {
    const openInPlace = vi.fn();
    const assign = vi.fn();
    const open = crossDocumentNavigation('notFound', openInPlace, { assign });
    open('drawing');
    open('privacy');
    expect(openInPlace).not.toHaveBeenCalled();
    expect(assign.mock.calls).toEqual([['/'], ['/privacy']]);
  });
});

describe("the drawing screen's document without JavaScript", () => {
  it("replaces Expo's bare line with a note linking the pages that read without a script", () => {
    const shell = withDrawingNoscript(EXPORTED_DOCUMENT);
    expect(shell).not.toContain('You need to enable JavaScript');
    expect(shell).not.toContain('Use static rendering with Expo Router');
    const note = /<noscript>([\s\S]*?)<\/noscript>/.exec(shell)[1];
    expect(note).toContain('Splotch needs JavaScript to draw');
    expect([...note.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([
      '/changelog',
      '/privacy',
    ]);
    // Inline style attributes only: a <style> would count toward the drawing screen's first paint.
    expect(note).not.toContain('<style');
  });

  it('refuses a shell with no Expo line to replace', () => {
    expect(() => withDrawingNoscript('<html><body></body></html>')).toThrow(
      'The app shell has no Expo <noscript> to replace.'
    );
  });
});
