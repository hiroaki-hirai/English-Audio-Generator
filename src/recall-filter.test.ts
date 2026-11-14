import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createFreshActiveRecallSession, prepareActiveRecallSession } from '../web/src/active-recall.js';
import {
  createFilteredActiveRecallStores,
  createRecallFilterKey,
  filteredRoundKeyPrefix,
  filteredSessionKeyPrefix,
  loadRecallFilterSettings,
  parseRecallFilterSettings,
  recallFilterSettingsKey,
  saveRecallFilterSettings,
  selectFilteredLessons,
} from '../web/src/recall-filter.js';

const lessons = JSON.parse(readFileSync('web/src/training-lessons.json', 'utf8')) as Array<{ id: string; domain: string; phrases: Array<{ en: string; ja: string }> }>;
const ids = lessons.map((lesson) => lesson.id);

function memoryStorage(initial: Record<string, string> = {}, failSet: (key: string) => boolean = () => false) {
  const data = { ...initial };
  const calls: string[] = [];
  return {
    data, calls,
    getItem: (key: string) => { calls.push('get:' + key); return data[key] ?? null; },
    setItem: (key: string, value: string) => {
      calls.push('set:' + key);
      if (failSet(key)) throw new Error('QuotaExceededError');
      data[key] = value;
    },
    removeItem: (key: string) => { calls.push('remove:' + key); delete data[key]; },
  };
}

test('filter settings fall back to OFF for missing, corrupt or out-of-schema values', () => {
  assert.deepEqual(parseRecallFilterSettings(null), { settings: { version: 1, mode: 'off', lessonIds: [] }, status: 'missing' });
  for (const value of ['{', '[]', 'null', '"include"', '{"version":2,"mode":"include","lessonIds":[]}',
    '{"version":1,"mode":"only","lessonIds":[]}', '{"version":1,"mode":"include","lessonIds":"a"}',
    '{"version":1,"mode":"include","lessonIds":[1]}', '{"version":1,"mode":"include","lessonIds":["a","a"]}',
    '{"version":1,"mode":"include","lessonIds":[],"extra":true}']) {
    assert.deepEqual(parseRecallFilterSettings(value), { settings: { version: 1, mode: 'off', lessonIds: [] }, status: 'invalid' }, value);
  }
  assert.deepEqual(parseRecallFilterSettings('{"version":1,"mode":"exclude","lessonIds":["x","basic-delivery"]}').settings,
    { version: 1, mode: 'exclude', lessonIds: ['x', 'basic-delivery'] });
  const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} };
  assert.equal(loadRecallFilterSettings(() => throwing).status, 'unavailable');
  assert.equal(loadRecallFilterSettings(() => throwing).settings.mode, 'off');
  assert.equal(saveRecallFilterSettings(() => throwing, { version: 1, mode: 'include', lessonIds: [] }), false);
  const storage = memoryStorage();
  assert.equal(saveRecallFilterSettings(() => storage, { version: 1, mode: 'include', lessonIds: ['cash-payment'] }), true);
  assert.deepEqual(storage.calls, ['set:' + recallFilterSettingsKey]);
});

test('include, exclude and OFF keep the existing lesson order and ignore unknown IDs', () => {
  const pick = ['etcl-03-recent-events', 'basic-delivery', 'unknown-lesson', 'etcl-01-talking-about-my-job'];
  assert.deepEqual(selectFilteredLessons(lessons, { version: 1, mode: 'include', lessonIds: pick }).map((l) => l.id),
    ids.filter((id) => pick.includes(id)));
  assert.deepEqual(selectFilteredLessons(lessons, { version: 1, mode: 'exclude', lessonIds: pick }).map((l) => l.id),
    ids.filter((id) => !pick.includes(id)));
  assert.deepEqual(selectFilteredLessons(lessons, { version: 1, mode: 'off', lessonIds: pick }), lessons);
  assert.deepEqual(selectFilteredLessons(lessons, { version: 1, mode: 'include', lessonIds: ['unknown-lesson'] }), []);
  assert.deepEqual(selectFilteredLessons(lessons, { version: 1, mode: 'exclude', lessonIds: ids }), []);
});

test('filter keys identify the target lesson set per queue mode, independent of how it was selected', () => {
  const a = lessons.filter((lesson) => ['cash-payment', 'etcl-02-daily-routine'].includes(lesson.id));
  assert.equal(createRecallFilterKey('global', a), 'global:cash-payment,etcl-02-daily-routine');
  assert.equal(createRecallFilterKey('global', [...a].reverse()), createRecallFilterKey('global', a));
  assert.notEqual(createRecallFilterKey('sequential-category', a), createRecallFilterKey('global', a));
  assert.notEqual(createRecallFilterKey('global', a.slice(0, 1)), createRecallFilterKey('global', a));
  const viaExclude = selectFilteredLessons(lessons, { version: 1, mode: 'exclude', lessonIds: ids.filter((id) => !['cash-payment', 'etcl-02-daily-routine'].includes(id)) });
  assert.equal(createRecallFilterKey('global', viaExclude), createRecallFilterKey('global', a));
});

