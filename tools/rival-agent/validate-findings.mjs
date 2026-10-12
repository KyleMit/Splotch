#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEntryPoint } from './broker-server.mjs';

export const FINDINGS_SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'findings.schema.json'
);

export function readFindingsSchema() {
  return JSON.parse(readFileSync(FINDINGS_SCHEMA_PATH, 'utf8'));
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(declared, value) {
  const actual = typeOf(value);
  const allowed = Array.isArray(declared) ? declared : [declared];
  return allowed.some((type) => type === actual || (type === 'number' && actual === 'integer'));
}

// Covers the schema vocabulary findings.schema.json uses and nothing more: the schema is the
// contract both vendors' structured-output flags enforce, so the checker reads it rather than
// restating it. Both rivals' CLIs and this checker must agree, and a keyword the checker ignores
// would be a silent gap — hence the throw on an unknown one.
const SUPPORTED_KEYWORDS = new Set([
  '$schema',
  'title',
  'description',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'minimum',
  'minLength',
]);

export function validateAgainst(schema, value, path = '$', errors = []) {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) throw new Error(`unsupported schema keyword ${keyword}`);
  }
  if (schema.type !== undefined && !matchesType(schema.type, value)) {
    errors.push(`${path}: expected ${[].concat(schema.type).join(' or ')}, got ${typeOf(value)}`);
    return errors;
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path}: expected one of ${schema.enum.join(', ')}`);
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    errors.push(`${path}: must be at least ${schema.minimum}`);
  }
  if (
    schema.minLength !== undefined &&
    typeof value === 'string' &&
    value.length < schema.minLength
  ) {
    errors.push(`${path}: must not be empty`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) =>
      validateAgainst(schema.items, item, `${path}[${index}]`, errors)
    );
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const name of schema.required ?? []) {
      if (!(name in value)) errors.push(`${path}.${name}: required`);
    }
    for (const [name, item] of Object.entries(value)) {
      const property = schema.properties?.[name];
      if (property) validateAgainst(property, item, `${path}.${name}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}.${name}: unexpected`);
    }
  }
  return errors;
}

export function validateFindings(value, schema = readFindingsSchema()) {
  const errors = validateAgainst(schema, value);
  return { ok: errors.length === 0, errors };
}

// The rival's final message is the whole JSON document; both CLIs' schema flags guarantee that
// when they are honoured, and this is the check for when they are not.
export function parseFindings(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`final message is not JSON: ${error.message}`] };
  }
  const { ok, errors } = validateFindings(value);
  return ok ? { ok, findings: value, errors } : { ok, errors };
}

if (isEntryPoint(import.meta.url)) {
  const [path] = process.argv.slice(2);
  if (!path) {
    process.stderr.write('usage: validate-findings.mjs <findings.json>\n');
    process.exit(1);
  }
  const result = parseFindings(readFileSync(resolve(path), 'utf8'));
  process.stdout.write(`${JSON.stringify({ ok: result.ok, errors: result.errors }, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
