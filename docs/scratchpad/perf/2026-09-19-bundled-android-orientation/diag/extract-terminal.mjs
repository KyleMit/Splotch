// Usage: node extract-terminal.mjs <session.jsonl> <serial> <checkout> <out.jsonl> <needle>...
// Writes verbatim, sanitized Bash tool results from the session transcript that
// produced a package's device runs. Selection is by the run names each command
// wrote; nothing is edited except identifier/path redaction.
import { readFileSync, writeFileSync } from 'node:fs';
const [transcript, serial, checkout, out, ...needles] = process.argv.slice(2);
const home = (await import('node:os')).homedir();
const redact = (s) =>
  s.split(serial).join('<serial>').split(checkout).join('<checkout>')
    .replace(/\/var\/folders\/[^\s'"]+/g, '<tmp>').split(home).join('<home>');
const uses = new Map();
const records = [];
for (const line of readFileSync(transcript, 'utf8').split('\n').filter(Boolean)) {
  const e = JSON.parse(line);
  const content = e.message?.content;
  if (!Array.isArray(content)) continue;
  for (const c of content) {
    if (c.type === 'tool_use' && c.name === 'Bash') uses.set(c.id, { command: c.input.command, requestedAt: e.timestamp });
    if (c.type === 'tool_result' && uses.has(c.tool_use_id)) {
      const u = uses.get(c.tool_use_id);
      if (!needles.some((n) => u.command.includes(n))) continue;
      const ran = ['perf:android:bundled:frames', 'capture-bundled-frames.mjs --device', 'read-ink.mjs $S', 'unlock-experiment', 'swipe-delivery.mjs $S', 'od -c'];
      if (!ran.some((r) => u.command.includes(r)) || u.command.includes('package.mjs')) continue;
      if (/^cat > \/private|extract-terminal|check\.mjs <<|rival-pr|leftovers/.test(u.command)) continue;
      const text = Array.isArray(c.content) ? c.content.map((x) => x.text ?? '').join('') : String(c.content);
      records.push({ requestedAt: u.requestedAt, resultAt: e.timestamp, command: redact(u.command), output: redact(text) });
    }
  }
}
writeFileSync(out, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`${records.length} records -> ${out}`);
