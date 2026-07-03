import type { IconName } from './icon-names';

export interface TabDescriptor {
  id: string;
  label: string;
  icon: IconName;
}

export interface TabPagerContext {
  state: {
    activeTab: string;
    tabs: TabDescriptor[];
  };
  registerTab: (tab: TabDescriptor) => void;
  unregisterTab: (id: string) => void;
  setActiveTab: (tab: string) => void;
}

export function upsertTab(tabs: TabDescriptor[], tab: TabDescriptor): void {
  const index = tabs.findIndex((candidate) => candidate.id === tab.id);
  if (index === -1) {
    tabs.push(tab);
    return;
  }

  const existing = tabs[index];
  if (existing.label !== tab.label || existing.icon !== tab.icon) {
    tabs[index] = tab;
  }
}

export function removeTab(tabs: TabDescriptor[], id: string, activeTab: string): string | null {
  const index = tabs.findIndex((candidate) => candidate.id === id);
  if (index === -1) return null;

  tabs.splice(index, 1);
  if (id !== activeTab && tabs.some((candidate) => candidate.id === activeTab)) {
    return activeTab;
  }
  return tabs[Math.min(index, tabs.length - 1)]?.id ?? '';
}

export const tabPagerContextKey = Symbol('tab-pager');
