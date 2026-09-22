// Stylelint plugin: one curve per cue (the design skill's motion practice 01).
//
// A shorthand timing function applies between EVERY pair of keyframes, not
// across the whole animation. A keyframe block that hand-draws its own
// overshoot — a peak past the rest value, a dip back, a settle — and is then
// played on an easing curve gets that curve once per segment: the pull-back
// picks up a spring it never asked for and the settle overshoots its own
// overshoot. Such a block must run `linear` at the shorthand and name each
// segment's curve with `animation-timing-function` inside the keyframe, the
// way `undo-spin` in app.css does.
//
// `ease-in-out` is the one shorthand curve allowed besides `linear`. It brings
// every segment to rest at both ends, which is exactly right when every stop is
// a turning point — a shake, a wiggle, a pulse — and applying it per segment is
// the intent rather than an accident. An overshooting curve (`--ease-pop`) or
// a front-loaded one (`--ease-glide`, `ease`) never is.
//
// "Hand-drawn" is measured as the number of keyframe stops that set a
// transform (`transform`, `scale`, `rotate`, `translate`). Two stops is a
// single segment, which one curve describes fully; three or more is a shape.
//
// The check is per stylesheet — each .css file, each component's <style> —
// because a stylelint rule sees one source at a time. A component playing a
// keyframe block declared in another file is not covered.
import stylelint from 'stylelint';

const {
  createPlugin,
  utils: { report, ruleMessages },
} = stylelint;

export const ruleName = 'splotch/keyframe-curves';

export const messages = ruleMessages(ruleName, {
  rejected: (name, stops) =>
    `"${name}" draws its own shape across ${stops} transform stops; play it on \`linear\` with a per-keyframe animation-timing-function (or \`ease-in-out\` when every stop is a turning point)`,
});

export const SHAPED_KEYFRAME_MIN_TRANSFORM_STOPS = 3;

const TRANSFORM_PROPERTIES = new Set(['transform', 'scale', 'rotate', 'translate']);

const PER_SEGMENT_SAFE_CURVES = new Set(['linear', 'ease-in-out']);

const TIMING_KEYWORDS = new Set([
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'linear',
  'step-start',
  'step-end',
]);
const TIMING_FUNCTIONS = /^(cubic-bezier|steps|linear)\(/;
// The app's easing tokens are the only custom properties an animation
// shorthand names in a timing position.
const EASING_TOKEN = /^var\(--ease-[\w-]*\)$/;

function transformStopCount(atRule) {
  let stops = 0;
  atRule.each((keyframe) => {
    if (keyframe.type !== 'rule') return;
    let setsTransform = false;
    keyframe.walkDecls((decl) => {
      if (TRANSFORM_PROPERTIES.has(decl.prop.toLowerCase())) setsTransform = true;
    });
    // `52%, 78% { … }` is two stops.
    if (setsTransform) stops += keyframe.selector.split(',').length;
  });
  return stops;
}

function splitTopLevel(value, separator) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0 && separator.test(char)) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// The shorthand's other keywords. A keyframe block may share a name with one
// (`@keyframes reverse`), and the grammar reads such a token as the keyword, so
// it can never be the animation's name.
const SHORTHAND_KEYWORDS = new Set([
  'infinite',
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
  'none',
  'forwards',
  'backwards',
  'both',
  'running',
  'paused',
]);
const NUMERIC = /^[+-]?(\d|\.\d)/;

// The one token of a shorthand layer that is its keyframe name: whatever is
// left once the timing function, times, iteration count, and the other
// keywords are set aside.
function animationNameOf(tokens) {
  return tokens.find(
    (token) =>
      !SHORTHAND_KEYWORDS.has(token) &&
      !NUMERIC.test(token) &&
      !TIMING_KEYWORDS.has(token) &&
      !TIMING_FUNCTIONS.test(token) &&
      !EASING_TOKEN.test(token)
  );
}

function timingFunctionOf(tokens) {
  return (
    tokens.find(
      (token) =>
        TIMING_KEYWORDS.has(token) || TIMING_FUNCTIONS.test(token) || EASING_TOKEN.test(token)
    ) ?? 'ease'
  );
}

const ruleFunction = (enabled) => (root, result) => {
  if (!enabled) return;
  const shaped = new Map();
  root.walkAtRules(/^keyframes$/i, (atRule) => {
    const stops = transformStopCount(atRule);
    if (stops >= SHAPED_KEYFRAME_MIN_TRANSFORM_STOPS) shaped.set(atRule.params.trim(), stops);
  });
  if (shaped.size === 0) return;
  root.walkDecls(/^animation$/i, (decl) => {
    for (const layer of splitTopLevel(decl.value, /,/)) {
      const tokens = splitTopLevel(layer, /\s/);
      const name = animationNameOf(tokens);
      if (!shaped.has(name) || PER_SEGMENT_SAFE_CURVES.has(timingFunctionOf(tokens))) continue;
      report({
        ruleName,
        result,
        node: decl,
        message: messages.rejected(name, shaped.get(name)),
        word: name,
      });
    }
  });
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;

export default createPlugin(ruleName, ruleFunction);
