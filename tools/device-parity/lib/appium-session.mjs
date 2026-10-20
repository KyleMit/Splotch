// Minimal Appium 2 REST client over one existing session, plus the session file the entries share.
import { readFileSync } from 'node:fs';
import { tapChain } from './pointer-chains.mjs';

export const SESSION_PLATFORMS = ['ios', 'android'];
const ERROR_BODY_CHARS = 600;
const CREATE_ERROR_BODY_CHARS = 2000;
const NEW_COMMAND_TIMEOUT_S = 3600;
// A fresh WDA derived-data folder builds WebDriverAgent before the first command answers.
const WDA_STARTUP_TIMEOUT_MS = 600_000;
const TAP_HOLD_MS = 60;

export class AppiumSession {
  constructor({ base, id, platform, device }) {
    this.base = base;
    this.id = id;
    this.platform = platform;
    this.device = device;
  }

  static async create(base, capabilities, { platform, device }) {
    const response = await fetch(`${base}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } }),
    });
    const body = await response.json();
    if (!body.value?.sessionId) {
      throw new Error(
        `session create failed: ${JSON.stringify(body.value).slice(0, CREATE_ERROR_BODY_CHARS)}`
      );
    }
    return new AppiumSession({ base, id: body.value.sessionId, platform, device });
  }

  record() {
    return { base: this.base, id: this.id, platform: this.platform, device: this.device };
  }

  async request(method, path, body) {
    const response = await fetch(`${this.base}/session/${this.id}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = JSON.stringify(parsed.value ?? parsed).slice(0, ERROR_BODY_CHARS);
      const error = new Error(`${method} ${path} -> ${response.status} ${detail}`);
      error.status = response.status;
      throw error;
    }
    return parsed.value;
  }

  async findAll(using, value) {
    const found = await this.request('POST', '/elements', { using, value });
    return found.map((element) => Object.values(element)[0]);
  }

  exec(script, args = {}) {
    return this.request('POST', '/execute/sync', { script, args: [args] });
  }

  source() {
    return this.request('GET', '/source');
  }

  click(element) {
    return this.request('POST', `/element/${element}/click`, {});
  }

  rect(element) {
    return this.request('GET', `/element/${element}/rect`);
  }

  enabled(element) {
    return this.request('GET', `/element/${element}/enabled`);
  }

  windowRect() {
    return this.request('GET', '/window/rect');
  }

  orientation() {
    return this.request('GET', '/orientation');
  }

  setOrientation(orientation) {
    return this.request('POST', '/orientation', { orientation });
  }

  // WDA can answer before it has finished playing a chain back; callers that time the gesture
  // wait out its own length rather than trusting this call's return.
  async actions(sources) {
    await this.request('POST', '/actions', { actions: sources });
    await this.request('DELETE', '/actions').catch(() => {});
  }

  tapAt(x, y) {
    return this.actions([tapChain('finger1', { x, y }, { holdMs: TAP_HOLD_MS })]);
  }

  async close() {
    await fetch(`${this.base}/session/${this.id}`, { method: 'DELETE' }).catch(() => {});
  }
}

export function readSessionFile(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path}: not a readable session file (${error.message})`, { cause: error });
  }
  for (const field of ['base', 'id', 'platform', 'device']) {
    if (typeof parsed?.[field] !== 'string' || !parsed[field]) {
      throw new Error(`${path}: session file has no "${field}" string`);
    }
  }
  if (!SESSION_PLATFORMS.includes(parsed.platform)) {
    throw new Error(`${path}: platform must be ${SESSION_PLATFORMS.join(' or ')}`);
  }
  return new AppiumSession(parsed);
}

export function appiumCapabilities({ platform, device, port, wdaDerivedData }) {
  if (platform === 'ios') {
    return {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:udid': device,
      'appium:wdaLocalPort': port,
      ...(wdaDerivedData ? { 'appium:derivedDataPath': wdaDerivedData } : {}),
      'appium:newCommandTimeout': NEW_COMMAND_TIMEOUT_S,
      'appium:wdaLaunchTimeout': WDA_STARTUP_TIMEOUT_MS,
      'appium:wdaConnectionTimeout': WDA_STARTUP_TIMEOUT_MS,
      'appium:waitForIdleTimeout': 0,
      'appium:animationCoolOffTimeout': 0,
      // The device's log is collected after a run, never streamed during one.
      'appium:skipLogCapture': true,
      'appium:shouldTerminateApp': false,
    };
  }
  return {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:udid': device,
    'appium:systemPort': port,
    'appium:newCommandTimeout': NEW_COMMAND_TIMEOUT_S,
    'appium:noReset': true,
    'appium:disableWindowAnimation': false,
    'appium:ignoreHiddenApiPolicyError': true,
  };
}
