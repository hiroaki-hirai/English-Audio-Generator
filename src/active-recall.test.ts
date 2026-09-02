import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createActiveRecallLibrarySignature,
  createActiveRecallQueue,
  createActiveRecallSessionStore,
  createFreshActiveRecallSession,
  prepareActiveRecallSession,
} from '../web/src/active-recall.js';

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

function serializeSession(
  session: ReturnType<typeof createFreshActiveRecallSession>['session'],
): string {
  return JSON.stringify(session);
}

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

test('fresh active recall session contains every phrase and starts at zero', () => {
  const prepared = prepareActiveRecallSession(lessons, null, () => 0);

  assert.equal(prepared.resumed, false);
  assert.equal(prepared.session.currentIndex, 0);
  assert.equal(prepared.queue.length, 3);
  assert.equal(
    new Set(prepared.session.queue.map((entry) =>
      `${entry.lessonId}:${entry.phraseIndex}`)).size,
    3,
  );
});

test('saved session resumes without reshuffling and restarts current phrase', () => {
  const fresh = createFreshActiveRecallSession(lessons, () => 0);
  fresh.session.currentIndex = 1;
  const expectedRestartIdentity = fresh.session.queue[1];
  const resumed = prepareActiveRecallSession(
    lessons,
    serializeSession(fresh.session),
    () => {
      throw new Error('resume must not shuffle');
    },
  );

  assert.equal(resumed.resumed, true);
  assert.equal(resumed.session.currentIndex, 1);
  assert.deepEqual(resumed.session.queue, fresh.session.queue);
  assert.deepEqual(
    {
      lessonId: resumed.queue[resumed.session.currentIndex]?.lessonId,
      phraseIndex: resumed.queue[resumed.session.currentIndex]?.phraseIndex,
    },
    expectedRestartIdentity,
  );
});

test('completed session removal makes the next start create a fresh queue', () => {
  const completed = createFreshActiveRecallSession(lessons, () => 0);
  const next = prepareActiveRecallSession(lessons, null, () => 0.999);

  assert.equal(next.resumed, false);
  assert.equal(next.session.currentIndex, 0);
  assert.notDeepEqual(next.session.queue, completed.session.queue);
});

test('invalid JSON and wrong session schema create a fresh session', () => {
  const invalidValues = [
    '{not-json',
    JSON.stringify({ version: 2 }),
    JSON.stringify({
      version: 1,
      queue: 'not-an-array',
      currentIndex: 0,
      librarySignature: createActiveRecallLibrarySignature(lessons),
    }),
    JSON.stringify({
      version: 1,
      queue: [],
      currentIndex: -1,
      librarySignature: createActiveRecallLibrarySignature(lessons),
    }),
  ];

  for (const storedValue of invalidValues) {
    assert.equal(
      prepareActiveRecallSession(lessons, storedValue, () => 0).resumed,
      false,
    );
  }
});

test('library signature mismatch creates a fresh session', () => {
  const saved = createFreshActiveRecallSession(lessons, () => 0);
  saved.session.librarySignature = 'stale-signature';

  assert.equal(
    prepareActiveRecallSession(
      lessons,
      serializeSession(saved.session),
      () => 0,
    ).resumed,
    false,
  );
});

test('unknown lesson and invalid phrase index reject a saved queue', () => {
  const invalidIdentities = [
    { lessonId: 'unknown-lesson', phraseIndex: 0 },
    { lessonId: 'first-lesson', phraseIndex: 99 },
  ];

  for (const invalidIdentity of invalidIdentities) {
    const saved = createFreshActiveRecallSession(lessons, () => 0);
    saved.session.queue[0] = invalidIdentity;

    assert.equal(
      prepareActiveRecallSession(
        lessons,
        serializeSession(saved.session),
        () => 0,
      ).resumed,
      false,
    );
  }
});

test('duplicate or missing queue identities reject a saved session', () => {
  const duplicate = createFreshActiveRecallSession(lessons, () => 0);
  duplicate.session.queue[1] = duplicate.session.queue[0]!;

  const missing = createFreshActiveRecallSession(lessons, () => 0);
  missing.session.queue.pop();

  for (const session of [duplicate.session, missing.session]) {
    assert.equal(
      prepareActiveRecallSession(
        lessons,
        serializeSession(session),
        () => 0,
      ).resumed,
      false,
    );
  }
});

test('real 45-phrase library session resumes with its saved identity', () => {
  const trainingLessons = JSON.parse(
    readFileSync(
      new URL('../web/src/training-lessons.json', import.meta.url),
      'utf8',
    ),
  ) as typeof lessons;
  const fresh = createFreshActiveRecallSession(trainingLessons, () => 0.25);
  fresh.session.currentIndex = 17;
  const resumed = prepareActiveRecallSession(
    trainingLessons,
    serializeSession(fresh.session),
    () => 0.75,
  );

  assert.equal(resumed.resumed, true);
  assert.equal(resumed.queue.length, 45);
  assert.equal(resumed.session.currentIndex, 17);
  assert.deepEqual(resumed.session.queue, fresh.session.queue);
});

test('storage get failure falls back to a fresh in-memory session', () => {
  const store = createActiveRecallSessionStore(
    () => ({
      getItem: () => {
        throw new Error('storage unavailable');
      },
      setItem: () => {
        throw new Error('must remain disabled');
      },
      removeItem: () => {
        throw new Error('must remain disabled');
      },
    }),
    'session-key',
  );
  const prepared = prepareActiveRecallSession(lessons, store.load(), () => 0);

  assert.equal(prepared.resumed, false);
  assert.equal(prepared.session.currentIndex, 0);
  assert.equal(prepared.queue.length, 3);
  assert.equal(store.save(prepared.session), false);
});

test('storage object access failure also falls back safely', () => {
  const store = createActiveRecallSessionStore(
    () => {
      throw new Error('localStorage getter unavailable');
    },
    'session-key',
  );

  assert.equal(store.load(), null);
  assert.equal(store.save(createFreshActiveRecallSession(lessons).session), false);
});

test('storage set failure does not prevent phrase execution', () => {
  const store = createActiveRecallSessionStore(
    () => ({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => undefined,
    }),
    'session-key',
  );
  const prepared = createFreshActiveRecallSession(lessons, () => 0);
  let phraseExecuted = false;

  assert.equal(store.save(prepared.session), false);
  phraseExecuted = true;

  assert.equal(phraseExecuted, true);
  assert.ok(prepared.queue[prepared.session.currentIndex]);
});

test('storage remove failure does not break completion cleanup', () => {
  const store = createActiveRecallSessionStore(
    () => ({
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => {
        throw new Error('remove denied');
      },
    }),
    'session-key',
  );

  assert.equal(store.clear(), false);
  assert.equal(store.load(), null);
});
