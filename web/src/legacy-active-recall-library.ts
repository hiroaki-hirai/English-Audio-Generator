// Keep the existing modes independent of newly registered lesson categories.
export function selectLegacyActiveRecallLessons<T extends { domain: string }>(
  lessons: readonly T[],
): T[] {
  return lessons.filter(
    (lesson) => lesson.domain === 'delivery' || lesson.domain === 'everyday',
  );
}

export function orderLegacyActiveRecallLessons<T extends { domain: string }>(
  lessons: readonly T[],
): T[] {
  return [
    ...lessons.filter((lesson) => lesson.domain === 'delivery'),
    ...lessons.filter((lesson) => lesson.domain === 'everyday'),
  ];
}
