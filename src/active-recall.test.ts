import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createActiveRecallQueue } from '../web/src/active-recall.js';

const lessons = [
  {
    id: 'first-lesson',
    phrases: [
      { en: 'First', ja: '最初' },
      { en: 'Second', ja: '2番目' },
    ],
  },
  {
    id: 'second-lesson',
    phrases: [{ en: 'Third', ja: '3番目' }],
  },
];

test('active recall queue contains every phrase exactly once', () => {
  const queue = createActiveRecallQueue(lessons, () => 0);
  const identities = queue.map(
    (entry) => `${entry.lessonId}:${entry.phraseIndex}`,
  );

  assert.equal(queue.length, 3);
  assert.equal(new Set(identities).size, 3);
  assert.deepEqual(
    [...identities].sort(),
    ['first-lesson:0', 'first-lesson:1', 'second-lesson:0'],
  );
});

test('active recall queue keeps phrase data attached to lesson identity', () => {
  const queue = createActiveRecallQueue(lessons, () => 0);
  const entry = queue.find(
    (candidate) =>
      candidate.lessonId === 'second-lesson' && candidate.phraseIndex === 0,
  );

  assert.deepEqual(entry, {
    lessonId: 'second-lesson',
    phraseIndex: 0,
    en: 'Third',
    ja: '3番目',
  });
});

test('active recall queue shuffles a copy without mutating lesson input', () => {
  const originalLessons = structuredClone(lessons);
  const queue = createActiveRecallQueue(lessons, () => 0);

  assert.deepEqual(lessons, originalLessons);
  assert.deepEqual(
    queue.map((entry) => `${entry.lessonId}:${entry.phraseIndex}`),
    ['first-lesson:1', 'second-lesson:0', 'first-lesson:0'],
  );
});

test('current training library creates 45 unique queue entries', () => {
  const trainingLessons = JSON.parse(
    readFileSync(
      new URL('../web/src/training-lessons.json', import.meta.url),
      'utf8',
    ),
  ) as typeof lessons;
  const queue = createActiveRecallQueue(trainingLessons, () => 0.5);
  const identities = queue.map(
    (entry) => `${entry.lessonId}:${entry.phraseIndex}`,
  );

  assert.equal(queue.length, 45);
  assert.equal(new Set(identities).size, 45);
  assert.deepEqual(
    new Set(queue.map((entry) => entry.lessonId)),
    new Set(trainingLessons.map((lesson) => lesson.id)),
  );
});
