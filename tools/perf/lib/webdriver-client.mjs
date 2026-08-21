import { sleep } from '../../lib/proc.mjs';

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const FRAME_MS = 16;

function cssAttributeValue(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export class PlaywrightWebDriver {
  constructor(page, options = {}) {
    this.page = page;
    this.cdp = options.cdp;
    this.readOrientation = options.readOrientation;
    this.rotate = options.rotate;
    this.readWindowRect = options.readWindowRect;
    this.includeBrowserChrome = options.includeBrowserChrome;
    this.useWebGeometryForClear = options.useWebGeometryForClear;
    this.useWheelForScroll = options.useWheelForScroll ?? false;
    this.elements = new Map();
    this.elementSequence = 0;
    this.pointer = { x: 0, y: 0 };
    this.pointerDown = false;
  }

  async orientation() {
    if (this.readOrientation) return this.readOrientation();
    const viewport = this.page.viewportSize();
    return viewport.width > viewport.height ? 'LANDSCAPE' : 'PORTRAIT';
  }

  async registerElement(locator) {
    if ((await locator.count()) === 0) throw new Error('Browser element was not found');
    const id = `browser-element-${++this.elementSequence}`;
    this.elements.set(id, locator.first());
    return { [ELEMENT_KEY]: id };
  }

  async elementRect(id) {
    if (id === 'browser-webview') return this.windowRect();
    const bounds = await this.elements.get(id)?.boundingBox();
    if (!bounds) throw new Error(`Browser element ${id} has no visible bounds`);
    return bounds;
  }

  async windowRect() {
    if (this.readWindowRect) return this.readWindowRect();
    const viewport = this.page.viewportSize();
    return { x: 0, y: 0, width: viewport.width, height: viewport.height };
  }

  async dispatchTouch(type) {
    const touchPoints = this.pointerDown
      ? [{ id: 0, x: this.pointer.x, y: this.pointer.y, radiusX: 1, radiusY: 1, force: 1 }]
      : [];
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }

  async movePointer(x, y, durationMs) {
    const steps = Math.max(1, Math.round(durationMs / FRAME_MS));
    const start = this.pointer;
    for (let step = 1; step <= steps; step++) {
      const progress = step / steps;
      this.pointer = {
        x: start.x + (x - start.x) * progress,
        y: start.y + (y - start.y) * progress,
      };
      if (this.cdp && this.pointerDown) await this.dispatchTouch('touchMove');
      else if (!this.cdp) await this.page.mouse.move(this.pointer.x, this.pointer.y);
      if (durationMs > 0) await sleep(durationMs / steps);
    }
  }

  async performActions(sources) {
    const actions = sources.find((source) => source.type === 'pointer')?.actions ?? [];
    for (const action of actions) {
      if (action.type === 'pointerMove') {
        await this.movePointer(action.x, action.y, action.duration ?? 0);
      } else if (action.type === 'pointerDown') {
        this.pointerDown = true;
        if (this.cdp) await this.dispatchTouch('touchStart');
        else await this.page.mouse.down();
      } else if (action.type === 'pointerUp') {
        this.pointerDown = false;
        if (this.cdp) await this.dispatchTouch('touchEnd');
        else await this.page.mouse.up();
      } else if (action.type === 'pause') {
        await sleep(action.duration ?? 0);
      }
    }
  }

  async scrollElementWithWheel(selector, deltaY) {
    if (!this.useWheelForScroll) {
      throw new Error('Trusted wheel scrolling is not enabled for this browser transport');
    }
    await this.page.locator(selector).hover();
    await this.page.mouse.wheel(0, deltaY);
  }

  async setOrientation(orientation) {
    if (orientation === (await this.orientation())) return;
    if (this.rotate) {
      await this.rotate(orientation);
      return;
    }
    const viewport = this.page.viewportSize();
    await this.page.setViewportSize({ width: viewport.height, height: viewport.width });
  }

  async request(method, path, body = {}) {
    if (method === 'GET' && path.endsWith('/contexts')) return ['WEBVIEW_browser'];
    if (method === 'POST' && path.endsWith('/context')) return null;
    if (method === 'GET' && path.endsWith('/orientation')) return this.orientation();
    if (method === 'POST' && path.endsWith('/orientation')) {
      await this.setOrientation(body.orientation);
      return null;
    }
    if (method === 'GET' && path.endsWith('/window/rect')) return this.windowRect();
    if (method === 'POST' && path.endsWith('/actions')) {
      await this.performActions(body.actions);
      return null;
    }
    if (method === 'POST' && path.endsWith('/element')) {
      if (body.using === 'class name' && body.value === 'XCUIElementTypeWebView') {
        return { [ELEMENT_KEY]: 'browser-webview' };
      }
      if (body.using === 'accessibility id') {
        const value = cssAttributeValue(body.value);
        return this.registerElement(this.page.locator(`[aria-label="${value}"]`));
      }
      if (body.using === 'css selector') {
        return this.registerElement(this.page.locator(body.value));
      }
    }
    const elementMatch = /\/element\/([^/]+)\/(rect|click)$/.exec(path);
    if (elementMatch?.[2] === 'rect' && method === 'GET') {
      return this.elementRect(elementMatch[1]);
    }
    if (elementMatch?.[2] === 'click' && method === 'POST') {
      const locator = this.elements.get(elementMatch[1]);
      if (!locator) throw new Error(`Unknown browser element ${elementMatch[1]}`);
      await locator.click();
      return null;
    }
    throw new Error(`Unsupported browser WebDriver request: ${method} ${path}`);
  }
}
