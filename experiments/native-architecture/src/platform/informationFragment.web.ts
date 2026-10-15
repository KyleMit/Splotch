export function informationFragmentAtLaunch(): string | null {
  try {
    return location.hash ? decodeURIComponent(location.hash.slice(1)) : null;
  } catch {
    return null;
  }
}
export function visitInformationFragment(id: string) {
  const fragment = `#${encodeURIComponent(id)}`;
  if (location.hash !== fragment) history.pushState(history.state, '', fragment);
}
