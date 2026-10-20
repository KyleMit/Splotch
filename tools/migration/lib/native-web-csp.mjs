// The Content-Security-Policy the React Native web export's documents carry: shipping's native
// meta policy (nativeMetaCspDirectives in web/securityPolicy.ts), whose connect-src admits the
// hosted API origin the export's transports call from wherever it is served, with script-src
// holding 'self' and the hash of every inline executable script the document itself carries, never
// 'unsafe-inline' (issue 3017). A meta tag cannot carry the directives that policy leaves out; the
// hosting response delivers those, as it does for shipping.
import { createHash } from 'node:crypto';
import {
  inlineExecutableScriptBodies,
  nativeMetaCspDirectives,
  serializeCspDirectives,
} from '../../../web/securityPolicy.ts';

const CSP_META = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/i;

function inlineScriptHashes(html) {
  return [
    ...new Set(
      inlineExecutableScriptBodies(html).map(
        (body) => `sha256-${createHash('sha256').update(body).digest('base64')}`
      )
    ),
  ];
}

function nativeWebCspDirectives(html) {
  return { ...nativeMetaCspDirectives(), 'script-src': ['self', ...inlineScriptHashes(html)] };
}

// The policy goes first in <head>, ahead of every script it governs.
export function withContentSecurityPolicy(html) {
  if (CSP_META.test(html))
    throw new Error('The document already carries a Content-Security-Policy.');
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (!head) throw new Error('The document has no <head> to carry its Content-Security-Policy.');
  const at = head.index + head[0].length;
  const policy = serializeCspDirectives(nativeWebCspDirectives(html));
  return `${html.slice(0, at)}<meta http-equiv="Content-Security-Policy" content="${policy}">${html.slice(at)}`;
}

// What a built document's policy fails to guarantee, for the post-build check.
export function documentPolicyProblems(html, name) {
  const meta = CSP_META.exec(html);
  if (!meta) return [`${name} carries no Content-Security-Policy`];
  const scriptSources =
    meta[1]
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .find(([directive]) => directive === 'script-src')
      ?.slice(1) ?? [];
  const problems = [];
  if (scriptSources.includes("'unsafe-inline'"))
    problems.push(`${name} allows inline scripts by 'unsafe-inline'`);
  const missing = inlineScriptHashes(html).filter((hash) => !scriptSources.includes(`'${hash}'`));
  if (missing.length)
    problems.push(`${name} carries ${missing.length} inline script(s) its policy does not hash`);
  if (meta.index > html.search(/<script[\s>]/i) && html.search(/<script[\s>]/i) !== -1)
    problems.push(`${name} declares its Content-Security-Policy after a script`);
  return problems;
}
