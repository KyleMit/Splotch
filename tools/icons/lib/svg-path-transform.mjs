// Rewrites SVG path data under a uniform scale + translate, baking the mapping
// into the coordinates themselves rather than wrapping the element in a
// transform.
//
// Sized to the one operation rebasing an icon needs: uniform scale, then
// translate. No rotation, no general matrix, no arc-to-cubic conversion — an
// arc's radii scale and its flags are angle-independent under a uniform scale,
// which is exactly why the whole-matrix machinery a library brings is not
// needed here.

// Command letters and numbers, including exponent notation and the leading-dot
// form (`.5`) SVG allows.
const TOKEN_RE = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * The precision every rebased coordinate is emitted at, shared by path data and
 * by the geometry attributes on the elements around it. One owner because the
 * rasterization gate that verifies a rebase is calibrated to this rounding:
 * emitting one side at a different precision would move pixels the gate then
 * has to absorb as if it were antialiasing.
 */
export const roundCoordinate = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

const num = (v) => String(roundCoordinate(v));

/**
 * `d` with every coordinate mapped through `scale` then `translateX/translateY`.
 * Command letters, relative/absolute case, and arc flags are preserved as
 * authored, so the output diffs against the input only where numbers changed.
 */
export function transformPathData(d, { scale, translateX, translateY }) {
  const s = scale;
  const tx = translateX;
  const ty = translateY;
  const tokens = d.match(TOKEN_RE);
  if (!tokens) throw new Error('unparseable path data');
  if (tokens.join('').replace(/\s/g, '').length !== d.replace(/[\s,]/g, '').length) {
    throw new Error(`path tokenizer dropped characters: ${d.slice(0, 60)}`);
  }
  let out = '';
  let i = 0;
  let cmd = null;
  let firstPair = true;
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) {
      cmd = tokens[i];
      out += cmd;
      i++;
      if (cmd.toUpperCase() === 'Z') continue;
    }
    if (!cmd) throw new Error('path data starts without a command');
    const upper = cmd.toUpperCase();
    // The first moveto pair of a path is absolute even when written `m`.
    const abs = cmd === upper || (firstPair && upper === 'M');
    firstPair = false;
    const n = ARITY[upper];
    if (n === 0) continue;
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n || args.some(Number.isNaN)) {
      throw new Error(`bad args for ${cmd} at token ${i}`);
    }
    i += n;
    if (upper === 'H') {
      out += `${num(abs ? s * args[0] + tx : s * args[0])} `;
    } else if (upper === 'V') {
      out += `${num(abs ? s * args[0] + ty : s * args[0])} `;
    } else if (upper === 'A') {
      // Radii scale; the x-axis rotation and both flags are unchanged by a
      // uniform scale, so they pass through untouched.
      const [rx, ry, rot, laf, sf, x, y] = args;
      out += `${num(s * rx)} ${num(s * ry)} ${num(rot)} ${laf} ${sf} ${num(abs ? s * x + tx : s * x)} ${num(abs ? s * y + ty : s * y)} `;
    } else {
      const vals = args.map((v, k) =>
        k % 2 === 0 ? (abs ? s * v + tx : s * v) : abs ? s * v + ty : s * v
      );
      out += vals.map(num).join(' ') + ' ';
    }
  }
  return out
    .replace(/\s+([MmLlHhVvCcSsQqTtAaZz])/g, '$1')
    .replace(/([MmLlHhVvCcSsQqTtAaZz])\s+/g, '$1')
    .trim();
}
