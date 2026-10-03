import {
  createActiveRecallSessionStore,
  prepareActiveRecallSession,
  type ActiveRecallLesson,
} from './active-recall.js';

export const japaneseCueTestPhraseCount = 3;

// One store per explicit test start. Never reads or writes localStorage.
export function createJapaneseCueTestSessionStore(lessons: readonly ActiveRecallLesson[]) {
  const fresh = prepareActiveRecallSession(lessons, null, undefined, 'sequential-category-order');
  for (let index = 0; index < japaneseCueTestPhraseCount; index += 1) {
    const entry = fresh.queue[index];
    if (entry?.lessonId !== 'basic-delivery' || entry.phraseIndex !== index) {
      throw new Error('The diagnostic test requires Basic Delivery cues 0, 1 and 2 first.');
    }
  }
  let value: string | null = null;
  return createActiveRecallSessionStore(() => ({
    getItem: () => value,
    setItem: (_key, nextValue) => { value = nextValue; },
    removeItem: () => { value = null; },
  }), 'japanese-cue-test');
}
