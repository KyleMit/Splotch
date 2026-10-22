// The flat style's glass. The native apps carry it in their one bundle; the web export loads it
// only once the saved Button style asks for it (bareGlass.web.ts).
export { RsdGlassPanes, RsdMarginRules, RsdRailGlass } from './RsdBareGlass';

export function useBareGlassReady(_bare: boolean) {
  return true;
}
