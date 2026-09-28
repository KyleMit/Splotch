import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock('$lib/platform/deviceInfo', () => ({
  collectDeviceInfo: async () => ({ platform: 'Web', app: '1.0.0-test' }),
}));
// Zero-duration reveals: Svelte then skips the Web Animation it would start,
// which happy-dom cancels on unmount with an unhandled rejection. Motion is
// not what these tests pin.
vi.mock('$lib/platform/calmTransition', () => ({ calm: () => () => ({ duration: 0 }) }));

import FeedbackPage from './+page.svelte';

let mounted: ReturnType<typeof mount> | null = null;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
});

function renderPage() {
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(FeedbackPage, {
    target,
    props: { data: { sent: false }, form: null } as never,
  });
  flushSync();
  return target;
}

function pick(target: HTMLElement, kind: string) {
  const radio = target.querySelector<HTMLInputElement>(`input[name="kind"][value="${kind}"]`);
  if (!radio) throw new Error(`No kind option for ${kind}`);
  radio.click();
  flushSync();
}

function query<T extends Element>(target: HTMLElement, selector: string): T {
  const element = target.querySelector<T>(selector);
  if (!element) throw new Error(`Nothing matches ${selector}`);
  return element;
}

// Byte-for-byte pins of the copy each kind shows. Deliberately raw
// textContent, never whitespace-collapsed: a template reflow that changes
// what a reporter reads must fail here, not pass through a normalizer.
describe('the copy each report kind shows on /feedback', () => {
  it.each([
    {
      kind: 'bug',
      prompt: 'What went wrong?',
      placeholder: 'Describe what happened, and what you expected instead…',
      submit: 'Send report',
    },
    {
      kind: 'feature',
      prompt: "What's your idea?",
      placeholder: "Describe the feature or change you'd love to see…",
      submit: 'Send idea',
    },
  ])('shows the $kind prompt, placeholder, and submit label', ({ kind, ...copy }) => {
    const target = renderPage();
    pick(target, kind);

    expect(query(target, 'label.report-label').textContent).toBe(copy.prompt);
    expect(query<HTMLTextAreaElement>(target, '#reportMessage').placeholder).toBe(copy.placeholder);
    // The leading space is Button's own markup, between its busy ring and the label.
    expect(query(target, 'button[type="submit"]').textContent).toBe(` ${copy.submit}`);
  });
});

// The form post's half of "device info goes only with a bug report": the hidden
// field the form action reads carries a snapshot only while the kind is a bug.
describe('the device field /feedback posts', () => {
  it('carries the snapshot for a bug and retracts it when the kind becomes an idea', async () => {
    const target = renderPage();
    const device = query<HTMLInputElement>(target, 'input[name="device"]');

    query<HTMLInputElement>(target, 'input[name="includeDevice"]').click();
    await vi.waitFor(() => {
      flushSync();
      expect(JSON.parse(device.value)).toMatchObject({ platform: 'Web' });
    });

    pick(target, 'feature');
    expect(device.value).toBe('');
  });
});
