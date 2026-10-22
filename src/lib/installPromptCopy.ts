// The Install Banner's heading and detail at each stage of its bounded re-prompt
// cycle (ADR-0039). Free of `$app` and `$lib` aliases so the React Native web
// build renders the same words.
export const INSTALL_PROMPT_COPY = {
  initial: {
    heading: 'Add Splotch to your home screen',
    detail: 'Opens full-screen, just like a real app',
  },
  returning: {
    heading: 'Welcome back! Add Splotch to your home screen',
    detail: 'Opens full-screen, just like a real app',
  },
  final: {
    heading: 'One last reminder — install Splotch',
    detail: "We won't ask again — it's always in Settings",
  },
} as const;
