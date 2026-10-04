import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioTransitionDiagnostic } from '../web/src/audio-transition-diagnostic.js';

test('transition sequence preserves rejection-time state across cleanup and element changes', () => {
  const state = {
    time: 10, visibility: 'visible', isActive: false, hasBeenActive: true,
    readyState: 4, networkState: 1, paused: true, currentTime: 0,
    src: 'https://example.test/lesson.mp3', currentSrc: '', owner: 'active-recall',
    runtimeActive: true, queueIndex: 0, element: {}, errorCode: null, errorMessage: '',
  };
  const diagnostic = createAudioTransitionDiagnostic(() => state);
  diagnostic.record('japanese-mp3 ended', '', 'Japanese MP3');
  diagnostic.record('english play-request');
  const request = diagnostic.record('english play-call', '', 'English');
  diagnostic.record('english play-rejected', `request=${request}; NotAllowedError: Blocked`);
  state.owner = 'none';
  state.runtimeActive = false;
  state.element = {};
  diagnostic.record('english owner-cleared');
  const lines = diagnostic.lines();
  assert.match(lines[2]!, /previousPlayback":"Japanese MP3/);
  assert.match(lines[4]!, /NotAllowedError: Blocked/);
  assert.match(lines[4]!, /owner":"active-recall/);
  assert.match(lines[4]!, /runtimeActive":true/);
  assert.match(lines[4]!, /isActive":false/);
  assert.match(lines[4]!, /english-1/);
  assert.match(lines[5]!, /english-2/);
  assert.equal(state.currentTime, 0);
  diagnostic.reset();
  assert.equal(diagnostic.lines().length, 1);
});

test('missing activation, bounded events and broken sampling do not affect playback', () => {
  const diagnostic = createAudioTransitionDiagnostic(() => ({
    time: 0, visibility: 'hidden', isActive: undefined, hasBeenActive: undefined,
    readyState: 0, networkState: 0, paused: true, currentTime: 0,
    src: '', currentSrc: '', owner: 'none', runtimeActive: false,
    queueIndex: null, element: {}, errorCode: 4, errorMessage: 'Source unavailable',
  }));
  for (let index = 0; index < 110; index += 1) diagnostic.record('english error');
  assert.equal(diagnostic.lines().length, 101);
  assert.match(diagnostic.lines()[1]!, /isActive":"unavailable/);
  assert.match(diagnostic.lines()[1]!, /errorCode":4/);
  const broken = createAudioTransitionDiagnostic(() => { throw new Error('unavailable'); });
  assert.doesNotThrow(() => broken.record('english play-call'));
});
