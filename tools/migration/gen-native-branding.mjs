import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isMain, ROOT } from '../lib/proc.mjs';

const NATIVE = 'experiments/native-architecture';

// Each tree's shipping files are @capacitor/assets output (gen:android:assets plus its monochrome
// step, and the iOS asset catalog). The tool hardcodes the iOS catalog at App/Assets.xcassets and
// the monochrome step at the shipping res path, so the native app copies that one generation's
// bytes instead of running a second one against its own project layout.
const NATIVE_BRANDING_TREES = [
  {
    shipping: 'android/app/src/main/res',
    native: `${NATIVE}/android/app/src/main/res`,
    branding:
      /^(?:mipmap-[^/]+\/ic_launcher[^/]*|drawable[^/]*\/splash\.png|drawable\/ic_launcher_monochrome\.xml)$/,
  },
  {
    shipping: 'ios/App/App/Assets.xcassets',
    native: `${NATIVE}/ios/Splotch/Images.xcassets`,
    branding: /^(?:AppIcon\.appiconset|Splash\.imageset)\//,
  },
];

// Info.plist's UILaunchStoryboardName names the native launch screen; its contents are shipping's.
export const NATIVE_LAUNCH_SCREEN = {
  shipping: 'ios/App/App/Base.lproj/LaunchScreen.storyboard',
  native: `${NATIVE}/ios/Splotch/SplashScreen.storyboard`,
};

function brandingFiles(root, tree, side) {
  const base = join(root, tree[side]);
  if (!existsSync(base)) return [];
  return readdirSync(base, { recursive: true })
    .map((path) => path.split('\\').join('/'))
    .filter((path) => tree.branding.test(path))
    .sort();
}

export function nativeBrandingPairs(root) {
  const pairs = NATIVE_BRANDING_TREES.flatMap((tree) =>
    brandingFiles(root, tree, 'shipping').map((path) => ({
      shipping: `${tree.shipping}/${path}`,
      native: `${tree.native}/${path}`,
    }))
  );
  return [...pairs, NATIVE_LAUNCH_SCREEN];
}

function staleNativeFiles(root) {
  return NATIVE_BRANDING_TREES.flatMap((tree) => {
    const shipping = new Set(brandingFiles(root, tree, 'shipping'));
    return brandingFiles(root, tree, 'native')
      .filter((path) => !shipping.has(path))
      .map((path) => `${tree.native}/${path}`);
  });
}

export function nativeBrandingDrift(root) {
  const differing = nativeBrandingPairs(root)
    .filter(({ shipping, native }) => {
      const target = join(root, native);
      return (
        !existsSync(target) || !readFileSync(join(root, shipping)).equals(readFileSync(target))
      );
    })
    .map(({ native }) => `differs from shipping: ${native}`);
  const stale = staleNativeFiles(root).map((path) => `no shipping counterpart: ${path}`);
  return [...differing, ...stale];
}

function syncNativeBranding(root) {
  for (const path of staleNativeFiles(root)) rmSync(join(root, path));
  for (const { shipping, native } of nativeBrandingPairs(root)) {
    mkdirSync(dirname(join(root, native)), { recursive: true });
    copyFileSync(join(root, shipping), join(root, native));
  }
}

export function generateNativeBranding(argv, root) {
  if (argv.some((arg) => arg !== '--check')) throw new Error('Only --check is supported.');
  if (!argv.includes('--check')) syncNativeBranding(root);
  const drift = nativeBrandingDrift(root);
  if (drift.length) {
    throw new Error(
      `Native branding drifted; run node tools/migration/gen-native-branding.mjs\n${drift.join('\n')}`
    );
  }
  return { files: nativeBrandingPairs(root).length };
}

if (isMain(import.meta.url))
  console.log(JSON.stringify(generateNativeBranding(process.argv.slice(2), ROOT)));
