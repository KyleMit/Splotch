// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS } from './securityHeaders';

// The security headers live in two places that must agree: this module (stamped
// onto SSR responses by hooks.server.ts) and the root netlify.toml
// `[[headers]] for = "/*"` block (stamped onto CDN/static responses by
// Netlify). netlify.toml has to stay literal TOML for Netlify to read it at
// deploy time, so it can't import the module — this is the drift guard ADR-0073
// asked for: parse the block and assert every header matches, both ways.

// The unit runner (`node scripts/web.mjs vitest run`) runs with cwd = web/, so
// the deploy config is one level up at the repo root.
const netlifyToml = readFileSync(resolve(process.cwd(), '..', 'netlify.toml'), 'utf8');

// Line continuations in the TOML multi-line CSP string (a trailing `\` swallows
// the newline + next line's indentation) collapse to single spaces, so the
// value compares equal to the module's single-line canonical form.
function normalize(value: string): string {
  return value.replace(/\\\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

// Slice out the `for = "/*"` header block (from its marker to the next
// `[[headers]]` table) so header names in later cache-control blocks or in the
// redirect rules above can't be mistaken for wildcard headers.
function wildcardBlock(toml: string): string {
  const start = toml.indexOf('for = "/*"');
  expect(start, 'netlify.toml has a `for = "/*"` header block').toBeGreaterThan(-1);
  const rest = toml.slice(start + 'for = "/*"'.length);
  const next = rest.indexOf('[[headers]]');
  return next === -1 ? rest : rest.slice(0, next);
}

// Header values come in three TOML string forms: `Name = """..."""` (the
// multi-line CSP), `Name = "..."` (basic), and `Name = '...'` (literal — used
// for Reporting-Endpoints, whose value itself contains double quotes). Comment
// lines (`#`) and the `[headers.values]` subtable header never match `Name =
// <quote>`, so they're skipped.
function parseHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const patterns = [
    /^[ \t]*([\w-]+)\s*=\s*"""([\s\S]*?)"""/gm,
    /^[ \t]*([\w-]+)\s*=\s*"([^"\n]*)"/gm,
    /^[ \t]*([\w-]+)\s*=\s*'([^'\n]*)'/gm,
  ];
  for (const pattern of patterns) {
    for (const match of block.matchAll(pattern)) {
      // First match wins so the multi-line `"""` capture isn't clobbered by the
      // basic-string pattern (whose opening `"""` also starts with `"`).
      if (!(match[1] in headers)) headers[match[1]] = normalize(match[2]);
    }
  }
  return headers;
}

describe('SECURITY_HEADERS mirrors the netlify.toml `for = "/*"` block', () => {
  const tomlHeaders = parseHeaders(wildcardBlock(netlifyToml));

  it('sets the same header names as netlify.toml (no header protects only static responses)', () => {
    expect(Object.keys(tomlHeaders).sort()).toEqual(Object.keys(SECURITY_HEADERS).sort());
  });

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    it(`${name} matches netlify.toml`, () => {
      expect(tomlHeaders[name]).toBe(normalize(value));
    });
  }
});
