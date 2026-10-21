// /beta's own copy, which shipping's routes/beta/+page.svelte writes in its markup: here so the
// no-JavaScript check (tools/migration/check-native-web-pages-without-js.mjs) reads what the page
// renders.
export const BETA_COPY = {
  title: 'Join the Splotch beta',
  documentTitle: 'Join the Splotch Beta · Splotch',
  wordmarkSuffix: 'beta',
  lede: "Joining is free and takes three quick steps — plus an optional fourth if you'd like to send feedback. Thank you for helping!",
  picker: 'Which device are you installing on?',
  android: 'How to join on Android',
  ios: 'How to join on iPhone or iPad',
  alternate: { android: 'Joining on iPhone or iPad?', ios: 'Joining on Android?' },
  troubleshooting: 'Troubleshooting',
  optional: 'Optional',
} as const;
