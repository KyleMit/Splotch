export { assertObservationComplete, classifyDiagnosticSvg } from './checkpoint-svg-owners.mjs';

export function patchSnapshotMethod(state, instance, decorate) {
  if (!instance || typeof instance.toDataURL !== 'function')
    throw new Error('Missing actual SVG capture method');
  const target = Object.prototype.hasOwnProperty.call(instance, 'toDataURL')
    ? instance
    : Object.getPrototypeOf(instance);
  if (state.patched.has(target)) return;
  const original = target.toDataURL;
  if (typeof original !== 'function') throw new Error('Missing actual SVG method owner');
  target.toDataURL = decorate(original);
  state.patched.add(target);
}
