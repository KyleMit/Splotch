import type { IconName } from './icon-names';

export type { IconName } from './icon-names';
export type CommonIconName = Exclude<IconName, 'splotchy'>;
