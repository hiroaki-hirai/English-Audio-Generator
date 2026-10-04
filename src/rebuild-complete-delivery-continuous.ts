import { readFile, mkdir } from 'node:fs/promises';
import { canonicalCompleteDeliverySource, completeDeliveryRoot, decodeAudio, continuousPcm, audioCommand,
  type CompleteDeliveryMetadata } from './complete-delivery-assets.js';
import { sha256 } from './training-japanese-assets.js';
import { continuousTrainingConfig, calculateTrainingAudioSourceHash } from './continuous-training.js';

// Rebuild to a review directory. Never overwrite the published lesson.
// Requires only committed normal source/assets, not diagnostic or temporary TTS inputs.
const source = canonicalCompleteDeliverySource(await readFile('training-scripts/complete-delivery.json'));
const metadata: CompleteDeliveryMetadata = JSON.parse(await readFile(`${completeDeliveryRoot}/metadata.json`, 'utf8'));
const provenance = JSON.parse(await readFile(`${completeDeliveryRoot}/audio-provenance.json`, 'utf8'));
const lesson = await readFile(`${completeDeliveryRoot}/lesson.mp3`);
if (sha256(lesson) !== metadata.lessonSha256 || sha256(source) !== provenance.sourceSha256
  || calculateTrainingAudioSourceHash(source) !== provenance.sourceHash
  || JSON.stringify(continuousTrainingConfig) !== JSON.stringify(provenance.continuous.config)) {
  throw new Error('Normal source/assets have changed; refusing reconstruction.');
}
const input = continuousPcm(decodeAudio(`${completeDeliveryRoot}/lesson.mp3`), metadata);
if (sha256(input.pcm) !== provenance.continuous.inputPcmSha256) throw new Error('Measured source segments have changed.');
await mkdir('output/complete-delivery-rebuilt', { recursive: true });
const destination = 'output/complete-delivery-rebuilt/continuous-training.mp3';
const loudness = continuousTrainingConfig.loudnessNormalization;
audioCommand(['-n', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0',
  '-af', `loudnorm=I=${loudness.integratedLoudness}:LRA=${loudness.loudnessRange}:TP=${loudness.truePeak}`,
  '-ar', '24000', '-c:a', continuousTrainingConfig.codec, destination], input.pcm);
console.log(JSON.stringify({ destination, audioSha256: sha256(await readFile(destination)),
  totalSamples: decodeAudio(destination).length / 2 }));
