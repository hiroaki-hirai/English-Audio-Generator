import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpeechDiagnostic } from '../web/src/speech-diagnostic.js';
import { createFreshActiveRecallSession } from '../web/src/active-recall.js';

function fixture() {
  const snapshot = {
    visibility: 'hidden', time: 10, speaking: false, pending: true, paused: false,
  };
  const diagnostic = createSpeechDiagnostic(() => ({ ...snapshot }));
  const id = diagnostic.request({ phraseId: 'lesson:2', queueIndex: 32, textLength: 8 });
  return { snapshot, diagnostic, id };
}

test('request before speak is distinguishable from a queued utterance without start', () => {
  const { diagnostic, id } = fixture();
  assert.ok(diagnostic.lines().includes('speech request: phrase 33 (request #1)'));
  assert.ok(diagnostic.lines().includes('speech speak called: no'));
  diagnostic.record(id, 'speak');
  const lines = diagnostic.lines();
  assert.ok(lines.includes('speech speak called: yes'));
  assert.ok(lines.includes('speech onstart: no'));
  assert.ok(lines.includes('visibility at speak: hidden'));
  assert.ok(lines.includes('speechSynthesis pending: true'));
});

test('start, end and error preserve event order, timestamp and event-time visibility', () => {
  const { diagnostic, snapshot, id } = fixture();
  diagnostic.record(id, 'speak');
  snapshot.time = 20;
  snapshot.speaking = true;
  diagnostic.record(id, 'onstart');
  assert.ok(diagnostic.lines().includes('speech onend: no'));
  snapshot.time = 30;
  snapshot.visibility = 'visible';
  snapshot.speaking = false;
  diagnostic.record(id, 'onend');
  diagnostic.record(id, 'onerror', 'interrupted');
  const lines = diagnostic.lines();
  for (const kind of ['onstart', 'onend', 'onerror']) {
    assert.ok(lines.includes(`speech ${kind}: yes`));
  }
  assert.ok(lines.includes('speech error value: interrupted'));
  assert.ok(lines.includes('visibility at onstart: hidden'));
  assert.ok(lines.includes('visibility at onend: visible'));
  assert.ok(lines.includes('visibility at onerror: visible'));
  assert.deepEqual(lines.slice(-5), [
    'request(hidden) @10.0 [false/true/false]',
    'speak(hidden) @10.0 [false/true/false]',
    'onstart(hidden) @20.0 [true/true/false]',
    'onend(visible) @30.0 [false/true/false]',
    'onerror(visible) @30.0 [false/true/false]',
  ]);
});

test('new request resets events and ignores stale utterance callbacks', () => {
  const { diagnostic, id } = fixture();
  diagnostic.record(id, 'onerror', 'canceled');
  diagnostic.request({ phraseId: 'lesson:3', queueIndex: 33, textLength: 12 });
  diagnostic.record(id, 'onend');
  assert.ok(diagnostic.lines().includes('speech onend: no'));
  assert.ok(diagnostic.lines().includes('speech onerror: no'));
  assert.ok(diagnostic.lines().includes('speech error value: none'));
});

test('unavailable browser diagnostic properties do not throw', () => {
  const diagnostic = createSpeechDiagnostic(() => { throw new Error('unavailable'); });
  const id = diagnostic.request({ phraseId: 'lesson:0', queueIndex: 0, textLength: 3 });
  assert.doesNotThrow(() => diagnostic.record(id, 'speak'));
  assert.deepEqual(diagnostic.lines(), ['speech diagnostic: unavailable']);
});

test('observing a cue does not mutate Active Recall queue, index or session', () => {
  const prepared = createFreshActiveRecallSession([
    { id: 'lesson', phrases: [{ en: 'Hello', ja: 'こんにちは' }] },
  ], () => 0);
  const before = JSON.stringify(prepared);
  const { diagnostic } = fixture();
  const entry = prepared.queue[prepared.session.currentIndex]!;
  const id = diagnostic.request({
    phraseId: `${entry.lessonId}:${entry.phraseIndex}`,
    queueIndex: prepared.session.currentIndex,
    textLength: entry.ja.length,
  });
  for (const kind of ['speak', 'onstart', 'onend', 'onerror'] as const) {
    diagnostic.record(id, kind);
    diagnostic.lines();
  }
  assert.equal(JSON.stringify(prepared), before);
});
