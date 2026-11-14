import type {
  ActiveRecallQueueMode,
  ActiveRecallRoundState,
  ActiveRecallSessionStore,
} from './active-recall.js';

export type RecallFilterMode = 'off' | 'include' | 'exclude';

// Selection is an explicit Lesson ID set; categories only bulk-edit it.
export type RecallFilterSettings = {
  version: 1;
  mode: RecallFilterMode;
  lessonIds: string[];
};

export type RecallFilterLoadStatus = 'missing' | 'valid' | 'invalid' | 'unavailable';

export const recallFilterSettingsKey = 'eag.activeRecallFilter.v1';
export const filteredSessionKeyPrefix = 'eag.filteredActiveRecallSession.v1:';
export const filteredRoundKeyPrefix = 'eag.filteredActiveRecallRound.v1:';

type FilterStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createRecallFilterOff(): RecallFilterSettings {
  return { version: 1, mode: 'off', lessonIds: [] };
}

export function parseRecallFilterSettings(
  storedValue: string | null,
): { settings: RecallFilterSettings; status: RecallFilterLoadStatus } {
  if (storedValue === null) return { settings: createRecallFilterOff(), status: 'missing' };
  try {
    const value: unknown = JSON.parse(storedValue);
    const record = value as Record<string, unknown> | null;
    if (
      record && typeof record === 'object' && !Array.isArray(record) &&
      Object.keys(record).length === 3 && record.version === 1 &&
      (record.mode === 'off' || record.mode === 'include' || record.mode === 'exclude') &&
      Array.isArray(record.lessonIds) &&
      record.lessonIds.every((id) => typeof id === 'string') &&
      new Set(record.lessonIds).size === record.lessonIds.length
    ) {
      return {
        settings: { version: 1, mode: record.mode, lessonIds: [...(record.lessonIds as string[])] },
        status: 'valid',
      };
    }
  } catch {
    // A corrupt value falls back to OFF below.
  }
  return { settings: createRecallFilterOff(), status: 'invalid' };
}

export function loadRecallFilterSettings(
  getStorage: () => FilterStorage,
): { settings: RecallFilterSettings; status: RecallFilterLoadStatus } {
  try {
    return parseRecallFilterSettings(getStorage().getItem(recallFilterSettingsKey));
  } catch {
    return { settings: createRecallFilterOff(), status: 'unavailable' };
  }
}

export function saveRecallFilterSettings(
  getStorage: () => FilterStorage,
  settings: RecallFilterSettings,
): boolean {
  try {
    getStorage().setItem(recallFilterSettingsKey, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

// Preserves the given Lesson order; unknown IDs in the selection are ignored.
export function selectFilteredLessons<T extends { id: string }>(
  lessons: readonly T[],
  settings: RecallFilterSettings,
): T[] {
  if (settings.mode === 'off') return [...lessons];
  const selected = new Set(settings.lessonIds);
  return lessons.filter((lesson) =>
    settings.mode === 'include' ? selected.has(lesson.id) : !selected.has(lesson.id));
}

// Distinguishes target Lesson sets only; content is still checked by librarySignature.
export function createRecallFilterKey(
  mode: ActiveRecallQueueMode,
  lessons: readonly { id: string }[],
): string {
  // Encoding keeps the key injective even if a future Lesson ID contains ',' or ':'.
  return `${mode}:${[...new Set(lessons.map((lesson) => lesson.id))].sort()
    .map((id) => encodeURIComponent(id)).join(',')}`;
}

export type FilteredActiveRecallStores = {
  key: string;
  session: ActiveRecallSessionStore;
  round: {
    load: () => string | null;
    save: (roundState: ActiveRecallRoundState) => boolean;
  };
};

// Reads and writes only this filter's two keys and never deletes other data.
export function createFilteredActiveRecallStores(
  getStorage: () => FilterStorage,
  mode: ActiveRecallQueueMode,
  lessons: readonly { id: string }[],
  onSaveFailure: () => void,
): FilteredActiveRecallStores {
  const key = createRecallFilterKey(mode, lessons);
  const sessionKey = filteredSessionKeyPrefix + key;
  const roundKey = filteredRoundKeyPrefix + key;
  let storageAvailable = true;
  let failureReported = false;
  const fail = (): false => {
    storageAvailable = false;
    if (!failureReported) {
      failureReported = true;
      onSaveFailure();
    }
    return false;
  };
  const read = (name: string): string | null => {
    if (!storageAvailable) return null;
    try {
      return getStorage().getItem(name);
    } catch {
      storageAvailable = false;
      return null;
    }
  };
  const write = (name: string, value: string): boolean => {
    if (!storageAvailable) return fail();
    try {
      getStorage().setItem(name, value);
      return true;
    } catch {
      return fail();
    }
  };
  return {
    key,
    session: {
      isAvailable: () => storageAvailable,
      load: () => read(sessionKey),
      save: (session) => write(sessionKey, JSON.stringify(session)),
      clear: () => {
        if (!storageAvailable) return false;
        try {
          getStorage().removeItem(sessionKey);
          return true;
        } catch {
          return fail();
        }
      },
    },
    round: {
      load: () => read(roundKey),
      save: (roundState) => write(roundKey, JSON.stringify(roundState)),
    },
  };
}
