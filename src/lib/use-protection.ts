import { useEffect, useState } from 'react';
import type { WxtStorageItem } from 'wxt/utils/storage';
import { protectionState, type ProtectionState } from '@/protection/state';
import { suggestedBlockCounts, type SuggestedBlockCounts } from '@/protection/suggested-blocks';

/** A stored value, kept current as it changes anywhere. Null until it loads. */
function useStorageItem<T>(item: WxtStorageItem<T, Record<string, unknown>>): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let current = true;
    item.getValue().then((loaded) => current && setValue(loaded));
    const unwatch = item.watch((changed) => setValue(changed));
    return () => {
      current = false;
      unwatch();
    };
  }, [item]);
  return value;
}

/** The protection state, kept current as it changes anywhere. Null until it loads. */
export function useProtectionState(): ProtectionState | null {
  return useStorageItem(protectionState);
}

/** The counts behind Suggested Blocks, kept current. Null until they load. */
export function useSuggestedBlockCounts(): SuggestedBlockCounts | null {
  return useStorageItem(suggestedBlockCounts);
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
