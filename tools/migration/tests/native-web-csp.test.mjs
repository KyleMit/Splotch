import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AI_ORIGIN } from '../../../experiments/native-architecture/src/ai/contract.ts';
import { FEEDBACK_URL } from '../../../experiments/native-architecture/src/feedback/feedbackTransport.ts';
import { PACK_ORIGIN } from '../../../experiments/native-architecture/src/offlineLibrary/manifest.ts';
import { documentPolicyProblems, withContentSecurityPolicy } from '../lib/native-web-csp.mjs';

const BOOT = "document.documentElement.setAttribute('data-boot','')";
const SURFACE =
  "if(['/'].includes(location.pathname))document.documentElement.setAttribute('x','')";
const SHELL = [
  '<!DOCTYPE html><html><head><meta charset="utf-8">',
  `<script>${BOOT}</script>`,
  '<script type="application/json" id="startup-scripts">["/a.js"]</script>',
  '<script src="/_expo/static/js/web/entry.js" defer></script>',
  `</head><body><script>${SURFACE}</script></body></html>`,
].join('');

const sha256 = (body) => `sha256-${createHash('sha256').update(body).digest('base64')}`;
const policyOf = (html) =>
  /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)[1];
const directive = (policy, name) =>
  policy
    .split('; ')
    .find((entry) => entry.startsWith(`${name} `))
    ?.split(' ')
    .slice(1);

describe('withContentSecurityPolicy', () => {
  it('opens <head> with a policy that hashes each inline executable script and nothing else', () => {
    const html = withContentSecurityPolicy(SHELL);
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
    expect(directive(policyOf(html), 'script-src')).toEqual([
      "'self'",
      `'${sha256(BOOT)}'`,
      `'${sha256(SURFACE)}'`,
    ]);
  });

  it("keeps the site's other directives and leaves out the ones a meta policy cannot carry", () => {
    const policy = policyOf(withContentSecurityPolicy(SHELL));
    expect(directive(policy, 'default-src')).toEqual(["'self'"]);
    expect(directive(policy, 'object-src')).toEqual(["'none'"]);
    expect(directive(policy, 'report-to')).toEqual(['csp']);
    for (const name of ['frame-ancestors', 'report-uri', 'sandbox'])
      expect(directive(policy, name)).toBeUndefined();
  });

  // The web transports call the page's own origin, whose host serves the /api function, so a
  // branch preview never reaches production's (issue 3027's L0160).
  it('connects only to its own origin, never the hosted API the native apps call', () => {
    const connect = directive(policyOf(withContentSecurityPolicy(SHELL)), 'connect-src');
    expect(connect).toEqual(["'self'", 'blob:']);
    for (const url of [AI_ORIGIN, FEEDBACK_URL, PACK_ORIGIN])
      expect(connect).not.toContain(new URL(url).origin);
  });

  it('refuses a document that already has a policy or no head', () => {
    expect(() => withContentSecurityPolicy(withContentSecurityPolicy(SHELL))).toThrow(
      'already carries'
    );
    expect(() => withContentSecurityPolicy('<html><body></body></html>')).toThrow('no <head>');
  });
});

describe('documentPolicyProblems', () => {
  it('passes a document whose policy was written after its last script edit', () => {
    expect(documentPolicyProblems(withContentSecurityPolicy(SHELL), 'index.html')).toEqual([]);
  });

  it('reports an inline script changed after the policy was written', () => {
    const html = withContentSecurityPolicy(SHELL).replace(BOOT, `${BOOT};void 0`);
    expect(documentPolicyProblems(html, 'index.html')).toEqual([
      'index.html carries 1 inline script(s) its policy does not hash',
    ]);
  });

  it("reports a missing policy, 'unsafe-inline' and a policy declared after a script", () => {
    expect(documentPolicyProblems(SHELL, '404.html')).toEqual([
      '404.html carries no Content-Security-Policy',
    ]);
    const loose = withContentSecurityPolicy(SHELL).replace(
      "script-src 'self'",
      "script-src 'self' 'unsafe-inline'"
    );
    expect(documentPolicyProblems(loose, 'index.html')).toEqual([
      "index.html allows inline scripts by 'unsafe-inline'",
    ]);
    const late = withContentSecurityPolicy(SHELL).replace(
      /(<meta http-equiv="Content-Security-Policy" content="[^"]*">)(.*?)(<script>[^<]*<\/script>)/,
      '$3$2$1'
    );
    expect(documentPolicyProblems(late, 'index.html')).toContain(
      'index.html declares its Content-Security-Policy after a script'
    );
  });
});
