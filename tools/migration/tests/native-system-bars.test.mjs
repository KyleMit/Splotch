import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const shipping = {
  activity: read('android/app/src/main/java/art/splotch/app/MainActivity.java'),
  manifest: read('android/app/src/main/AndroidManifest.xml'),
};
const candidate = {
  activity: read(
    'experiments/native-architecture/android/app/src/main/java/art/splotch/app/MainActivity.kt'
  ),
  manifest: read('experiments/native-architecture/android/app/src/main/AndroidManifest.xml'),
  gradle: read('experiments/native-architecture/android/gradle.properties'),
};

// The body of the named method: from its declaration to the next member at the same indent.
function method(source, signature) {
  const start = source.indexOf(signature);
  expect(start, signature).toBeGreaterThan(-1);
  const rest = source.slice(start + signature.length);
  const end = rest.search(/\n {2,4}(?:@Override\b|(?:override|private|public|protected|fun) )/);
  return end === -1 ? rest : rest.slice(0, end);
}

function backInvokedOptIn(manifest) {
  return manifest.match(/android:enableOnBackInvokedCallback="(\w+)"/)?.[1] ?? null;
}

describe('the Android system bars', () => {
  it('lays the window out edge to edge, as shipping enables AndroidX edge-to-edge', () => {
    expect(shipping.activity).toContain('WindowCompat.enableEdgeToEdge(getWindow());');
    expect(candidate.gradle).toMatch(/^edgeToEdgeEnabled=true$/m);
  });

  it('hides the navigation bar at start and again whenever the window regains focus', () => {
    expect(method(shipping.activity, 'public void onCreate(')).toContain('hideNavigationBar();');
    expect(method(candidate.activity, 'override fun onCreate(')).toContain('hideNavigationBar()');
    expect(method(shipping.activity, 'public void onWindowFocusChanged(')).toMatch(
      /if \(hasFocus\)\s*\{\s*hideNavigationBar\(\);/
    );
    expect(method(candidate.activity, 'override fun onWindowFocusChanged(')).toMatch(
      /if \(hasFocus\) hideNavigationBar\(\)/
    );
  });

  // Swipe-to-reveal is what keeps a drag from the screen edge in the app: Android disables the
  // back gesture while the bar is hidden under this behaviour, so the Clear bin overhanging the
  // right edge starts a clear instead of asking to leave.
  it('hides only the navigation bar, revealed for a moment by a swipe', () => {
    const shippingHide = method(shipping.activity, 'private void hideNavigationBar(');
    const candidateHide = method(candidate.activity, 'private fun hideNavigationBar(');
    for (const hide of [shippingHide, candidateHide]) {
      expect(hide).toContain('hide(WindowInsetsCompat.Type.navigationBars())');
      expect(hide).toContain('WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE');
      expect(hide).not.toContain('systemBars()');
    }
  });

  // ADR-0165: the AndroidX dispatcher runs the same Back callback with or without the manifest
  // opt-in, so shipping leaves it out and logs the platform's not-enabled warning.
  it("keeps shipping's predictive-back manifest setting", () => {
    expect(backInvokedOptIn(candidate.manifest)).toBe(backInvokedOptIn(shipping.manifest));
  });
});
