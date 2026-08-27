import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateTrainingAudioSourceHash,
  continuousTrainingConfig,
} from './continuous-training.js';

test('training audio source hash is stable for unchanged inputs', () => {
  const script = Buffer.from('{"id":"lesson","phrases":[{"en":"Hello"}]}');

  assert.equal(
    calculateTrainingAudioSourceHash(script),
    calculateTrainingAudioSourceHash(script),
  );
});

test('training audio source hash changes with ordered phrase input', () => {
  const first = Buffer.from('{"phrases":["Hello","Goodbye"]}');
  const reordered = Buffer.from('{"phrases":["Goodbye","Hello"]}');

  assert.notEqual(
    calculateTrainingAudioSourceHash(first),
    calculateTrainingAudioSourceHash(reordered),
  );
});

test('training audio source hash includes every audio build parameter', () => {
  const script = Buffer.from('{"phrases":["Hello"]}');
  const currentHash = calculateTrainingAudioSourceHash(script);
  const changedTiming = {
    ...continuousTrainingConfig,
    repetitionIntervalSeconds: 2,
  };

  assert.notEqual(
    currentHash,
    calculateTrainingAudioSourceHash(script, changedTiming),
  );
});
