import { useEffect, useRef, useState } from 'react';

const FULLSCREEN_FAILURE = 'Fullscreen could not be changed. Try again.';

function fullscreenSupported() {
  return (
    document.fullscreenEnabled === true &&
    typeof document.documentElement.requestFullscreen === 'function' &&
    typeof document.exitFullscreen === 'function'
  );
}

export function useFullscreen(enabled: boolean) {
  const [state, setState] = useState({
    supported: false,
    active: false,
    pending: false,
    message: '',
  });
  const allowed = useRef(enabled);
  allowed.current = enabled;
  const mounted = useRef(false);
  const pending = useRef(false);
  const epoch = useRef(0);

  function settle(message: string) {
    pending.current = false;
    setState({
      supported: fullscreenSupported(),
      active: !!document.fullscreenElement,
      pending: false,
      message,
    });
  }

  useEffect(() => {
    mounted.current = true;
    settle('');
    function changed() {
      epoch.current += 1;
      settle('');
    }
    function failed() {
      epoch.current += 1;
      settle(FULLSCREEN_FAILURE);
    }
    document.addEventListener('fullscreenchange', changed);
    document.addEventListener('fullscreenerror', failed);
    return () => {
      mounted.current = false;
      pending.current = false;
      epoch.current += 1;
      document.removeEventListener('fullscreenchange', changed);
      document.removeEventListener('fullscreenerror', failed);
    };
  }, []);

  function toggle() {
    if (!mounted.current || !allowed.current || pending.current || !fullscreenSupported())
      return false;
    const requestEpoch = ++epoch.current;
    pending.current = true;
    setState((current) => ({ ...current, pending: true, message: '' }));
    function complete(message: string) {
      if (mounted.current && requestEpoch === epoch.current) settle(message);
    }
    try {
      // User activation expires before a dialog's asynchronous dismissal callback.
      const result = document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen();
      void Promise.resolve(result).then(
        () => complete(''),
        () => complete(FULLSCREEN_FAILURE)
      );
    } catch {
      complete(FULLSCREEN_FAILURE);
    }
    return true;
  }

  return { ...state, label: state.active ? 'Exit fullscreen' : 'Enter fullscreen', toggle };
}
