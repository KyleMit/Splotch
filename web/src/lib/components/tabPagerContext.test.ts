import { describe, expect, it } from 'vitest';
import { removeTab, upsertTab, type TabDescriptor } from './tabPagerContext';

function makeTabs(): TabDescriptor[] {
  return [
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'ai', label: 'AI', icon: 'wand-stars' },
    { id: 'install', label: 'Setup', icon: 'pin' },
  ];
}

describe('upsertTab', () => {
  it('appends a new tab', () => {
    const tabs = makeTabs();
    upsertTab(tabs, { id: 'about', label: 'About', icon: 'splotchy' });
    expect(tabs.map((tab) => tab.id)).toEqual(['settings', 'ai', 'install', 'about']);
  });

  it('leaves an unchanged tab alone', () => {
    const tabs = makeTabs();
    const existing = tabs[1];
    upsertTab(tabs, { id: 'ai', label: 'AI', icon: 'wand-stars' });
    expect(tabs[1]).toBe(existing);
    expect(tabs).toHaveLength(3);
  });

  it('updates a changed tab in place, preserving its position', () => {
    const tabs = makeTabs();
    upsertTab(tabs, { id: 'ai', label: 'Magic', icon: 'wand-stars' });
    expect(tabs.map((tab) => tab.id)).toEqual(['settings', 'ai', 'install']);
    expect(tabs[1].label).toBe('Magic');
  });
});

describe('removeTab', () => {
  it('returns null and leaves the array untouched for an unknown id', () => {
    const tabs = makeTabs();
    expect(removeTab(tabs, 'missing', 'settings')).toBeNull();
    expect(tabs).toHaveLength(3);
  });

  it('splices the tab out and keeps an unaffected active tab', () => {
    const tabs = makeTabs();
    expect(removeTab(tabs, 'install', 'settings')).toBe('settings');
    expect(tabs.map((tab) => tab.id)).toEqual(['settings', 'ai']);
  });

  it('moves the active tab to the next tab when the active one is removed', () => {
    const tabs = makeTabs();
    expect(removeTab(tabs, 'ai', 'ai')).toBe('install');
    expect(tabs.map((tab) => tab.id)).toEqual(['settings', 'install']);
  });

  it('falls back to the previous tab when the last active tab is removed', () => {
    const tabs = makeTabs();
    expect(removeTab(tabs, 'install', 'install')).toBe('ai');
  });

  it('re-clamps a stale active id that no longer exists', () => {
    const tabs = makeTabs();
    expect(removeTab(tabs, 'settings', 'ghost')).toBe('ai');
  });

  it('returns an empty id when the only tab is removed', () => {
    const tabs: TabDescriptor[] = [{ id: 'settings', label: 'Settings', icon: 'settings' }];
    expect(removeTab(tabs, 'settings', 'settings')).toBe('');
    expect(tabs).toHaveLength(0);
  });
});
