export function useFullscreen(_enabled: boolean) {
  return {
    supported: false,
    active: false,
    pending: false,
    message: '',
    label: 'Enter fullscreen',
    toggle: () => false,
  };
}
