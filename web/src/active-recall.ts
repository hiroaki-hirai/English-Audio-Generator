export type ActiveRecallLesson = {
  id: string;
  phrases: Array<{
    en: string;
    ja: string;
  }>;
};

export type ActiveRecallQueueMode =
  | 'global'
  | 'sequential-category'
  | 'sequential-category-order';

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
  diagnostic: ActiveRecallResumeDiagnostic;
};

export type ActiveRecallResumeDiagnostic = {
  savedSession: 'found' | 'missing';
  savedCurrentIndex: number | null;
  signature: 'valid' | 'invalid' | 'not-checked';
  queueValidation: 'valid' | 'invalid' | 'not-checked';
  action: 'resumed' | 'fresh';
  reason:
    | 'valid-saved-session'
    | 'no-saved-session'
    | 'malformed-json'
    | 'invalid-schema-or-version'
    | 'library-signature-mismatch'
    | 'invalid-current-index'
    | 'queue-length-mismatch'
    | 'invalid-queue-entry'
    | 'unknown-queue-identity'
    | 'duplicate-queue-identity';
};

export type ActiveRecallRoundState = {
  version: 1;
  currentRound: number;
  lastCompletedRound: number;
};

export type NextActiveRecallRound = {
  roundState: ActiveRecallRoundState;
  preparedSession: PreparedActiveRecallSession;
};

