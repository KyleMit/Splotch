// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createOverlayDemand } from './overlayDemand';

describe('overlay demand', () => {
  it('drops a demand while no controller is installed', () => {
    const overlay = createOverlayDemand();

    expect(() => overlay.demandOverlay('settings')).not.toThrow();
  });

  it('routes demands to the installed controller until it uninstalls', () => {
    const overlay = createOverlayDemand();
    const demand = vi.fn();
    const uninstall = overlay.installOverlayDemand(demand);

    overlay.demandOverlay('colorPicker');
    expect(demand).toHaveBeenCalledExactlyOnceWith('colorPicker');

    uninstall();
    overlay.demandOverlay('settings');
    expect(demand).toHaveBeenCalledOnce();
  });

  it('lets a later controller replace an earlier one without the earlier uninstall clearing it', () => {
    const overlay = createOverlayDemand();
    const first = vi.fn();
    const second = vi.fn();
    const uninstallFirst = overlay.installOverlayDemand(first);
    overlay.installOverlayDemand(second);

    uninstallFirst();
    overlay.demandOverlay('aiResult');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith('aiResult');
  });
});
