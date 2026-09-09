/**
 * perf-rig — frame-timing capture and scoring for web apps on real devices, with input and
 * measurement on separate channels.
 *
 * This is the core entry point: all a single desktop capture needs. `perf-rig/campaign` adds the
 * resumable grid runner, evidence promotion and re-scoring; `perf-rig/rig` adds the
 * physical-device lifecycle. Neither is re-exported here.
 *
 *   declare   defineApp, defineTargets, defineScenario, defineGates
 *   prove     doctor, planCapture
 *   capture   capture, serve, serveProbeHost, openChannel, renderProbe, configureProbe
 *   score     summariseFrames, summariseActions, summariseRepeatedAction, inputFidelity,
 *             refreshRegimeVerdict, evaluateDrawing, evaluateActions, evaluateCommit
 *   diagnose  verifyInput, verifyRotation, probeOverhead, analyzeFrames, analyzeChromeTrace,
 *             analyzeWebInspector
 *   keep      readArtifact, writeArtifact, COMPAT
 */

export * from './procedure.js';
export * from './app.js';
export * from './target.js';
export * from './transport.js';
export * from './scenario.js';
export * from './probe.js';
export * from './artifact.js';
export * from './capture.js';
export * from './scoring.js';
export * from './gates.js';
export * from './diagnostics.js';
