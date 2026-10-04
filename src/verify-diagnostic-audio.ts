import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { diagnosticRoot, diagnosticCueCount } from '../web/src/diagnostic-fixture.js';

function decode(path: string): Buffer {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-ar', '24000', '-ac', '1', '-f', 's16le', 'pipe:1'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Decode failed: ${path}`);
  return result.stdout;
}

export async function verifyDiagnosticAudio(): Promise<void> {
  const root = `web/public/${diagnosticRoot}`;
  const metadataPath = `${root}/metadata.json`;
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
    totalSamples: number;
    phrases: Array<{ index: number; startSample: number; endSample: number; start: number; end: number; japanesePath: string; correlation?: number }>;
    lessonSha256?: string; boundaryMethod?: string;
  };
  const lessonPath = `${root}/english/lesson.mp3`;
  const final = decode(lessonPath);
  const sourcePcm = metadata.phrases.map(phrase => decode(`output/20-cue-background-test/phrase-${String(phrase.index + 1).padStart(3, '0')}.mp3`));
  const silence = Buffer.alloc(24000 * 5 * 2);
  const parts = sourcePcm.flatMap((pcm, index) => index + 1 < sourcePcm.length ? [pcm, silence, pcm, silence] : [pcm, silence, pcm]);
  // Compare against the same normalized waveform, so loudness changes cannot obscure alignment.
  const normalized = spawnSync('ffmpeg', ['-v', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0',
    '-af', 'loudnorm=I=-16:LRA=7:TP=-1.5', '-ar', '24000', '-f', 's16le', 'pipe:1'], {
    input: Buffer.concat(parts), maxBuffer: 64 * 1024 * 1024,
  });
  if (normalized.error) throw normalized.error;
  if (normalized.status !== 0 || normalized.stdout.length !== final.length) throw new Error('Normalized reference length mismatch.');
  if (final.length / 2 !== metadata.totalSamples || metadata.phrases.length !== diagnosticCueCount) {
    throw new Error('Final lesson sample count or cue count mismatch.');
  }
  for (const phrase of metadata.phrases) {
    const number = String(phrase.index + 1).padStart(3, '0');
    const source = sourcePcm[phrase.index]!;
    if (phrase.start !== phrase.startSample / 24000 || phrase.end !== phrase.endSample / 24000
      || source.length / 2 !== phrase.endSample - phrase.startSample) throw new Error(`Boundary mismatch for cue ${number}`);
    let dot = 0, sourceEnergy = 0, finalEnergy = 0;
    for (let offset = 0; offset < source.length; offset += 2) {
      const a = normalized.stdout.readInt16LE(phrase.startSample * 2 + offset);
      const b = final.readInt16LE(phrase.startSample * 2 + offset);
      dot += a * b; sourceEnergy += a * a; finalEnergy += b * b;
    }
    const correlation = dot / Math.sqrt(sourceEnergy * finalEnergy);
    if (!Number.isFinite(correlation) || correlation < 0.98) throw new Error(`Final MP3 alignment failed for cue ${number}: ${correlation}`);
    phrase.correlation = correlation;
    if (decode(`web/public/${phrase.japanesePath}`).length === 0) throw new Error(`Empty Japanese cue ${number}`);
    console.log(`Cue ${number}: ${phrase.start}s–${phrase.end}s; final MP3 correlation=${correlation.toFixed(6)}; Japanese decode OK`);
  }
  metadata.lessonSha256 = createHash('sha256').update(await readFile(lessonPath)).digest('hex');
  metadata.boundaryMethod = 'Decoded generated source PCM sample boundaries, verified against final lesson MP3 decoded sample count and each segment waveform correlation >= 0.98. No estimated timings.';
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
}