test('filtered stores touch only their own two keys and still require the librarySignature check', () => {
  const existing = { 'eag.activeRecallSession.v1': 'A', 'eag.activeRecallDiagnosticRound.v1': 'B', 'eag.weakPhrases.v1': '["x:0"]' };
  const storage = memoryStorage(existing);
  const target = lessons.filter((lesson) => lesson.id === 'cash-payment');
  const stores = createFilteredActiveRecallStores(() => storage, 'global', target, () => assert.fail('no failure expected'));
  const fresh = createFreshActiveRecallSession(target, () => 0.5, undefined, 'global');
  assert.equal(stores.session.save(fresh.session), true);
  assert.equal(stores.round.save({ version: 1, currentRound: 3, lastCompletedRound: 2 }), true);
  assert.equal(stores.session.clear(), true);
  assert.equal(stores.session.save(fresh.session), true);
  const keys = [filteredSessionKeyPrefix + 'global:cash-payment', filteredRoundKeyPrefix + 'global:cash-payment'];
  assert.ok(storage.calls.every((call) => keys.includes(call.slice(call.indexOf(':') + 1))), storage.calls.join());
  for (const [key, value] of Object.entries(existing)) assert.equal(storage.data[key], value);
  // A same-key session built from different lesson content is not resumed.
  const resumed = prepareActiveRecallSession(target, stores.session.load(), () => 0.5, 'global');
  assert.equal(resumed.resumed, true);
  const changed = target.map((lesson) => ({ ...lesson, phrases: lesson.phrases.map((p, i) => i === 0 ? { ...p, en: p.en + '!' } : p) }));
  assert.equal(prepareActiveRecallSession(changed, stores.session.load(), () => 0.5, 'global').diagnostic.reason, 'library-signature-mismatch');
});

test('a full storage reports once, never deletes data and stops further writes', () => {
  const existing = { 'eag.activeRecallSession.v1': 'A', 'other.app': 'B' };
  const storage = memoryStorage(existing, (key) => key.startsWith('eag.filtered'));
  let failures = 0;
  const target = lessons.filter((lesson) => lesson.id === 'pin-verification');
  const stores = createFilteredActiveRecallStores(() => storage, 'sequential-category', target, () => { failures += 1; });
  const fresh = createFreshActiveRecallSession(target, () => 0.5, undefined, 'sequential-category');
  assert.equal(stores.session.save(fresh.session), false);
  assert.equal(stores.round.save({ version: 1, currentRound: 1, lastCompletedRound: 0 }), false);
  assert.equal(stores.session.save(fresh.session), false);
  assert.equal(failures, 1);
  assert.equal(stores.session.isAvailable(), false);
  assert.ok(!storage.calls.some((call) => call.startsWith('remove:')));
  assert.deepEqual(storage.data, existing);
});

test('filter keys decode back to their target lesson set in every mode, so distinct sets never collide', () => {
  assert.equal(ids.length, 20);
  const modes = ['global', 'sequential-category', 'sequential-category-order'] as const;
  const prefixes = new Set<string>();
  // All sets of size <= 3, their complements, the full set and 5000 seeded random sets.
  // (A one-off exhaustive run over all 2^20 - 1 sets also passed; it is too slow for CI.)
  const full = (1 << ids.length) - 1;
  const masks = new Set<number>([full]);
  for (let a = 0; a < ids.length; a += 1) for (let b = a; b < ids.length; b += 1) for (let c = b; c < ids.length; c += 1) {
    const small = (1 << a) | (1 << b) | (1 << c);
    masks.add(small);
    if ((full ^ small) !== 0) masks.add(full ^ small);
  }
  let seed = 20261115;
  for (let index = 0; index < 5000; index += 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    if (seed & full) masks.add(seed & full);
  }
  for (const mask of masks) {
    const subset = lessons.filter((_lesson, index) => mask & (1 << index));
    const expected = subset.map((lesson) => lesson.id).sort().join('\n');
    for (const mode of modes) {
      const key = createRecallFilterKey(mode, subset);
      const separator = key.indexOf(':');
      const decoded = key.slice(separator + 1).split(',').map(decodeURIComponent).join('\n');
      // A decodable key is injective: distinct target sets cannot share it.
      if (key.slice(0, separator) !== mode || decoded !== expected) assert.fail(`Key does not decode for mask ${mask} in ${mode}`);
      if (mask === 1) prefixes.add(key.slice(0, separator + 1));
    }
  }
  assert.equal(prefixes.size, 3);
  // Separator characters in future IDs are encoded instead of creating ambiguity.
  const tricky = [{ id: 'a,b' }, { id: 'c' }];
  assert.notEqual(createRecallFilterKey('global', tricky), createRecallFilterKey('global', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]));
  assert.equal(createRecallFilterKey('global', [{ id: 'x:y' }]), 'global:x%3Ay');
  // Filtered keys can never equal or prefix any existing Active Recall key.
  for (const key of ['eag.activeRecallSession.v1', 'eag.sequentialCategoryActiveRecallSession.v1', 'eag.sequentialCategoryOrderedActiveRecallSession.v1',
    'eag.activeRecallDiagnosticRound.v1', 'eag.sequentialCategoryActiveRecallDiagnosticRound.v1', 'eag.sequentialCategoryOrderedActiveRecallDiagnosticRound.v1',
    'eag.weakPhrases.v1', recallFilterSettingsKey]) {
    assert.ok(!key.startsWith(filteredSessionKeyPrefix) && !key.startsWith(filteredRoundKeyPrefix));
  }
});
