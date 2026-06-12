import type { IconName } from './icon-names';

export interface TabPagerTab {
  id: string;
  label: string;
  icon: IconName;
}

export interface TabPagerContext {
  state: {
    activeTab: string;
    tabs: TabPagerTab[];
  };
  registerTab: (tab: TabPagerTab) => void;
  setActiveTab: (tab: string) => void;
}

export const tabPagerContextKey = Symbol('tab-pager');
