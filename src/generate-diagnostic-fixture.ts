import { loadEnvFile } from 'node:process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import OpenAI from 'openai';
import { verifyDiagnosticAudio } from './verify-diagnostic-audio.js';
import { diagnosticLesson, diagnosticRoot, diagnosticJapanesePath } from '../web/src/diagnostic-fixture.js';

const sampleRate = 24000;
const silenceSeconds = 5;
const publicRoot = `web/public/${diagnosticRoot}`;
const workRoot = 'output/20-cue-background-test';

function ffmpeg(args: string[], input?: Buffer): Buffer {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
    input, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr.toString()}`);
  return result.stdout;
}

async function main(): Promise<void> {
  for (const file of [`${publicRoot}/english/lesson.mp3`, `${publicRoot}/metadata.json`]) {
    try { await access(file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`Final diagnostic already exists; refusing to overwrite ${file}`);
  }
  try { loadEnvFile('.env'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const client = new OpenAI({ maxRetries: 0 });
  await mkdir(`${publicRoot}/japanese`, { recursive: true });
  await mkdir(`${publicRoot}/english`, { recursive: true });
  await mkdir(workRoot, { recursive: true });
  const parts: Buffer[] = [];
  const phrases = [];
  let samples = 0;
  const silence = Buffer.alloc(sampleRate * silenceSeconds * 2);
  for (const [index, phrase] of diagnosticLesson.phrases.entries()) {
    const japanesePath = `web/public/${diagnosticJapanesePath(index)}`;
    const englishPath = `${workRoot}/phrase-${String(index + 1).padStart(3, '0')}.mp3`;
    for (const [path, text, instructions] of [
      [japanesePath, phrase.ja, 'Read the Japanese text clearly and naturally in Japanese. Do not translate it.'],
      [englishPath, phrase.en, 'Speak clearly and naturally for an English learner.'],
    ]) {
      try { await access(path!); continue; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const response = await client.audio.speech.create({
        model: 'gpt-4o-mini-tts', voice: 'cedar', input: text!,
        instructions: instructions!, response_format: 'mp3',
      });
      await writeFile(path!, Buffer.from(await response.arrayBuffer()));
      console.log(`Created ${path}`);
    }
    // Decode the actual generated phrase, removing MP3 encoder delay/padding.
    const pcm = ffmpeg(['-i', englishPath, '-ar', String(sampleRate), '-ac', '1', '-f', 's16le', 'pipe:1']);
    if (!pcm.length || pcm.length % 2) throw new Error(`Invalid PCM for cue ${index + 1}`);
    const durationSamples = pcm.length / 2;
    phrases.push({
      index, phraseId: `${diagnosticLesson.id}:${index}`, en: phrase.en, ja: phrase.ja,
      start: samples / sampleRate, end: (samples + durationSamples) / sampleRate,
      startSample: samples, endSample: samples + durationSamples,
      japanesePath: diagnosticJapanesePath(index),
    });
    parts.push(pcm, silence, pcm);
    samples += durationSamples * 2 + sampleRate * silenceSeconds;
    if (index + 1 < diagnosticLesson.phrases.length) {
      parts.push(silence);
      samples += sampleRate * silenceSeconds;
    }
  }
  // Same repeat/silence structure, loudness filter, MP3 codec and rate as lesson build.
  ffmpeg(['-y', '-f', 's16le', '-ar', String(sampleRate), '-ac', '1', '-i', 'pipe:0',
    '-af', 'loudnorm=I=-16:LRA=7:TP=-1.5', '-ar', String(sampleRate),
    '-c:a', 'libmp3lame', `${publicRoot}/english/lesson.mp3`], Buffer.concat(parts));
  const decoded = ffmpeg(['-i', `${publicRoot}/english/lesson.mp3`, '-ar', String(sampleRate), '-ac', '1', '-f', 's16le', 'pipe:1']);
  if (decoded.length / 2 !== samples) throw new Error('Final lesson sample count differs from metadata.');
  await writeFile(`${publicRoot}/metadata.json`, JSON.stringify({
    fixtureId: diagnosticLesson.id, model: 'gpt-4o-mini-tts', voice: 'cedar',
    sampleRate, silenceSeconds, totalSamples: samples, duration: samples / sampleRate,
    englishPath: `${diagnosticRoot}/english/lesson.mp3`, phrases,
  }, null, 2) + '\n');
  console.log(`Verified ${phrases.length} cues; lesson duration ${samples / sampleRate}s`);
  await verifyDiagnosticAudio();
}

main().catch((error: unknown) => {
  console.error('Diagnostic fixture generation failed:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
