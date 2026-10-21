import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

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
  it('lays the window out edge to edge', () => {
    expect(candidate.gradle).toMatch(/^edgeToEdgeEnabled=true$/m);
  });

  it('hides the navigation bar at start and again whenever the window regains focus', () => {
    expect(method(candidate.activity, 'override fun onCreate(')).toContain('hideNavigationBar()');
    expect(method(candidate.activity, 'override fun onWindowFocusChanged(')).toMatch(
      /if \(hasFocus\) hideNavigationBar\(\)/
    );
  });

  // Swipe-to-reveal is what keeps a drag from the screen edge in the app: Android disables the
  // back gesture while the bar is hidden under this behaviour, so the Clear bin overhanging the
  // right edge starts a clear instead of asking to leave.
  it('hides only the navigation bar, revealed for a moment by a swipe', () => {
    const hide = method(candidate.activity, 'private fun hideNavigationBar(');
    expect(hide).toContain('hide(WindowInsetsCompat.Type.navigationBars())');
    expect(hide).toContain('WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE');
    expect(hide).not.toContain('systemBars()');
  });

  // ADR-0165: the AndroidX dispatcher runs the same Back callback with or without the manifest
  // opt-in, so the manifest leaves it out and the platform logs its not-enabled warning.
  it('leaves the predictive-back manifest opt-in out', () => {
    expect(backInvokedOptIn(candidate.manifest)).toBeNull();
  });
});
