// Prevent context menu on long press
export function installContextMenuGuard(): () => void {
  const blockContextMenu = (e: Event) => e.preventDefault();
  document.addEventListener('contextmenu', blockContextMenu);
  return () => document.removeEventListener('contextmenu', blockContextMenu);
}
