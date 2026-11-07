import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveTrainingScriptDomain } from './training-script-domain.js';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { selectLegacyActiveRecallLessons, orderLegacyActiveRecallLessons } from '../web/src/legacy-active-recall-library.js';
import { createActiveRecallLibrarySignature, createFreshActiveRecallSession, prepareActiveRecallSession, createSequentialCategoryOrderedActiveRecallQueue } from '../web/src/active-recall.js';

type Lesson = { id: string; domain: string; phrases: Array<{ en: string; ja: string }> };
const lessons: Lesson[] = JSON.parse(readFileSync('web/src/training-lessons.json', 'utf8'));
const legacy = selectLegacyActiveRecallLessons(lessons);
const ordered = orderLegacyActiveRecallLessons(lessons);
const legacyIds = ['basic-delivery', 'cash-payment', 'change-handling', 'complete-delivery',
  'giving-directions', 'order-verification', 'pin-verification', 'restaurant-delay'];

test('ETCL index registers 12 unique lessons separately and preserves all legacy source content', () => {
  assert.equal(lessons.length, 20);
  assert.equal(new Set(lessons.map(lesson => lesson.id)).size, 20);
  assert.deepEqual(legacy.map(lesson => lesson.id), legacyIds);
  // Captured before Phase 5B-1: protects text, identities, domains and file-sort order.
  assert.equal(createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
    'ae393aef448cc13c37a757bfddb625d1a18b44d173f4d0f3ad38155e970e5623');
  const etcl = lessons.filter(lesson => lesson.domain === 'etcl');
  assert.equal(etcl.length, 12);
  assert.equal(etcl.reduce((count, lesson) => count + lesson.phrases.length, 0), 68);
  const sourceFiles = readdirSync('training-scripts').filter(file => file.startsWith('etcl-')).sort();
  assert.equal(sourceFiles.length, 12);
  for (const [index, file] of sourceFiles.entries()) {
    const source = JSON.parse(readFileSync(`training-scripts/${file}`, 'utf8'));
    assert.deepEqual(etcl[index], { ...source, domain: 'etcl' });
    assert.equal(source.id.slice(5, 7), String(index + 1).padStart(2, '0'));
  }
});

test('legacy signatures and sequential phrase order remain unchanged', () => {
  assert.equal(createActiveRecallLibrarySignature(legacy), 'fnv1a32:85:32bf4dac');
  assert.equal(createActiveRecallLibrarySignature(ordered), 'fnv1a32:85:a7bb76ae');
  const expectedIds = [...legacyIds.filter(id => id !== 'giving-directions'), 'giving-directions'];
  assert.deepEqual(ordered.map(lesson => lesson.id), expectedIds);
  assert.deepEqual(createSequentialCategoryOrderedActiveRecallQueue(ordered),
    expectedIds.flatMap(id => {
      const source = JSON.parse(readFileSync(`training-scripts/${id}.json`, 'utf8'));
      return source.phrases.map((phrase: { en: string; ja: string }, phraseIndex: number) =>
        ({ lessonId: id, phraseIndex, ...phrase }));
    }));
});

test('all three legacy modes exclude ETCL and resume original 85-phrase sessions', () => {
  const sourceLessons = legacyIds.map(id => JSON.parse(readFileSync(`training-scripts/${id}.json`, 'utf8')));
  for (const mode of ['global', 'sequential-category', 'sequential-category-order'] as const) {
    const before = mode === 'global' ? sourceLessons : orderLegacyActiveRecallLessons(sourceLessons);
    const after = mode === 'global' ? legacy : ordered;
    const saved = createFreshActiveRecallSession(before, () => 0.25, undefined, mode);
    saved.session.currentIndex = 43;
    const resumed = prepareActiveRecallSession(after, JSON.stringify(saved.session), () => {
      throw new Error('Existing sessions must not reshuffle');
    }, mode);
    assert.equal(resumed.resumed, true);
    assert.deepEqual(resumed.session, saved.session);
    const fresh = createFreshActiveRecallSession(after, () => 0.25, undefined, mode);
    assert.deepEqual(fresh.queue, saved.queue);
    assert.equal(fresh.queue.length, 85);
    assert.ok(fresh.queue.every(entry => !entry.lessonId.startsWith('etcl-')));
  }
});

test('offline asset list contains only published legacy assets while ETCL audio is absent', () => {
  const context = { self: { EAG_TRAINING_AUDIO_ASSETS: [] as string[] } };
  runInNewContext(readFileSync('web/public/training-audio-assets.js', 'utf8'), context);
  assert.equal(context.self.EAG_TRAINING_AUDIO_ASSETS.length, 24);
  for (const path of context.self.EAG_TRAINING_AUDIO_ASSETS) {
    assert.ok(existsSync(`web/public/${path}`));
    assert.ok(!path.includes('etcl-'));
  }
});

test('index generator accepts etcl and rejects unknown domains, duplicates and invalid input', () => {
  const directory = mkdtempSync(join(tmpdir(), 'eag-index-test-'));
  const generator = resolve('src/generate-training-index.ts');
  const loader = import.meta.resolve('tsx');
  const input = { id: 'example', domain: 'etcl', scenario: 'Example', scenarioJa: '例',
    phrases: [{ en: 'Example', ja: '例' }] };
  try {
    mkdirSync(join(directory, 'training-scripts'));
    mkdirSync(join(directory, 'web/src'), { recursive: true });
    mkdirSync(join(directory, 'web/public'), { recursive: true });
    const run = () => spawnSync(process.execPath, ['--import', loader, generator],
      { cwd: directory, encoding: 'utf8' });
    const write = (lesson: unknown) => writeFileSync(join(directory, 'training-scripts/a.json'), JSON.stringify(lesson));
    write(input);
    assert.equal(run().status, 0);
    assert.equal(JSON.parse(readFileSync(join(directory, 'web/src/training-lessons.json'), 'utf8'))[0].domain, 'etcl');
    for (const invalid of [{ ...input, domain: 'unknown' }, { ...input, phrases: [] }, { ...input, scenarioJa: '' }]) {
      write(invalid);
      assert.notEqual(run().status, 0);
    }
    write(input);
    writeFileSync(join(directory, 'training-scripts/b.json'), JSON.stringify({ ...input, domain: 'delivery' }));
    const duplicate = run();
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /duplicate lesson id/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test('domain normalization is restricted to audited ETCL IDs and rejects conflicting domains', () => {
  const id = 'etcl-01-talking-about-my-job';
  assert.equal(resolveTrainingScriptDomain(id, 'everyday'), 'etcl');
  assert.equal(resolveTrainingScriptDomain(id, 'etcl'), 'etcl');
  assert.throws(() => resolveTrainingScriptDomain(id, 'delivery'), /source domain/);
  assert.equal(resolveTrainingScriptDomain('etcl-13-future-lesson', 'everyday'), 'everyday');
  assert.equal(resolveTrainingScriptDomain('giving-directions', 'everyday'), 'everyday');
});
