import { createActiveRecallSessionStore } from './active-recall.js';

// Created for each explicit start; never accesses browser storage.
export function createTwentyCueSessionStore() {
  let value: string | null = null;
  return createActiveRecallSessionStore(() => ({
    getItem: () => value,
    setItem: (_key, nextValue) => { value = nextValue; },
    removeItem: () => { value = null; },
  }), 'twenty-cue-diagnostic');
}
