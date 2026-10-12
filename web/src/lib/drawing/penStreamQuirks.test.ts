import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPenStreamAdopter, type ListenWindowFn } from './penStreamQuirks';

function penEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    pointerId: 1,
    pointerType: 'pen',
    buttons: 1,
    clientX: 0,
    clientY: 0,
    target: null,
    ...overrides,
  } as PointerEvent;
}

describe('createPenStreamAdopter', () => {
  const canvas = {} as HTMLCanvasElement;
  let isTracked: ReturnType<typeof vi.fn<(pointerId: number) => boolean>>;
  let adopt: ReturnType<typeof vi.fn<(e: PointerEvent) => void>>;

  beforeEach(() => {
    isTracked = vi.fn().mockReturnValue(false);
    adopt = vi.fn();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(canvas);
  });

  describe('trackCanvasExit', () => {
    it('makes a tracked down pen eligible for canvas-exit recovery', () => {
      isTracked.mockReturnValue(true);
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });

      adopter.trackCanvasExit(penEvent({ type: 'pointerout' }));

      expect(adopter.hasCanvasExit()).toBe(true);
    });

    it('does not arm canvas-exit suspension for a tracked lifted or hovering pen', () => {
      isTracked.mockReturnValue(true);
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });

      adopter.trackCanvasExit(penEvent({ type: 'pointerout', buttons: 0 }));

      expect(adopter.hasCanvasExit()).toBe(false);
    });
  });

  describe('isOrphanPenContact', () => {
    it('is orphan for a down-less pen contact', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      expect(adopter.isOrphanPenContact(penEvent())).toBe(true);
    });

    it('is not orphan for a hover move (buttons === 0)', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      expect(adopter.isOrphanPenContact(penEvent({ buttons: 0 }))).toBe(false);
    });

    it('is not orphan for touch or mouse input', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      expect(adopter.isOrphanPenContact(penEvent({ pointerType: 'touch' }))).toBe(false);
      expect(adopter.isOrphanPenContact(penEvent({ pointerType: 'mouse' }))).toBe(false);
    });

    it('is not orphan once a pointerdown was tracked for that id', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      const listeners = new Map<string, (e: PointerEvent) => void>();
      const listen: ListenWindowFn = (type, handler) => listeners.set(type, handler);
      adopter.registerWindowListeners(listen);

      listeners.get('pointerdown')!(penEvent());
      expect(adopter.isOrphanPenContact(penEvent())).toBe(false);
    });

    it('is orphan again for that id after a pointerup is tracked', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      const listeners = new Map<string, (e: PointerEvent) => void>();
      const listen: ListenWindowFn = (type, handler) => listeners.set(type, handler);
      adopter.registerWindowListeners(listen);

      listeners.get('pointerdown')!(penEvent());
      listeners.get('pointerup')!(penEvent());
      expect(adopter.isOrphanPenContact(penEvent())).toBe(true);
    });

    it('is orphan again for that id after reset()', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      const listeners = new Map<string, (e: PointerEvent) => void>();
      const listen: ListenWindowFn = (type, handler) => listeners.set(type, handler);
      adopter.registerWindowListeners(listen);

      listeners.get('pointerdown')!(penEvent());
      adopter.reset();
      expect(adopter.isOrphanPenContact(penEvent())).toBe(true);
    });

    it('is orphan when a tracked canvas pen leaves and re-enters under the same id', () => {
      isTracked.mockReturnValue(true);
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      const listeners = new Map<string, (e: PointerEvent) => void>();
      const listen: ListenWindowFn = (type, handler) => listeners.set(type, handler);
      adopter.registerWindowListeners(listen);

      listeners.get('pointerdown')!(penEvent());
      adopter.trackCanvasExit(penEvent({ type: 'pointerout' }));

      expect(adopter.hasCanvasExit()).toBe(true);
      expect(adopter.isOrphanPenContact(penEvent({ type: 'pointermove' }))).toBe(true);
    });

    it('does not orphan a live pen contact the engine did not track at canvas exit', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      const listeners = new Map<string, (e: PointerEvent) => void>();
      const listen: ListenWindowFn = (type, handler) => listeners.set(type, handler);
      adopter.registerWindowListeners(listen);

      listeners.get('pointerdown')!(penEvent());
      adopter.trackCanvasExit(penEvent({ type: 'pointerout' }));

      expect(adopter.hasCanvasExit()).toBe(false);
      expect(adopter.isOrphanPenContact(penEvent({ type: 'pointermove' }))).toBe(false);
    });

    it.each(['pointerup', 'pointercancel'] as const)(
      'clears canvas-exit eligibility on %s',
      (liftType) => {
        isTracked.mockReturnValue(true);
        const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
        const listeners = new Map<string, (e: PointerEvent) => void>();
        const listen: ListenWindowFn = (type, handler) => listeners.set(type, handler);
        adopter.registerWindowListeners(listen);

        listeners.get('pointerdown')!(penEvent());
        adopter.trackCanvasExit(penEvent({ type: 'pointerout' }));
        listeners.get(liftType)!(penEvent());
        listeners.get('pointerdown')!(penEvent());

        expect(adopter.isOrphanPenContact(penEvent({ type: 'pointermove' }))).toBe(false);
      }
    );

    it('clears canvas-exit eligibility on reset', () => {
      isTracked.mockReturnValue(true);
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      const listeners = new Map<string, (e: PointerEvent) => void>();
      const listen: ListenWindowFn = (type, handler) => listeners.set(type, handler);
      adopter.registerWindowListeners(listen);

      listeners.get('pointerdown')!(penEvent());
      adopter.trackCanvasExit(penEvent({ type: 'pointerout' }));
      adopter.reset();
      listeners.get('pointerdown')!(penEvent());

      expect(adopter.isOrphanPenContact(penEvent({ type: 'pointermove' }))).toBe(false);
    });
  });

  describe('the window-level pointermove listener (adoptStrayPenStream)', () => {
    function registerAndMove(
      adopter: ReturnType<typeof createPenStreamAdopter>,
      e: PointerEvent
    ): void {
      const listeners = new Map<string, (e: PointerEvent) => void>();
      const listen: ListenWindowFn = (type, handler) => listeners.set(type, handler);
      adopter.registerWindowListeners(listen);
      listeners.get('pointermove')!(e);
    }

    it('adopts an orphaned pen contact hit-testing over exposed canvas', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      registerAndMove(adopter, penEvent());
      expect(adopt).toHaveBeenCalledTimes(1);
    });

    it('adopts a delivered-down pen stream after its omitted lift is identified', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      const listeners = new Map<string, (e: PointerEvent) => void>();
      const listen: ListenWindowFn = (type, handler) => listeners.set(type, handler);
      adopter.registerWindowListeners(listen);

      listeners.get('pointerdown')!(penEvent());
      adopter.forgetPointer(1);
      listeners.get('pointermove')!(penEvent());

      expect(adopt).toHaveBeenCalledTimes(1);
    });

    it('adopts a tracked pen after a synthetic canvas out-then-back sequence', () => {
      let tracked = true;
      isTracked.mockImplementation(() => tracked);
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      const listeners = new Map<string, (e: PointerEvent) => void>();
      const listen: ListenWindowFn = (type, handler) => listeners.set(type, handler);
      adopter.registerWindowListeners(listen);

      listeners.get('pointerdown')!(penEvent());
      adopter.trackCanvasExit(penEvent({ type: 'pointerout', target: canvas }));
      tracked = false;
      listeners.get('pointermove')!(penEvent({ target: document.body }));

      expect(adopt).toHaveBeenCalledTimes(1);
    });

    it('does not steal a synthetic out-then-back pen sequence that began on UI', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      const listeners = new Map<string, (e: PointerEvent) => void>();
      const listen: ListenWindowFn = (type, handler) => listeners.set(type, handler);
      adopter.registerWindowListeners(listen);

      listeners.get('pointerdown')!(penEvent({ target: document.body }));
      adopter.trackCanvasExit(penEvent({ type: 'pointerout', target: canvas }));
      listeners.get('pointermove')!(penEvent({ target: document.body }));

      expect(adopt).not.toHaveBeenCalled();
    });

    it('does nothing for a move already targeted at the canvas (draw() handles it)', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      registerAndMove(adopter, penEvent({ target: canvas }));
      expect(adopt).not.toHaveBeenCalled();
    });

    it('does nothing for a pointer this engine already tracks', () => {
      isTracked.mockReturnValue(true);
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      registerAndMove(adopter, penEvent());
      expect(adopt).not.toHaveBeenCalled();
    });

    it('does nothing for a non-orphan contact', () => {
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      registerAndMove(adopter, penEvent({ buttons: 0 }));
      expect(adopt).not.toHaveBeenCalled();
    });

    it('does nothing when the point does not hit-test the canvas (a floating control wins)', () => {
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.createElement('button'));
      const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
      registerAndMove(adopter, penEvent());
      expect(adopt).not.toHaveBeenCalled();
    });
  });

  it('registers all four window listeners on capture', () => {
    const adopter = createPenStreamAdopter({ canvas: () => canvas, isTracked, adopt });
    const calls: [string, boolean][] = [];
    const listen: ListenWindowFn = (type, _handler, capture) => calls.push([type, capture]);
    adopter.registerWindowListeners(listen);
    expect(calls).toEqual([
      ['pointerdown', true],
      ['pointerup', true],
      ['pointercancel', true],
      ['pointermove', true],
    ]);
  });
});
