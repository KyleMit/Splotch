import { useEffect, useRef, useState } from 'react';
import { launchedAsApp } from './installPrompt.web';

const FULLSCREEN_FAILURE = 'Fullscreen could not be changed. Try again.';
const ANDROID_USER_AGENT = /android/i;

// Shipping's fullscreen.svelte.ts: only an Android browser tab has a URL bar worth reclaiming and
// an element fullscreen that removes it. iOS Safari has none, a desktop has the browser's own,
// and an installed app has no browser chrome left. Read once, as the screen opens: fullscreen
// itself is an app-like display mode.
function offeredHere() {
  return ANDROID_USER_AGENT.test(navigator.userAgent || '') && !launchedAsApp();
}

function fullscreenApi() {
  return (
    document.fullscreenEnabled === true &&
    typeof document.documentElement.requestFullscreen === 'function' &&
    typeof document.exitFullscreen === 'function'
  );
}

// Whether the Fullscreen Toggle shows here, for chrome laid out around it.
export function fullscreenSupported() {
  return offeredHere() && fullscreenApi();
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
  const offered = useRef(false);

  function settle(message: string) {
    pending.current = false;
    setState({
      supported: offered.current && fullscreenApi(),
      active: !!document.fullscreenElement,
      pending: false,
      message,
    });
  }

  useEffect(() => {
    mounted.current = true;
    offered.current = offeredHere();
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
    if (
      !mounted.current ||
      !allowed.current ||
      pending.current ||
      !offered.current ||
      !fullscreenApi()
    )
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
