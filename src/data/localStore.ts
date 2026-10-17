// Browser-storage overlay for edits made on screens (D-04). The mock files stay
// unchanged; every screen reads base data merged with these overlays.
import { useSyncExternalStore } from 'react';

const PREFIX = 'ax-prototype.';

export interface LocalStore<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  reset(): void;
}

export const createLocalStore = <T>(key: string, initial: T): LocalStore<T> => {
  const storageKey = PREFIX + key;
  const listeners = new Set<() => void>();
  let value: T = initial;
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
    if (raw) value = JSON.parse(raw) as T;
  } catch {
    value = initial;
  }
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // Storage unavailable: the change lasts until the page reloads.
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      value = initial;
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      emit();
    }
  };
};

export const useLocalStore = <T>(store: LocalStore<T>): T => useSyncExternalStore(store.subscribe, store.get, store.get);
