import { registerDeferredIcons } from './iconRegistry.svelte';
import { iconNameFromPath, type CommonIconName } from './iconTypes';

// The icons only lazily loaded UI renders — settings sections, release notes,
// the parental gate, the install banner, the AI cards, the styleguide. They
// live in web/src/lib/icons/deferred/, which Icon.svelte's non-recursive eager
// glob never sees, so their markup ships in this module's chunk instead of on
// the startup path (ADR-0164). Every source file that names one of these icons
// imports this module, so the registry is filled before the consumer renders;
// deferredIcons.test.ts enforces that rule, and web/tests/startup-bundle.spec.ts
// pins that no modulepreloaded chunk carries this module.
const modules = import.meta.glob('../icons/deferred/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

export const deferredIcons = Object.fromEntries(
  Object.entries(modules).map(([path, src]) => [iconNameFromPath(path), src as string])
) as Partial<Record<CommonIconName, string>>;

export const DEFERRED_ICON_NAMES = Object.keys(deferredIcons).sort() as CommonIconName[];

registerDeferredIcons(deferredIcons);
