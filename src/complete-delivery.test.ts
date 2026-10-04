import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { canonicalCompleteDeliverySource, verifyCompleteDeliveryAssets } from './complete-delivery-assets.js';
import { prepareActiveRecallSession, createNextActiveRecallRound } from '../web/src/active-recall.js';
import { calculateTrainingAudioSourceHash } from './continuous-training.js';
import { sha256 } from './training-japanese-assets.js';
import { trainingJapaneseCueMp3Path } from '../web/src/training-japanese-cue.js';

const lessons = JSON.parse(readFileSync('web/src/training-lessons.json', 'utf8')) as Array<{
  id: string; domain: string; phrases: Array<{ en: string; ja: string }>;
}>;
const ordered = [...lessons.filter(lesson => lesson.domain === 'delivery'),
  ...lessons.filter(lesson => lesson.domain === 'everyday')];

test('Complete Delivery preserves all diagnostic pairs and independently copied, measured audio', async () => {
  const result = await verifyCompleteDeliveryAssets();
  assert.equal(result.phrases, 20);
  assert.equal(result.copiedAssets, 21);
  assert.equal(result.continuousSegments, 40);
  assert.equal(result.englishDuration, 311.832);
  assert.equal(result.continuousDuration, 236.832);
  assert.ok(result.minCorrelation >= 0.98);
  const manifest = JSON.parse(readFileSync('web/public/japanese-cue-manifest.json', 'utf8'));
  assert.equal(manifest.entries.length, 85);
  for (let index = 0; index < 20; index += 1) {
    const entry = manifest.entries.find((entry: { phraseId: string }) => entry.phraseId === `complete-delivery:${index}`);
    assert.equal(entry.path, trainingJapaneseCueMp3Path('complete-delivery', index));
  }
});

test('all three modes include 20 distinct Complete Delivery identities once per 85-phrase round', () => {
  assert.equal(lessons.length, 8);
  for (const mode of ['global', 'sequential-category', 'sequential-category-order'] as const) {
    const library = mode === 'global' ? lessons : ordered;
    const fresh = prepareActiveRecallSession(library, null, () => 0.25, mode);
    const next = createNextActiveRecallRound(library,
      { version: 1, currentRound: 1, lastCompletedRound: 0 }, () => 0.75, mode);
    for (const queue of [fresh.queue, next.preparedSession.queue]) {
      assert.equal(queue.length, 85);
      assert.equal(new Set(queue.map(entry => `${entry.lessonId}:${entry.phraseIndex}`)).size, 85);
      const complete = queue.filter(entry => entry.lessonId === 'complete-delivery');
      assert.equal(complete.length, 20);
      assert.deepEqual(complete.map(entry => entry.phraseIndex).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i));
      if (mode === 'sequential-category-order') {
        assert.deepEqual(complete.map(entry => entry.phraseIndex), Array.from({ length: 20 }, (_, i) => i));
        assert.deepEqual([...new Set(queue.map(entry => entry.lessonId))], [
          'basic-delivery', 'cash-payment', 'change-handling', 'complete-delivery',
          'order-verification', 'pin-verification', 'restaurant-delay', 'giving-directions',
        ]);
      }
    }
  }
});

test('old 65-phrase sessions start fresh while new 85-phrase sessions resume in every mode', () => {
  for (const mode of ['global', 'sequential-category', 'sequential-category-order'] as const) {
    const library = mode === 'global' ? lessons : ordered;
    const oldLibrary = library.filter(lesson => lesson.id !== 'complete-delivery');
    const old = prepareActiveRecallSession(oldLibrary, null, () => 0.25, mode);
    assert.equal(old.queue.length, 65);
    old.session.currentIndex = 43;
    const upgraded = prepareActiveRecallSession(library, JSON.stringify(old.session), () => 0.5, mode);
    assert.equal(upgraded.resumed, false);
    assert.equal(upgraded.diagnostic.reason, 'library-signature-mismatch');
    assert.equal(upgraded.queue.length, 85);
    assert.equal(upgraded.session.currentIndex, 0);
    upgraded.session.currentIndex = upgraded.queue.findIndex(entry => entry.lessonId === 'complete-delivery');
    const resumed = prepareActiveRecallSession(library, JSON.stringify(upgraded.session), () => 0.75, mode);
    assert.equal(resumed.resumed, true);
    assert.deepEqual(resumed.session, upgraded.session);
    assert.equal(resumed.queue[resumed.session.currentIndex]!.lessonId, 'complete-delivery');
  }
});

test('published training asset list includes exactly three normal assets per lesson', () => {
  const context = { self: { EAG_TRAINING_AUDIO_ASSETS: [] as string[] } };
  runInNewContext(readFileSync('web/public/training-audio-assets.js', 'utf8'), context);
  const assets = context.self.EAG_TRAINING_AUDIO_ASSETS;
  assert.equal(assets.length, 24);
  assert.equal(new Set(assets).size, 24);
  for (const file of ['lesson.mp3', 'continuous-training.mp3', 'metadata.json']) {
    assert.ok(assets.includes(`lessons/complete-delivery/${file}`));
    assert.ok(readFileSync(`web/public/lessons/complete-delivery/${file}`).length > 0);
  }
  assert.ok(!assets.some(path => path.includes('/japanese-cues/') || path.includes('diagnostics/')));
});


test('Complete Delivery LF and Windows CRLF sources match the recorded canonical hashes', () => {
  const lf = canonicalCompleteDeliverySource(readFileSync('training-scripts/complete-delivery.json'));
  const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'));
  assert.ok(crlf.includes(Buffer.from('\r\n')));
  assert.ok(!lf.includes(Buffer.from('\r\n')));
  const provenance = JSON.parse(readFileSync('web/public/lessons/complete-delivery/audio-provenance.json', 'utf8'));
  const recorded = readFileSync('web/public/lessons/complete-delivery/source-hash.txt', 'utf8').trim();
  for (const source of [lf, crlf]) {
    const canonical = canonicalCompleteDeliverySource(source);
    assert.ok(canonical.equals(lf));
    assert.equal(calculateTrainingAudioSourceHash(canonical), recorded);
    assert.equal(provenance.sourceHash, recorded);
    assert.equal(sha256(canonical), provenance.sourceSha256);
  }
});
