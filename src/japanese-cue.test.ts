import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createJapaneseMp3Player, getJapaneseCueMode, japaneseCueMp3Path, playJapaneseCue,
  isBundledJapaneseCueMp3, probeJapaneseMp3Url,
} from '../web/src/japanese-cue.js';
import { createActiveRecallSessionStore, createFreshActiveRecallSession, prepareActiveRecallSession } from '../web/src/active-recall.js';
import { createJapaneseCueTestSessionStore, japaneseCueTestPhraseCount } from '../web/src/japanese-cue-test-session.js';

class FakeAudio extends EventTarget {
  src = '';
  loop = true;
  error: { code: number; message?: string } | null = null;
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
  const player = createJapaneseMp3Player(() => audio, () => snapshot, () => {}, async () => 'HTTP 404');
  return { audio, snapshot, player };
}
const cue = { lessonId: 'basic-delivery', phraseIndex: 0, queueIndex: 0 };

test('MP3 is default and Speech Synthesis remains an explicit legacy choice', async () => {
  assert.equal(getJapaneseCueMode(), 'mp3');
  assert.equal(getJapaneseCueMode('unknown'), 'mp3');
  let mp3Calls = 0;
  let speechCalls = 0;
  await playJapaneseCue(getJapaneseCueMode(), async () => { assert.fail('No automatic speech fallback'); }, async () => { mp3Calls += 1; });
  await playJapaneseCue(getJapaneseCueMode('speech-synthesis'), async () => { speechCalls += 1; }, async () => { assert.fail('Legacy uses speech only'); });
  assert.equal(mp3Calls, 1);
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

test('Japanese completion is observed in the shared sequence before the English continuation', async () => {
  const audio = new FakeAudio();
  const sequence: string[] = [];
  const player = createJapaneseMp3Player(() => audio,
    () => ({ visibility: 'visible', time: 0 }), () => {}, undefined,
    kind => { sequence.push(kind); });
  const playback = player.play(cue, '/').then(() => { sequence.push('english play-request'); });
  audio.dispatchEvent(new Event('playing'));
  audio.dispatchEvent(new Event('ended'));
  await playback;
  assert.deepEqual(sequence, ['japanese-mp3 request', 'japanese-mp3 play', 'japanese-mp3 ended', 'english play-request']);
  const brokenObserver = createJapaneseMp3Player(() => audio,
    () => ({ visibility: 'visible', time: 0 }), () => {}, undefined,
    () => { throw new Error('observer failed'); });
  const next = brokenObserver.play(cue, '/');
  audio.dispatchEvent(new Event('ended'));
  await next;
});

test('bundled sample paths match all three checked-in files and exclude ungenerated phrases', () => {
  for (const index of [0, 1, 2]) {
    const path = japaneseCueMp3Path('basic-delivery', index);
    assert.equal(path, `diagnostics/japanese-cues/basic-delivery/phrase-00${index + 1}.mp3`);
    assert.equal(isBundledJapaneseCueMp3('basic-delivery', index), true);
    assert.equal(existsSync(new URL(`../web/public/${path}`, import.meta.url)), true);
  }
  for (const [lessonId, index] of [['restaurant-delay', 3], ['basic-delivery', 3], ['basic-delivery', -1]] as const) {
    assert.equal(isBundledJapaneseCueMp3(lessonId, index), false);
    assert.equal(existsSync(new URL(`../web/public/${japaneseCueMp3Path(lessonId, index)}`, import.meta.url)), false);
  }
});

test('fresh test uses an independent memory store and preserves normal resume at index 43', () => {
  const lessons = JSON.parse(readFileSync(new URL('../web/src/training-lessons.json', import.meta.url), 'utf8'));
  const original = createFreshActiveRecallSession(lessons, undefined, undefined, 'sequential-category-order');
  original.session.currentIndex = 43;
  let persisted = JSON.stringify(original.session);
  const before = persisted;
  let writes = 0;
  const normalStore = createActiveRecallSessionStore(() => ({
    getItem: () => persisted,
    setItem: (_key, value) => { writes += 1; persisted = value; },
    removeItem: () => { writes += 1; persisted = ''; },
  }), 'normal-session');
  const normal = prepareActiveRecallSession(lessons, normalStore.load(), undefined, 'sequential-category-order');
  assert.equal(normal.resumed, true);
  assert.equal(normal.session.currentIndex, 43);
  const store = createJapaneseCueTestSessionStore(lessons);
  const diagnostic = prepareActiveRecallSession(lessons, store.load(), undefined, 'sequential-category-order');
  assert.equal(diagnostic.resumed, false);
  assert.equal(diagnostic.session.currentIndex, 0);
  assert.equal(diagnostic.queue.length, 85);
  assert.deepEqual(diagnostic.queue.slice(0, japaneseCueTestPhraseCount).map(entry => `${entry.lessonId}:${entry.phraseIndex}`), [
    'basic-delivery:0', 'basic-delivery:1', 'basic-delivery:2',
  ]);
  for (let index = 0; index < japaneseCueTestPhraseCount; index += 1) {
    diagnostic.session.currentIndex = index;
    assert.equal(store.save(diagnostic.session), true);
  }
  store.clear();
  assert.equal(writes, 0);
  assert.equal(persisted, before);
  assert.deepEqual(prepareActiveRecallSession(lessons, normalStore.load(), undefined, 'sequential-category-order'), normal);
  assert.equal(createJapaneseCueTestSessionStore(lessons).load(), null);
});

test('fresh diagnostic refuses a library whose ordered first cues are not the sample', () => {
  assert.throws(() => createJapaneseCueTestSessionStore([
    { id: 'other', phrases: [{ en: 'Hi', ja: 'こんにちは' }] },
  ]), /Basic Delivery/);
});

test('HTTP probe distinguishes not found, HTTP failure, network failure and reachable content', async () => {
  const url = '/English-Audio-Generator/diagnostics/japanese-cues/restaurant-delay/phrase-004.mp3';
  const missing = await probeJapaneseMp3Url(url, async (input, init) => {
    assert.equal(input, url);
    assert.equal(init?.method, 'HEAD');
    return new Response(null, { status: 404, headers: { 'content-type': 'text/html' } });
  });
  assert.equal(missing, 'not-found; HTTP 404; Content-Type: text/html');
  assert.match(await probeJapaneseMp3Url(url, async () => new Response(null, { status: 503 })), /HTTP-failure; HTTP 503/);
  assert.match(await probeJapaneseMp3Url(url, async () => { throw new TypeError('offline'); }), /network-failure; TypeError/);
  assert.match(await probeJapaneseMp3Url(url, async () => new Response(null, { headers: { 'content-type': 'audio/mpeg' } })), /reachable \(not a decode test\); HTTP 200; Content-Type: audio\/mpeg/);
});

test('both play rejection and media error survive either arrival order', async () => {
  for (const mediaFirst of [true, false]) {
    const { player, audio } = fixture();
    audio.rejection = new DOMException('Source unavailable', 'NotSupportedError');
    const playback = player.play({ lessonId: 'restaurant-delay', phraseIndex: 3, queueIndex: 43 }, '/English-Audio-Generator/');
    const rejected = assert.rejects(playback);
    audio.error = { code: 4, message: 'Resource unavailable' };
    if (!mediaFirst) await rejected;
    audio.dispatchEvent(new Event('error'));
    await rejected;
    const lines = player.lines();
    assert.ok(lines.includes('Japanese MP3 media error event: yes'));
    assert.ok(lines.includes('Japanese MP3 play() rejection: NotSupportedError: Source unavailable'));
    assert.ok(lines.includes('Japanese MP3 audio.error.code: 4'));
    assert.ok(lines.includes('Japanese MP3 audio.error.message: Resource unavailable'));
    assert.ok(lines.includes('Japanese MP3 bundled sample: no'));
    assert.ok(lines.includes('Japanese MP3 resolved path: /English-Audio-Generator/diagnostics/japanese-cues/restaurant-delay/phrase-004.mp3'));
    assert.ok(lines.includes(`Japanese MP3 first failure source: ${mediaFirst ? 'media-element-error' : 'play-rejection'}`));
  }
});

test('HTTP diagnostics run only after failure and cannot overwrite a newer cue', async () => {
  const audio = new FakeAudio();
  let completeProbe: (result: string) => void = () => {};
  let probeCalls = 0;
  const player = createJapaneseMp3Player(() => audio, () => ({ visibility: 'visible', time: 0 }), () => {}, () => {
    probeCalls += 1;
    return new Promise(resolve => { completeProbe = resolve; });
  });
  const first = player.play(cue, '/');
  assert.equal(probeCalls, 0);
  audio.dispatchEvent(new Event('error'));
  await assert.rejects(first);
  assert.equal(probeCalls, 1);
  const next = player.play({ ...cue, phraseIndex: 1, queueIndex: 1 }, '/');
  completeProbe('not-found; HTTP 404');
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(player.lines().includes('Japanese MP3 HTTP check: not-checked (only after playback failure)'));
  assert.ok(player.lines().includes('Japanese MP3 resolved path: /diagnostics/japanese-cues/basic-delivery/phrase-002.mp3'));
  audio.dispatchEvent(new Event('ended'));
  await next;
});
