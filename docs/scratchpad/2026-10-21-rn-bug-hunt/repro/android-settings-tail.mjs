import { tap, capture, input } from './android-driver.mjs';
tap('Settings');
capture('android-settings-tail-open');
input('swipe', 540, 1900, 540, 650, 500);
capture('android-settings-hub-lower');
for (const section of ['Install', 'Feedback', "What's New", 'About']) {
  tap(section);
  capture(`android-settings-${section.replaceAll(' ', '-').replaceAll("'", '').toLowerCase()}`);
  tap('Back');
  capture('android-tail-hub-ready');
  input('swipe', 540, 1900, 540, 650, 500);
}
tap('Close');
