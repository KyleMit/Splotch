// The element id of a drawer tool's slot, so a closing dialog can hand focus back to the tool
// that opened it (aiLauncherFocus.web.ts).
export function drawerToolId(key: string) {
  return `rsd-drawer-tool-${key}`;
}
