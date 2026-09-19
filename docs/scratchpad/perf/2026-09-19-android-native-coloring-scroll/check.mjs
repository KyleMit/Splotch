// Machine-checks this package's claims. Run: node docs/scratchpad/perf/2026-09-19-android-native-coloring-scroll/check.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];
const check = (claim, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${claim}`);
  if (!ok) failures.push(claim);
};

const manifest = JSON.parse(read('MANIFEST.json'));
for (const { path, sha256 } of manifest.files) {
  const actual = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
  check(`manifest hash matches ${path}`, actual === sha256);
}

const control = read('control-centre/run.log.txt');
const state = JSON.parse(control.match(/^Scroll state: (.*)$/m)[1]);
check('control: the centred swipe timed out in sweep 1', /Action sweep 1\/4\nError: Timed out waiting for coloring pages to scroll/.test(control) && !control.includes('Action sweep 2/4'));
check('control: no pointerdown reached the dialog', state.probe.eventType === 'uncaptured' && state.probe.armedEvents.length === 0);
check('control: the dialog was open, scrollable and unmoved', state.dialog.open && state.dialog.overflowY === 'auto' && state.dialog.scrollHeight > state.dialog.clientHeight && state.dialog.scrollTop === 0);
check('control: the swipe was sent on the screen centre column', state.touchGesture.x === 540);

const logcat = read('control-centre/logcat-untrusted-touch.txt');
check('control: Android dropped the touch as untrusted, naming the overlay and both opacities', /Untrusted touch due to occlusion by nu\.nav\.bar\/\d+ \(obscuring opacity = 0\.96, maximum allowed = 0\.80\)/.test(logcat) && /Dropping untrusted touch event due to nu\.nav\.bar/.test(logcat));
check('control: the dropped touch is the swipe start', logcat.includes('untrusted touch (540.0, 1667.0)'));

const retained = read('retained-log/analysis-output.txt');
const outcomes = retained.split('## open-coloring-book record')[0];
check(
  'retained log: four centred swipes scrolled in the first session; every later centred swipe timed out, one per session',
  (outcomes.match(/^S1 L\d+ SCROLLED /gm) ?? []).length === 4 &&
    (outcomes.match(/ SCROLLED /g) ?? []).length === 4 &&
    (outcomes.match(/^S(?!1 )\d+ L\d+ TIMEOUT /gm) ?? []).length >= 4
);
const swipeRows = retained
  .split('## per dialog swipe: full gesture, WebView rect, dialog CSS geometry, driver response\n')[1]
  .trim()
  .split('\n');
const tuples = new Set(swipeRows.map((row) => row.replace(/^S\d+ /, '')));
check(
  'retained log: every centred swipe, passing or failing, shares one gesture, WebView rect, dialog geometry, viewport and driver response',
  swipeRows.length >= 8 && tuples.size === 1
);
check(
  'retained log: that shared swipe is (540,1667) to (540,772) over 450 ms, answered 200',
  /x:540,y:1667,pointerDown,,pointerMove,duration:450,x:540,y:772,pointerUp/.test([...tuples][0]) &&
    [...tuples][0].endsWith('response=200')
);

for (const [dir, expectedLabels] of [
  ['first-offset-coloring', 5],
  ['first-offset-full-groups', 24],
  ['final-coloring', 5],
  ['final-full-groups', 24],
]) {
  const run = JSON.parse(read(`${dir}/actions.reduced.json`));
  const scrolls = run.samples.filter((sample) => sample.label === 'scroll coloring pages');
  check(`${dir}: capture passed with one warmup and three scored repeats`, run.passed === true && run.repeats === 4 && scrolls.length === 4 && scrolls.filter((sample) => sample.warmup).length === 1);
  check(`${dir}: ${expectedLabels} applicable actions, none blocked or not applicable`, run.actionPlan.applicableLabels.length === expectedLabels && run.actionPlan.blocked.length === 0 && run.actionPlan.notApplicable.length === 0);
  check(`${dir}: every scroll began with a trusted native pointerdown off the centre column, in the gutter`, scrolls.every((sample) => sample.activation === 'native-touch' && sample.trusted === true && sample.armedEvents.length === 1 && sample.armedEvents[0].type === 'pointerdown' && sample.armedEvents[0].hit === 'DIV' && sample.armedEvents[0].x > 180 && sample.armedEvents[0].x < 184));
  if (dir.startsWith('final-')) check(`${dir}: Android logged no untrusted-touch drop during the run`, read(`${dir}/logcat-untrusted-touch.txt`) === '');
  check(`${dir}: coloring flow complete`, ['open coloring books', 'open coloring book', 'scroll coloring pages', 'select coloring page', 'clear coloring page'].every((label) => run.summaries.some((summary) => summary.label === label && summary.passed && summary.totalCount === 4)));
}

if (failures.length) {
  console.error(`\n${failures.length} claim(s) failed`);
  process.exit(1);
}
console.log('\nall claims hold');
