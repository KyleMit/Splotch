/**
 * perf-rig — frame-timing capture and scoring for web apps on real devices, with input and
 * measurement on separate channels.
 *
 * The public surface, by lifecycle:
 *
 *   declare   defineApp, defineTarget(s), defineScenario, defineGates, defineRig
 *   prove     preflight, doctor (CLI), planCapture
 *   capture   capture, serve, serveProbeHost, renderProbe
 *   score     summariseFrames, summariseActions, inputFidelity, refreshRegimeVerdict, evaluate*
 *   keep      writeArtifact, keepEvidence, rescore, instrumentFingerprint
 *   drive     runCampaign, campaignStatus, inspectCell, renderMatrix, stalenessOutcome
 *   release   planRelease, release
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
export * from './rig.js';
export * from './campaign.js';
export * from './cli.js';

export declare const VERSION: string;
