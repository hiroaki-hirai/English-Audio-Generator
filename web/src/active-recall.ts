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
