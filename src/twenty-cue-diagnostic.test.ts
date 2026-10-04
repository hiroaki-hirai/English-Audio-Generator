import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { diagnosticLesson, diagnosticCueCount, diagnosticJapanesePath, lessonMediaPath } from '../web/src/diagnostic-fixture.js';
import { createTwentyCueSessionStore } from '../web/src/twenty-cue-diagnostic.js';
import { createActiveRecallSessionStore, prepareActiveRecallSession } from '../web/src/active-recall.js';
import { japaneseCueMp3Path } from '../web/src/japanese-cue.js';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('20-Cue fixture stays ordered and memory-only while normal resume is preserved', () => {
  const lessons = JSON.parse(readFileSync('web/src/training-lessons.json', 'utf8'));
  const normal = prepareActiveRecallSession(lessons, null, undefined, 'sequential-category-order');
  normal.session.currentIndex = 43;
  const saved = JSON.stringify(normal.session);
  let writes = 0;
  const normalStore = createActiveRecallSessionStore(() => ({
    getItem: () => saved, setItem: () => { writes += 1; }, removeItem: () => { writes += 1; },
  }), 'normal');
  const store = createTwentyCueSessionStore();
  const diagnostic = prepareActiveRecallSession([diagnosticLesson], store.load(), undefined, 'sequential-category-order');
  assert.equal(diagnosticCueCount, 20);
  assert.equal(diagnostic.queue.length, 20);
  assert.equal(diagnostic.session.currentIndex, 0);
  assert.equal(diagnostic.resumed, false);
  diagnostic.queue.forEach((entry, index) => {
    assert.equal(entry.lessonId, diagnosticLesson.id);
    assert.equal(entry.phraseIndex, index);
    assert.equal(entry.en, diagnosticLesson.phrases[index]!.en);
    assert.equal(entry.ja, diagnosticLesson.phrases[index]!.ja);
    assert.equal(japaneseCueMp3Path(entry.lessonId, index), diagnosticJapanesePath(index));
    diagnostic.session.currentIndex = index;
    assert.equal(store.save(diagnostic.session), true);
  });
  store.clear();
  assert.equal(createTwentyCueSessionStore().load(), null);
  const resumed = prepareActiveRecallSession(lessons, normalStore.load(), undefined, 'sequential-category-order');
  assert.equal(resumed.session.currentIndex, 43);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.queue.length, 85);
  assert.equal(writes, 0);
  assert.equal(lessonMediaPath('basic-delivery', 'lesson.mp3'), 'lessons/basic-delivery/lesson.mp3');
  assert.equal(japaneseCueMp3Path('basic-delivery', 0), 'diagnostics/japanese-cues/basic-delivery/phrase-001.mp3');
});

test('published fixture has exact text, 20 decodable Japanese MP3s and verified final English boundaries', () => {
  const root = 'web/public/diagnostics/20-cue-background-test';
  const metadata = JSON.parse(readFileSync(`${root}/metadata.json`, 'utf8'));
  const lesson = readFileSync(`${root}/english/lesson.mp3`);
  assert.equal(createHash('sha256').update(lesson).digest('hex'), metadata.lessonSha256);
  assert.equal(metadata.phrases.length, 20);
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', `${root}/english/lesson.mp3`, '-ar', '24000', '-ac', '1', '-f', 's16le', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
  assert.equal(decoded.status, 0);
  assert.equal(decoded.stdout.length / 2, metadata.totalSamples);
  for (const [index, phrase] of metadata.phrases.entries()) {
    assert.equal(phrase.index, index);
    assert.equal(phrase.phraseId, `${diagnosticLesson.id}:${index}`);
    assert.equal(phrase.en, diagnosticLesson.phrases[index]!.en);
    assert.equal(phrase.ja, diagnosticLesson.phrases[index]!.ja);
    assert.equal(phrase.start, phrase.startSample / metadata.sampleRate);
    assert.equal(phrase.end, phrase.endSample / metadata.sampleRate);
    assert.ok(phrase.start < phrase.end && phrase.end < metadata.duration);
    assert.ok(phrase.correlation >= 0.98);
    const next = metadata.phrases[index + 1];
    if (next) assert.ok(next.start > phrase.end + 0.5);
    const japanese = spawnSync('ffmpeg', ['-v', 'error', '-i', `web/public/${phrase.japanesePath}`, '-f', 'null', '-']);
    assert.equal(japanese.status, 0, `Japanese cue ${index + 1} decodes`);
  }
});
