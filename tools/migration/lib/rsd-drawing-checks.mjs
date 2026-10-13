// A test named this way mounts through the released native react-strict-dom renderer, so it runs
// in test:migration:rsd-selection and never in test:tools. Relative to the tools/ root both
// Vitest configs share; tools/migration/tests/rsd-test-tiers.test.mjs holds each tier to it.
export const RSD_NATIVE_RENDERER_TESTS = 'migration/tests/rsd-native-*.test.mjs';
