export const COLORING_PACK_POLICY_EVENT = 'splotch-coloring-pack-policy-change';
export const COLORING_PACK_REMOVE_EVENT = 'splotch-coloring-pack-remove';

export function notifyColoringPackPolicyChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(COLORING_PACK_POLICY_EVENT));
}
