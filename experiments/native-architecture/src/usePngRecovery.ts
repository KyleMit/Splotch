import { useEffect, useRef, useState } from 'react';
import { createPngRecovery, INITIAL_PNG_RECOVERY } from './export/pngRecovery';
import { pngRecoveryPlatform } from './platform/pngRecovery';

export function usePngRecovery() {
  const [state, setState] = useState(INITIAL_PNG_RECOVERY);
  const owner = useRef<ReturnType<typeof createPngRecovery> | null>(null);
  useEffect(() => {
    const mounted = createPngRecovery(
      pngRecoveryPlatform.storage,
      pngRecoveryPlatform.deliver,
      setState
    );
    owner.current = mounted;
    void mounted.restore();
    return () => {
      mounted.dispose();
      if (owner.current === mounted) owner.current = null;
    };
  }, []);
  return {
    state,
    async submit(base64: string) {
      if (!owner.current) throw new Error('PNG recovery is not ready. Please try again.');
      await owner.current.submit(base64);
    },
    retry: () => owner.current?.retry(),
    dismiss: (id: string) => owner.current?.dismiss(id),
  };
}
