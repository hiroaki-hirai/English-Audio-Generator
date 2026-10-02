import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createJapaneseMp3Player, getJapaneseCueMode, japaneseCueMp3Path, playJapaneseCue,
} from '../web/src/japanese-cue.js';
import { createFreshActiveRecallSession } from '../web/src/active-recall.js';

class FakeAudio extends EventTarget {
  src = '';
  loop = true;
  error: { code: number } | null = null;
  playCalls = 0;
  pauseCalls = 0;
  rejection: Error | null = null;
  play(): Promise<void> {
    this.playCalls += 1;
    return this.rejection ? Promise.reject(this.rejection) : Promise.resolve();
  }
  pause(): void { this.pauseCalls += 1; }
}

function fixture() {
  const audio = new FakeAudio();
  const snapshot = { visibility: 'hidden', time: 10 };
  const player = createJapaneseMp3Player(() => audio, () => snapshot, () => {});
  return { audio, snapshot, player };
}
const cue = { lessonId: 'basic-delivery', phraseIndex: 0, queueIndex: 0 };

test('default cue mode calls only existing speech path', async () => {
  assert.equal(getJapaneseCueMode(), 'speech-synthesis');
  assert.equal(getJapaneseCueMode('unknown'), 'speech-synthesis');
  let speechCalls = 0;
  await playJapaneseCue(getJapaneseCueMode(), async () => { speechCalls += 1; }, async () => {
    assert.fail('Default must not create or play MP3');
  });
  assert.equal(speechCalls, 1);
});

test('MP3 routes only to MP3 and advances the awaited next step only after ended', async () => {
  const { player, audio, snapshot } = fixture();
  let nextStep = false;
  const playback = playJapaneseCue(getJapaneseCueMode('mp3-diagnostic'), async () => {
    assert.fail('MP3 must not call Speech Synthesis');
  }, () => player.play(cue, '/EAG/')).then(() => { nextStep = true; });
  await Promise.resolve();
  assert.equal(nextStep, false);
  assert.equal(audio.src, '/EAG/diagnostics/japanese-cues/basic-delivery/phrase-001.mp3');
  assert.equal(audio.loop, false);
  audio.dispatchEvent(new Event('playing'));
  await Promise.resolve();
  assert.equal(nextStep, false);
  snapshot.time = 20;
  audio.dispatchEvent(new Event('ended'));
  await playback;
  assert.equal(nextStep, true);
  assert.ok(player.lines().includes('Japanese MP3 play started: yes'));
  assert.ok(player.lines().includes('Japanese MP3 ended: yes'));
  assert.deepEqual(player.lines().slice(-3), [
    'japanese-mp3 request(hidden) @10.0',
    'japanese-mp3 play(hidden) @10.0',
    'japanese-mp3 ended(hidden) @20.0',
  ]);
});

test('MP3 media errors are diagnosed and reject instead of advancing normally', async () => {
  const { player, audio } = fixture();
  const playback = player.play(cue, '/');
  audio.error = { code: 4 };
  audio.dispatchEvent(new Event('error'));
  await assert.rejects(playback, /media-error:4/);
  assert.ok(player.lines().includes('Japanese MP3 error: media-error:4'));
  assert.ok(player.lines().includes('japanese-mp3 error(hidden) @10.0'));
  assert.ok(player.lines().includes('Japanese MP3 ended: no'));
});

test('autoplay rejection is diagnosed without fallback or retry', async () => {
  const { player, audio } = fixture();
  audio.rejection = new DOMException('Blocked', 'NotAllowedError');
  await assert.rejects(player.play(cue, '/'), /NotAllowedError/);
  assert.ok(player.lines().includes('Japanese MP3 error: NotAllowedError'));
  assert.equal(audio.playCalls, 1);
});

test('stop cancels cue and removes listeners before the next request', async () => {
  const { player, audio } = fixture();
  const playback = player.play(cue, '/');
  player.cancel();
  await playback;
  audio.dispatchEvent(new Event('ended'));
  assert.ok(player.lines().includes('Japanese MP3 ended: no'));
  assert.equal(audio.pauseCalls, 1);
  const next = player.play({ ...cue, phraseIndex: 1, queueIndex: 1 }, '/');
  assert.ok(player.lines().includes('Japanese MP3 play started: no'));
  audio.dispatchEvent(new Event('ended'));
  await next;
});

test('mode switching and cue playback do not modify queue, index or saved session', async () => {
  const prepared = createFreshActiveRecallSession([
    { id: 'basic-delivery', phrases: [{ en: 'Hello', ja: 'こんにちは' }] },
  ], () => 0);
  const before = JSON.stringify(prepared);
  const { player, audio } = fixture();
  for (const value of ['mp3-diagnostic', 'speech-synthesis']) {
    const playback = playJapaneseCue(getJapaneseCueMode(value), async () => {}, () => player.play({
      ...prepared.queue[0]!, queueIndex: prepared.session.currentIndex,
    }, '/'));
    if (value === 'mp3-diagnostic') audio.dispatchEvent(new Event('ended'));
    await playback;
    assert.equal(JSON.stringify(prepared), before);
  }
});

test('diagnostic observer failure does not interrupt MP3 completion', async () => {
  const audio = new FakeAudio();
  const player = createJapaneseMp3Player(() => audio, () => { throw new Error('diagnostics'); }, () => {});
  const playback = player.play(cue, '/');
  audio.dispatchEvent(new Event('ended'));
  await playback;
});

test('MP3 naming uses the original lesson phrase index, not shuffled queue position', () => {
  assert.equal(japaneseCueMp3Path('restaurant-delay', 0), 'diagnostics/japanese-cues/restaurant-delay/phrase-001.mp3');
});
