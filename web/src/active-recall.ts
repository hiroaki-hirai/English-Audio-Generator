export type ActiveRecallLesson = {
  id: string;
  phrases: Array<{
    en: string;
    ja: string;
  }>;
};

export type ActiveRecallQueueEntry = {
  lessonId: string;
  phraseIndex: number;
  en: string;
  ja: string;
};

export type ActiveRecallQueueIdentity = Pick<
  ActiveRecallQueueEntry,
  'lessonId' | 'phraseIndex'
>;

export type ActiveRecallSession = {
  version: 1;
  queue: ActiveRecallQueueIdentity[];
  currentIndex: number;
  librarySignature: string;
};

export type PreparedActiveRecallSession = {
  session: ActiveRecallSession;
  queue: ActiveRecallQueueEntry[];
  resumed: boolean;
};

export type ActiveRecallSessionStore = {
  load: () => string | null;
  save: (session: ActiveRecallSession) => boolean;
  clear: () => boolean;
};

type ActiveRecallStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

export function createActiveRecallSessionStore(
  getStorage: () => ActiveRecallStorage,
  storageKey: string,
): ActiveRecallSessionStore {
  let storageAvailable = true;

  const disableStorage = (): void => {
    storageAvailable = false;
  };

  return {
    load: () => {
      if (!storageAvailable) {
        return null;
      }

      try {
        return getStorage().getItem(storageKey);
      } catch {
        disableStorage();
        return null;
      }
    },
    save: (session) => {
      if (!storageAvailable) {
        return false;
      }

      try {
        getStorage().setItem(storageKey, JSON.stringify(session));
        return true;
      } catch {
        disableStorage();
        return false;
      }
    },
    clear: () => {
      if (!storageAvailable) {
        return false;
      }

      try {
        getStorage().removeItem(storageKey);
        return true;
      } catch {
        disableStorage();
        return false;
      }
    },
  };
}

export function shuffleActiveRecallEntries(
  entries: readonly ActiveRecallQueueEntry[],
  random: () => number = Math.random,
): ActiveRecallQueueEntry[] {
  const shuffledEntries = [...entries];

  for (let index = shuffledEntries.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const currentEntry = shuffledEntries[index];
    const swapEntry = shuffledEntries[swapIndex];

    if (!currentEntry || !swapEntry) {
      continue;
    }

    shuffledEntries[index] = swapEntry;
    shuffledEntries[swapIndex] = currentEntry;
  }

  return shuffledEntries;
}

export function createActiveRecallQueue(
  lessons: readonly ActiveRecallLesson[],
  random: () => number = Math.random,
): ActiveRecallQueueEntry[] {
  const entries = lessons.flatMap((lesson) =>
    lesson.phrases.map((phrase, phraseIndex) => ({
      lessonId: lesson.id,
      phraseIndex,
      en: phrase.en,
      ja: phrase.ja,
    })),
  );

  return shuffleActiveRecallEntries(entries, random);
}

function getQueueIdentity(
  entry: ActiveRecallQueueIdentity,
): string {
  return `${entry.lessonId}:${entry.phraseIndex}`;
}

export function createActiveRecallLibrarySignature(
  lessons: readonly ActiveRecallLesson[],
): string {
  const signatureSource = lessons.flatMap((lesson) =>
    lesson.phrases.map((phrase, phraseIndex) => [
      lesson.id,
      phraseIndex,
      phrase.en,
    ]),
  );
  const serializedSource = JSON.stringify(signatureSource);
  let hash = 0x811c9dc5;

  for (let index = 0; index < serializedSource.length; index += 1) {
    hash ^= serializedSource.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a32:${signatureSource.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveSavedQueue(
  queueValue: unknown,
  lessons: readonly ActiveRecallLesson[],
): ActiveRecallQueueEntry[] | null {
  if (!Array.isArray(queueValue)) {
    return null;
  }

  const availableEntries = createActiveRecallQueue(lessons, () => 0).map(
    (entry) => [getQueueIdentity(entry), entry] as const,
  );
  const entryByIdentity = new Map(availableEntries);

  if (queueValue.length !== entryByIdentity.size) {
    return null;
  }

  const seenIdentities = new Set<string>();
  const resolvedQueue: ActiveRecallQueueEntry[] = [];

  for (const value of queueValue) {
    if (
      !isRecord(value) ||
      typeof value.lessonId !== 'string' ||
      !Number.isInteger(value.phraseIndex)
    ) {
      return null;
    }

    const identity = getQueueIdentity({
      lessonId: value.lessonId,
      phraseIndex: value.phraseIndex as number,
    });
    const entry = entryByIdentity.get(identity);

    if (!entry || seenIdentities.has(identity)) {
      return null;
    }

    seenIdentities.add(identity);
    resolvedQueue.push(entry);
  }

  return resolvedQueue;
}

export function createFreshActiveRecallSession(
  lessons: readonly ActiveRecallLesson[],
  random: () => number = Math.random,
): PreparedActiveRecallSession {
  const queue = createActiveRecallQueue(lessons, random);
  const session: ActiveRecallSession = {
    version: 1,
    queue: queue.map(({ lessonId, phraseIndex }) => ({
      lessonId,
      phraseIndex,
    })),
    currentIndex: 0,
    librarySignature: createActiveRecallLibrarySignature(lessons),
  };

  return { session, queue, resumed: false };
}

export function prepareActiveRecallSession(
  lessons: readonly ActiveRecallLesson[],
  storedValue: string | null,
  random: () => number = Math.random,
): PreparedActiveRecallSession {
  if (storedValue) {
    try {
      const parsedValue: unknown = JSON.parse(storedValue);

      if (
        isRecord(parsedValue) &&
        parsedValue.version === 1 &&
        parsedValue.librarySignature ===
          createActiveRecallLibrarySignature(lessons) &&
        Number.isInteger(parsedValue.currentIndex)
      ) {
        const queue = resolveSavedQueue(parsedValue.queue, lessons);
        const currentIndex = parsedValue.currentIndex as number;

        if (
          queue &&
          currentIndex >= 0 &&
          currentIndex < queue.length
        ) {
          return {
            session: {
              version: 1,
              queue: queue.map(({ lessonId, phraseIndex }) => ({
                lessonId,
                phraseIndex,
              })),
              currentIndex,
              librarySignature: parsedValue.librarySignature as string,
            },
            queue,
            resumed: true,
          };
        }
      }
    } catch {
      // Invalid persisted state falls through to a fresh session.
    }
  }

  return createFreshActiveRecallSession(lessons, random);
}
