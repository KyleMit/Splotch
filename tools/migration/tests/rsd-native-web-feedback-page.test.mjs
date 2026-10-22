// The feedback page as the RN web export renders it: the form needs a script to send, so a page
// document read without one hides the form and says so in a <noscript> note in its place. The
// native app has no <noscript>.
import { host, mount, records } from './rsd-native-selection-host.mjs';
import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { RsdFeedbackPageContent } from '../../../src/rsdDrawing/RsdFeedbackPageContent.tsx';
import { FEEDBACK_PAGE_COPY } from '../../../src/information/feedbackPageCopy.ts';
import { MESSAGE_PROMPT_BY_KIND, REPORT_FORM_COPY } from '../../../src/feedback/reportFormCopy.ts';
import { createNativeFeedback } from '../../../src/feedback/feedback.ts';
import { supportEmail } from '../../../src/lib/supportEmail.ts';

vi.mock('react-strict-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, css: { ...actual.css, props: () => ({}) } };
});

afterEach(() => {
  records.os = 'ios';
});

const sendButton = () =>
  [...host.querySelectorAll('button')].find((node) => node.textContent === REPORT_FORM_COPY.send);
const messageField = () => host.querySelector(`[aria-label="${MESSAGE_PROMPT_BY_KIND.bug.label}"]`);

it('says the form needs JavaScript in place of the form a page read without it hides', async () => {
  records.os = 'web';
  await mount(createElement(RsdFeedbackPageContent, { owner: null, onPrivacy: () => {} }));
  // A browser running scripts renders no <noscript> content, so React DOM leaves it empty here;
  // the build's no-JavaScript check (check-native-web-pages-without-js.mjs) reads its words.
  const note = [...host.querySelectorAll('noscript')];
  expect(note).toHaveLength(1);
  expect(host.textContent).not.toContain(FEEDBACK_PAGE_COPY.needsScript);
  // This host drops data attributes, so the build's no-JavaScript check holds the form hidden.
  expect(note[0].nextElementSibling.contains(sendButton())).toBe(true);
});

it('leaves the native page without a note or a hidden form', async () => {
  records.os = 'ios';
  await mount(createElement(RsdFeedbackPageContent, { owner: null, onPrivacy: () => {} }));
  expect(host.querySelector('noscript')).toBeNull();
  expect(sendButton()).toBeDefined();
});

const THROTTLED = 'Too many attempts. Please wait 60s.';

async function pageWithReply(status, body) {
  records.os = 'web';
  const owner = createNativeFeedback({
    transport: async () => new Response(JSON.stringify(body), { status }),
    device: () => ({ platform: 'Web' }),
    policyStorage: { read: async () => null, write: async () => {} },
  });
  await mount(createElement(RsdFeedbackPageContent, { owner, onPrivacy: () => {} }));
  return owner;
}

const alert = () => host.querySelector('[role="alert"]');

// Shipping's page answers a report it could not deliver above Send, with the support address as
// a way out; a draft it refuses before sending gets the reason alone.
it('answers a refused report above Send with the support address as a way out', async () => {
  const owner = await pageWithReply(429, { ok: false, error: THROTTLED });
  try {
    await act(async () => owner.setMessage('A throttled report'));
    await act(async () => sendButton().click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(alert().textContent).toBe(
      `${THROTTLED}${REPORT_FORM_COPY.emailFallbackLead}${supportEmail()}${REPORT_FORM_COPY.emailFallbackTail}`
    );
    expect(alert().compareDocumentPosition(sendButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    await act(async () => owner.setMessage(''));
    await act(async () => sendButton().click());
    expect(alert().textContent).toBe('Please type a short description.');
  } finally {
    owner.dispose();
  }
});

it('replaces the delivered page form with its success status and send-another link', async () => {
  const owner = await pageWithReply(200, { ok: true });
  try {
    await act(async () => owner.setMessage('A local fixture report'));
    await act(async () => sendButton().click());
    await expect
      .poll(() => host.querySelector('[role="status"]')?.textContent)
      .toBe(FEEDBACK_PAGE_COPY.sentStatus);
    expect(sendButton()).toBeUndefined();
    expect(messageField()).toBeNull();
    expect(host.querySelector('[role="link"]').textContent).toBe(FEEDBACK_PAGE_COPY.sendAnother);
    expect(host.textContent).toContain(FEEDBACK_PAGE_COPY.next);
  } finally {
    owner.dispose();
  }
});

it('starts a clean page draft when the send-another link is clicked', async () => {
  const owner = await pageWithReply(200, { ok: true });
  try {
    await act(async () => owner.setMessage('The delivered draft'));
    await act(async () => sendButton().click());
    await expect
      .poll(() => host.querySelector('[role="status"]')?.textContent)
      .toBe(FEEDBACK_PAGE_COPY.sentStatus);
    const another = host.querySelector('[role="link"]');
    await act(async () => another.click());
    expect(messageField()).not.toBeNull();
    expect(messageField().value).toBe('');
    expect(owner.getState().draft).toEqual({ kind: 'bug', message: '', includeDevice: false });
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(sendButton().disabled).toBe(false);
  } finally {
    owner.dispose();
  }
});
