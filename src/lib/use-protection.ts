import { useEffect, useState } from 'react';
import { protectionState, type ProtectionState } from '@/protection/state';

/** The protection state, kept current as it changes anywhere. Null until it loads. */
export function useProtectionState(): ProtectionState | null {
  const [state, setState] = useState<ProtectionState | null>(null);
  useEffect(() => {
    let current = true;
    protectionState.getValue().then((value) => current && setState(value));
    const unwatch = protectionState.watch((value) => setState(value));
    return () => {
      current = false;
      unwatch();
    };
  }, []);
  return state;
}

/** The current time, updated every second, for countdowns such as a Pause. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