export type ActiveRecallSessionStore = {
  load: () => string | null;
  save: (session: ActiveRecallSession) => boolean;
  clear: () => boolean;
  isAvailable: () => boolean;
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
    isAvailable: () => storageAvailable,
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

export function createSequentialCategoryActiveRecallQueue(
  lessons: readonly ActiveRecallLesson[],
  random: () => number = Math.random,
): ActiveRecallQueueEntry[] {
  return lessons.flatMap((lesson) =>
    shuffleActiveRecallEntries(
      lesson.phrases.map((phrase, phraseIndex) => ({
        lessonId: lesson.id,
        phraseIndex,
        en: phrase.en,
        ja: phrase.ja,
      })),
      random,
    ),
  );
}

export function createSequentialCategoryOrderedActiveRecallQueue(
  lessons: readonly ActiveRecallLesson[],
): ActiveRecallQueueEntry[] {
  return lessons.flatMap((lesson) =>
    lesson.phrases.map((phrase, phraseIndex) => ({
      lessonId: lesson.id,
      phraseIndex,
      en: phrase.en,
      ja: phrase.ja,
    })),
  );
}

function createQueueForMode(
  lessons: readonly ActiveRecallLesson[],
  mode: ActiveRecallQueueMode,
  random: () => number,
): ActiveRecallQueueEntry[] {
  if (mode === 'sequential-category-order') {
    return createSequentialCategoryOrderedActiveRecallQueue(lessons);
  }

  return mode === 'sequential-category'
    ? createSequentialCategoryActiveRecallQueue(lessons, random)
    : createActiveRecallQueue(lessons, random);
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

export function prepareActiveRecallRoundState(
  storedValue: string | null,
): ActiveRecallRoundState {
  if (storedValue) {
    try {
      const parsedValue: unknown = JSON.parse(storedValue);

      if (
        isRecord(parsedValue) &&
        parsedValue.version === 1 &&
        Number.isInteger(parsedValue.currentRound) &&
        Number.isInteger(parsedValue.lastCompletedRound) &&
        (parsedValue.currentRound as number) >= 1 &&
        (parsedValue.lastCompletedRound as number) >= 0 &&
        (parsedValue.lastCompletedRound as number) <
          (parsedValue.currentRound as number)
      ) {
        return {
          version: 1,
          currentRound: parsedValue.currentRound as number,
          lastCompletedRound: parsedValue.lastCompletedRound as number,
        };
      }
    } catch {
      // Invalid temporary diagnostic state starts from round one.
    }
  }

  return {
    version: 1,
    currentRound: 1,
    lastCompletedRound: 0,
  };
}

export function createNextActiveRecallRound(
  lessons: readonly ActiveRecallLesson[],
  roundState: ActiveRecallRoundState,
  random: () => number = Math.random,
  mode: ActiveRecallQueueMode = 'global',
): NextActiveRecallRound {
  const nextRoundState: ActiveRecallRoundState = {
    version: 1,
    currentRound: roundState.currentRound + 1,
    lastCompletedRound: roundState.currentRound,
  };

  return {
    roundState: nextRoundState,
    preparedSession: createFreshActiveRecallSession(
      lessons,
      random,
      undefined,
      mode,
    ),
  };
}

function resolveSavedQueue(
  queueValue: unknown,
  lessons: readonly ActiveRecallLesson[],
):
  | { queue: ActiveRecallQueueEntry[]; reason: null }
  | {
      queue: null;
      reason:
        | 'queue-length-mismatch'
        | 'invalid-queue-entry'
        | 'unknown-queue-identity'
        | 'duplicate-queue-identity';
    } {
  if (!Array.isArray(queueValue)) {
    return { queue: null, reason: 'invalid-queue-entry' };
  }

  const availableEntries = createActiveRecallQueue(lessons, () => 0).map(
    (entry) => [getQueueIdentity(entry), entry] as const,
  );
  const entryByIdentity = new Map(availableEntries);

  if (queueValue.length !== entryByIdentity.size) {
    return { queue: null, reason: 'queue-length-mismatch' };
  }

  const seenIdentities = new Set<string>();
  const resolvedQueue: ActiveRecallQueueEntry[] = [];

  for (const value of queueValue) {
    if (
      !isRecord(value) ||
      typeof value.lessonId !== 'string' ||
      !Number.isInteger(value.phraseIndex)
    ) {
      return { queue: null, reason: 'invalid-queue-entry' };
    }

    const identity = getQueueIdentity({
      lessonId: value.lessonId,
      phraseIndex: value.phraseIndex as number,
    });
    const entry = entryByIdentity.get(identity);

    if (!entry) {
      return { queue: null, reason: 'unknown-queue-identity' };
    }

    if (seenIdentities.has(identity)) {
      return { queue: null, reason: 'duplicate-queue-identity' };
    }

    seenIdentities.add(identity);
    resolvedQueue.push(entry);
  }

  return { queue: resolvedQueue, reason: null };
}

export function createFreshActiveRecallSession(
  lessons: readonly ActiveRecallLesson[],
  random: () => number = Math.random,
  diagnostic: ActiveRecallResumeDiagnostic | undefined = undefined,
  mode: ActiveRecallQueueMode = 'global',
): PreparedActiveRecallSession {
  const resolvedDiagnostic: ActiveRecallResumeDiagnostic = diagnostic ?? {
    savedSession: 'missing',
    savedCurrentIndex: null,
    signature: 'not-checked',
    queueValidation: 'not-checked',
    action: 'fresh',
    reason: 'no-saved-session',
  };
  const queue = createQueueForMode(lessons, mode, random);
  const session: ActiveRecallSession = {
    version: 1,
    queue: queue.map(({ lessonId, phraseIndex }) => ({
      lessonId,
      phraseIndex,
    })),
    currentIndex: 0,
    librarySignature: createActiveRecallLibrarySignature(lessons),
  };

  return { session, queue, resumed: false, diagnostic: resolvedDiagnostic };
}

export function prepareActiveRecallSession(
  lessons: readonly ActiveRecallLesson[],
  storedValue: string | null,
  random: () => number = Math.random,
  mode: ActiveRecallQueueMode = 'global',
): PreparedActiveRecallSession {
  if (!storedValue) {
    return createFreshActiveRecallSession(lessons, random, undefined, mode);
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(storedValue);
  } catch {
    return createFreshActiveRecallSession(lessons, random, {
      savedSession: 'found',
      savedCurrentIndex: null,
      signature: 'not-checked',
      queueValidation: 'not-checked',
      action: 'fresh',
      reason: 'malformed-json',
    }, mode);
  }

  const savedCurrentIndex =
    isRecord(parsedValue) && Number.isInteger(parsedValue.currentIndex)
      ? (parsedValue.currentIndex as number)
      : null;

  if (!isRecord(parsedValue) || parsedValue.version !== 1) {
    return createFreshActiveRecallSession(lessons, random, {
      savedSession: 'found',
      savedCurrentIndex,
      signature: 'not-checked',
      queueValidation: 'not-checked',
      action: 'fresh',
      reason: 'invalid-schema-or-version',
    }, mode);
  }

  if (
    parsedValue.librarySignature !==
    createActiveRecallLibrarySignature(lessons)
  ) {
    return createFreshActiveRecallSession(lessons, random, {
      savedSession: 'found',
      savedCurrentIndex,
      signature: 'invalid',
      queueValidation: 'not-checked',
      action: 'fresh',
      reason: 'library-signature-mismatch',
    }, mode);
  }

  const resolvedQueue = resolveSavedQueue(parsedValue.queue, lessons);

  if (!resolvedQueue.queue) {
    return createFreshActiveRecallSession(lessons, random, {
      savedSession: 'found',
      savedCurrentIndex,
      signature: 'valid',
      queueValidation: 'invalid',
      action: 'fresh',
      reason: resolvedQueue.reason,
    }, mode);
  }

  if (
    savedCurrentIndex === null ||
    savedCurrentIndex < 0 ||
    savedCurrentIndex >= resolvedQueue.queue.length
  ) {
    return createFreshActiveRecallSession(lessons, random, {
      savedSession: 'found',
      savedCurrentIndex,
      signature: 'valid',
      queueValidation: 'valid',
      action: 'fresh',
      reason: 'invalid-current-index',
    }, mode);
  }

  return {
    session: {
      version: 1,
      queue: resolvedQueue.queue.map(({ lessonId, phraseIndex }) => ({
        lessonId,
        phraseIndex,
      })),
      currentIndex: savedCurrentIndex,
      librarySignature: parsedValue.librarySignature as string,
    },
    queue: resolvedQueue.queue,
    resumed: true,
    diagnostic: {
      savedSession: 'found',
      savedCurrentIndex,
      signature: 'valid',
      queueValidation: 'valid',
      action: 'resumed',
      reason: 'valid-saved-session',
    },
  };
}
