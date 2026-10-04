import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { sha256 } from './training-japanese-assets.js';
import { continuousTrainingConfig, calculateTrainingAudioSourceHash } from './continuous-training.js';

// Match the repository representation regardless of Windows working-tree line endings.
export function canonicalCompleteDeliverySource(bytes: Uint8Array): Buffer {
  return Buffer.from(Buffer.from(bytes).toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}

export const completeDeliveryRoot = 'web/public/lessons/complete-delivery';
export const diagnosticAssetRoot = 'web/public/diagnostics/20-cue-background-test';
export type Segment = { index: number; phraseId: string; en: string; ja: string;
  start: number; end: number; startSample: number; endSample: number };
export type CompleteDeliveryMetadata = { lessonId: string; sampleRate: number; totalSamples: number;
  duration: number; lessonSha256: string; phrases: Segment[] };

export function audioCommand(args: string[], input?: Buffer): Buffer {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', ...args], {
    input, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr.toString()}`);
  return result.stdout;
}
export function decodeAudio(path: string): Buffer {
  return audioCommand(['-i', path, '-ar', '24000', '-ac', '1', '-f', 's16le', 'pipe:1']);
}
export function waveformCorrelation(a: Buffer, b: Buffer): number {
  if (!a.length || a.length !== b.length || a.length % 2) throw new Error('PCM length mismatch.');
  let dot = 0, aa = 0, bb = 0;
  for (let offset = 0; offset < a.length; offset += 2) {
    const x = a.readInt16LE(offset), y = b.readInt16LE(offset);
    dot += x * y; aa += x * x; bb += y * y;
  }
  return dot / Math.sqrt(aa * bb);
}

// Reconstruct from the completed normal lesson, not temporary TTS output.
export function continuousPcm(lesson: Buffer, metadata: CompleteDeliveryMetadata) {
  const config = continuousTrainingConfig;
  if (config.sampleRate !== metadata.sampleRate || config.repeatCount !== 2) {
    throw new Error('Unsupported Continuous Training source format.');
  }
  const parts: Buffer[] = [];
  const segments: Array<{ phraseIndex: number; repetition: number; startSample: number;
    endSample: number; silenceEndSample: number; sourcePcmSha256: string }> = [];
  let position = 0;
  for (const phrase of metadata.phrases) {
    const pcm = lesson.subarray(phrase.startSample * 2, phrase.endSample * 2);
    for (let repetition = 0; repetition < config.repeatCount; repetition += 1) {
      const silenceSeconds = repetition === 0 ? config.repetitionIntervalSeconds : config.recallIntervalSeconds;
      const endSample = position + pcm.length / 2;
      const silenceEndSample = endSample + metadata.sampleRate * silenceSeconds;
      segments.push({ phraseIndex: phrase.index, repetition, startSample: position, endSample,
        silenceEndSample, sourcePcmSha256: sha256(pcm) });
      parts.push(pcm, Buffer.alloc(metadata.sampleRate * silenceSeconds * 2));
      position = silenceEndSample;
    }
  }
  return { pcm: Buffer.concat(parts), segments, totalSamples: position };
}

export function normalizeContinuous(pcm: Buffer): Buffer {
  const loudness = continuousTrainingConfig.loudnessNormalization;
  return audioCommand(['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0',
    '-af', `loudnorm=I=${loudness.integratedLoudness}:LRA=${loudness.loudnessRange}:TP=${loudness.truePeak}`,
    '-ar', '24000', '-f', 's16le', 'pipe:1'], pcm);
}

export async function verifyCompleteDeliveryAssets() {
  const source = canonicalCompleteDeliverySource(await readFile('training-scripts/complete-delivery.json'));
  const lessonDefinition = JSON.parse(source.toString());
  const fixture = JSON.parse(await readFile('web/src/diagnostic-cues.json', 'utf8'));
  const diagnostic = JSON.parse(await readFile(`${diagnosticAssetRoot}/metadata.json`, 'utf8'));
  const metadata: CompleteDeliveryMetadata = JSON.parse(await readFile(`${completeDeliveryRoot}/metadata.json`, 'utf8'));
  const provenance = JSON.parse(await readFile(`${completeDeliveryRoot}/audio-provenance.json`, 'utf8'));
  if (lessonDefinition.id !== 'complete-delivery' || lessonDefinition.domain !== 'delivery'
    || lessonDefinition.scenario !== 'Complete Delivery' || lessonDefinition.scenarioJa !== '受け渡し総合'
    || JSON.stringify(lessonDefinition.phrases) !== JSON.stringify(fixture.phrases)
    || metadata.phrases.length !== 20 || metadata.lessonId !== lessonDefinition.id
    || metadata.sampleRate !== 24000 || metadata.totalSamples !== diagnostic.totalSamples
    || metadata.duration !== metadata.totalSamples / metadata.sampleRate
    || /diagnostic|fixtureId/.test(JSON.stringify(metadata))) throw new Error('Lesson/source/metadata mismatch.');
  const audio = await readFile(`${completeDeliveryRoot}/lesson.mp3`);
  const original = await readFile(`${diagnosticAssetRoot}/english/lesson.mp3`);
  if (!audio.equals(original) || sha256(audio) !== metadata.lessonSha256
    || sha256(original) !== diagnostic.lessonSha256) throw new Error('Copied English audio mismatch.');
  const decoded = decodeAudio(`${completeDeliveryRoot}/lesson.mp3`);
  if (decoded.length / 2 !== metadata.totalSamples) throw new Error('English decoded duration mismatch.');
  for (const [index, phrase] of metadata.phrases.entries()) {
    const expected = fixture.phrases[index], boundary = diagnostic.phrases[index];
    if (phrase.index !== index || phrase.phraseId !== `complete-delivery:${index}`
      || phrase.en !== expected.en || phrase.ja !== expected.ja
      || phrase.start !== phrase.startSample / 24000 || phrase.end !== phrase.endSample / 24000
      || phrase.startSample !== boundary.startSample || phrase.endSample !== boundary.endSample
      || !Number.isInteger(phrase.startSample) || !Number.isInteger(phrase.endSample)
      || phrase.startSample < 0 || phrase.endSample <= phrase.startSample || phrase.endSample > metadata.totalSamples
      || !(boundary.correlation >= 0.98)) throw new Error(`Invalid boundary: ${index}`);
    const blockEnd = phrase.endSample + (phrase.endSample - phrase.startSample) + 24000 * 5;
    const next = metadata.phrases[index + 1];
    if (next ? next.startSample !== blockEnd + 24000 * 5 : metadata.totalSamples !== blockEnd) {
      throw new Error(`English repetition/silence layout mismatch: ${index}`);
    }
  }
  const expectedCopies = ['lessons/complete-delivery/lesson.mp3', ...Array.from({ length: 20 }, (_, index) =>
    `lessons/complete-delivery/japanese-cues/phrase-${String(index + 1).padStart(3, '0')}.mp3`)];
  if (new Set(provenance.copies.map((entry: { destination: string }) => entry.destination)).size !== 21
    || expectedCopies.some(path => !provenance.copies.some((entry: { destination: string }) => entry.destination === path))
    || provenance.originalEnglishAudit.length !== 20
    || provenance.originalEnglishAudit.some((entry: { phraseIndex: number; correlation: number }, index: number) =>
      entry.phraseIndex !== index || !Number.isFinite(entry.correlation) || entry.correlation < 0.98)) {
    throw new Error('Incomplete copy/original-audio audit provenance.');
  }
  for (const entry of provenance.copies) {
    const copied = await readFile(`web/public/${entry.destination}`);
    const originalBytes = await readFile(`web/public/${entry.source}`);
    if (!copied.equals(originalBytes) || sha256(copied) !== entry.copiedSha256
      || sha256(originalBytes) !== entry.originalSha256) throw new Error(`Copy provenance mismatch: ${entry.destination}`);
  }
  if (provenance.copies.length !== 21 || provenance.sourceSha256 !== sha256(source)
    || provenance.diagnosticMetadataSha256 !== sha256((await readFile(`${diagnosticAssetRoot}/metadata.json`, 'utf8')).replace(/\r\n/g, '\n'))
    || provenance.sourceHash !== calculateTrainingAudioSourceHash(source)
    || (await readFile(`${completeDeliveryRoot}/source-hash.txt`, 'utf8')).trim() !== provenance.sourceHash) {
    throw new Error('Source hash/provenance mismatch.');
  }
  const expectedContinuous = continuousPcm(decoded, metadata);
  const continuous = await readFile(`${completeDeliveryRoot}/continuous-training.mp3`);
  const actualContinuous = decodeAudio(`${completeDeliveryRoot}/continuous-training.mp3`);
  const normalized = normalizeContinuous(expectedContinuous.pcm);
  if (actualContinuous.length !== expectedContinuous.pcm.length || normalized.length !== actualContinuous.length
    || provenance.continuous.audioSha256 !== sha256(continuous)
    || provenance.continuous.inputPcmSha256 !== sha256(expectedContinuous.pcm)
    || provenance.continuous.totalSamples !== expectedContinuous.totalSamples
    || JSON.stringify(provenance.continuous.config) !== JSON.stringify(continuousTrainingConfig)
    || JSON.stringify(provenance.continuous.segments) !== JSON.stringify(expectedContinuous.segments)) {
    throw new Error('Continuous Training structure/hash mismatch.');
  }
  let minCorrelation = 1;
  for (const segment of expectedContinuous.segments) {
    const start = segment.startSample * 2, end = segment.endSample * 2;
    const correlation = waveformCorrelation(normalized.subarray(start, end), actualContinuous.subarray(start, end));
    if (!Number.isFinite(correlation) || correlation < 0.98) throw new Error('Continuous phrase content mismatch.');
    minCorrelation = Math.min(minCorrelation, correlation);
    // Exclude encoder ringing at the speech boundary; verify the silence interior.
    const silence = actualContinuous.subarray(end + 2400 * 2, (segment.silenceEndSample - 2400) * 2);
    for (let offset = 0; offset < silence.length; offset += 2) {
      if (Math.abs(silence.readInt16LE(offset)) > 8) throw new Error('Continuous silence is not silent.');
    }
  }
  return { phrases: 20, copiedAssets: 21, englishDuration: metadata.duration,
    continuousDuration: expectedContinuous.totalSamples / 24000, continuousSegments: 40, minCorrelation };
}
