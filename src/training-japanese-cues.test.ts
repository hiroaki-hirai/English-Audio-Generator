import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { expectedJapaneseAssets, verifyTrainingJapaneseAssets } from './training-japanese-assets.js';
import { trainingJapaneseCueMp3Path } from '../web/src/training-japanese-cue.js';
import { createActiveRecallQueue, createSequentialCategoryActiveRecallQueue, createSequentialCategoryOrderedActiveRecallQueue,
  prepareActiveRecallSession } from '../web/src/active-recall.js';
import { createJapaneseMp3Player, playJapaneseCue } from '../web/src/japanese-cue.js';

test('all 85 normal Japanese assets match source, unique mapping, manifest hashes and decoded audio', async () => {
  assert.deepEqual(await verifyTrainingJapaneseAssets(), { files: 85, missing: 0, extra: 0, duplicateIds: 0, mismatches: 0 });
});

test('all queue modes resolve original phrase identities and preserve resumed queue progress', async () => {
  const lessons = JSON.parse(await readFile('web/src/training-lessons.json', 'utf8'));
  const assets = await expectedJapaneseAssets();
  const queues = [createActiveRecallQueue(lessons, () => 0.25), createSequentialCategoryActiveRecallQueue(lessons, () => 0.25), createSequentialCategoryOrderedActiveRecallQueue(lessons)];
  for (const queue of queues) {
    assert.equal(queue.length, 85);
    queue.forEach((entry, queueIndex) => {
      const asset = assets.find(asset => asset.phraseId === `${entry.lessonId}:${entry.phraseIndex}`)!;
      assert.equal(entry.ja, asset.ja);
      assert.equal(trainingJapaneseCueMp3Path(entry.lessonId, entry.phraseIndex), asset.path);
      if (queueIndex !== entry.phraseIndex) assert.equal(asset.phraseIndex, entry.phraseIndex);
    });
  }
  for (const mode of ['global', 'sequential-category', 'sequential-category-order'] as const) {
    const initial = prepareActiveRecallSession(lessons, null, () => 0.25, mode);
    initial.session.currentIndex = 43;
    const stored = JSON.stringify(initial.session);
    const resumed = prepareActiveRecallSession(lessons, stored, () => 0.75, mode);
    assert.equal(resumed.resumed, true);
    assert.deepEqual(resumed.session, initial.session);
    assert.equal(JSON.stringify(initial.session), stored);
    const entry = resumed.queue[43]!;
    assert.ok(assets.some(asset => asset.path === trainingJapaneseCueMp3Path(entry.lessonId, entry.phraseIndex)));
  }
  assert.equal(trainingJapaneseCueMp3Path('cash-payment', 3), 'lessons/cash-payment/japanese-cues/phrase-004.mp3');
  assert.throws(() => trainingJapaneseCueMp3Path('../diagnostics', 0));
  assert.throws(() => trainingJapaneseCueMp3Path('cash-payment', -1));
});

test('normal MP3 waits for ended before English continuation and errors never fall back to speech', async () => {
  class Audio extends EventTarget {
    src = ''; loop = false; error: { code: number } | null = null;
    plays = 0;
    play() { this.plays += 1; return Promise.resolve(); }
    pause() {}
  }
  const audio = new Audio();
  const player = createJapaneseMp3Player(() => audio, () => ({ visibility: 'hidden', time: 1 }), () => {}, async () => 'HTTP 404');
  let english = 0, speech = 0;
  const cue = { lessonId: 'cash-payment', phraseIndex: 3, queueIndex: 60, assetScope: 'lesson' as const };
  const playback = playJapaneseCue('mp3', async () => { speech += 1; }, () => player.play(cue, '/EAG/')).then(() => { english += 1; });
  await Promise.resolve();
  assert.equal(english, 0);
  assert.equal(audio.src, '/EAG/lessons/cash-payment/japanese-cues/phrase-004.mp3');
  audio.dispatchEvent(new Event('ended'));
  await playback;
  assert.equal(english, 1);
  const failed = playJapaneseCue('mp3', async () => { speech += 1; }, () => player.play(cue, '/EAG/'));
  audio.error = { code: 4 };
  audio.dispatchEvent(new Event('error'));
  await assert.rejects(failed, /media-error:4/);
  assert.equal(speech, 0);
  assert.equal(audio.plays, 2);
  assert.ok(player.lines().includes('Japanese MP3 asset scope: lesson'));
});
