import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { trainingJapaneseCueMp3Path } from '../web/src/training-japanese-cue.js';

export const japaneseGenerationConfig = {
  model: 'gpt-4o-mini-tts', voice: 'cedar', responseFormat: 'mp3',
  instructions: 'Read the Japanese text clearly and naturally in Japanese. Do not translate it.',
  loudnessNormalization: 'none', sampleRate: 24000, channels: 1,
} as const;
export const japaneseManifestPath = 'web/public/japanese-cue-manifest.json';
export type JapaneseAsset = {
  phraseId: string; lessonId: string; phraseIndex: number; ja: string; path: string;
};
export type JapaneseAssetEntry = JapaneseAsset & {
  config: typeof japaneseGenerationConfig; sourceHash: string; audioSha256: string;
  duration: number; format: { codec: string; sampleRate: number; channels: number };
};
export type JapaneseManifest = { version: 1; entries: JapaneseAssetEntry[] };

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
export function sourceHash(asset: JapaneseAsset): string {
  return sha256(JSON.stringify({ ...asset, config: japaneseGenerationConfig }));
}
export async function expectedJapaneseAssets(): Promise<JapaneseAsset[]> {
  const files = (await readdir('training-scripts')).filter(file => file.endsWith('.json')).sort();
  const entries: JapaneseAsset[] = [];
  for (const file of files) {
    const lesson = JSON.parse(await readFile(`training-scripts/${file}`, 'utf8')) as {
      id: string; phrases: Array<{ ja: string }>;
    };
    for (const [phraseIndex, phrase] of lesson.phrases.entries()) {
      if (typeof phrase.ja !== 'string' || !phrase.ja.trim()) throw new Error(`Missing Japanese: ${lesson.id}:${phraseIndex}`);
      entries.push({ phraseId: `${lesson.id}:${phraseIndex}`, lessonId: lesson.id, phraseIndex,
        ja: phrase.ja, path: trainingJapaneseCueMp3Path(lesson.id, phraseIndex) });
    }
  }
  if (entries.length === 0 || new Set(entries.map(entry => entry.phraseId)).size !== entries.length
    || new Set(entries.map(entry => entry.path)).size !== entries.length) throw new Error('Expected unique Japanese cue mappings.');
  return entries;
}
export function inspectJapaneseAudio(path: string): Pick<JapaneseAssetEntry, 'duration' | 'format'> {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries',
    'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', path], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffprobe failed: ${path}`);
  const probe = JSON.parse(result.stdout);
  const stream = probe.streams[0];
  const duration = Number(probe.format.duration);
  const format = { codec: stream?.codec_name as string, sampleRate: Number(stream?.sample_rate), channels: Number(stream?.channels) };
  if (probe.streams.length !== 1 || format.codec !== 'mp3' || format.sampleRate !== 24000 || format.channels !== 1
    || !Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid MP3 format: ${path}`);
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', path, '-f', 'null', '-']);
  if (decoded.error) throw decoded.error;
  if (decoded.status !== 0) throw new Error(`Decode failed: ${path}`);
  return { duration, format };
}
export async function verifyTrainingJapaneseAssets(): Promise<{ files: number; missing: number; extra: number; duplicateIds: number; mismatches: number }> {
  const expected = await expectedJapaneseAssets();
  const manifest = JSON.parse(await readFile(japaneseManifestPath, 'utf8')) as JapaneseManifest;
  if (manifest.version !== 1 || manifest.entries.length !== expected.length || new Set(manifest.entries.map(entry => entry.phraseId)).size !== expected.length) {
    throw new Error('Invalid Japanese manifest size or duplicate phrase IDs.');
  }
  const files: string[] = [];
  for (const lesson of await readdir('web/public/lessons')) {
    const directory = `web/public/lessons/${lesson}/japanese-cues`;
    let names: string[];
    try { names = await readdir(directory, { recursive: true }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    for (const name of names) if ((await stat(`${directory}/${name}`)).isFile()) files.push(`lessons/${lesson}/japanese-cues/${name.replaceAll('\\', '/')}`);
  }
  const expectedPaths = new Set(expected.map(entry => entry.path));
  if (files.length !== expected.length || files.some(path => !expectedPaths.has(path))) throw new Error('Missing or unexpected Japanese asset files.');
  for (const asset of expected) {
    const entry = manifest.entries.find(entry => entry.phraseId === asset.phraseId);
    if (!entry || Object.entries(asset).some(([key, value]) => entry[key as keyof JapaneseAsset] !== value)
      || entry.sourceHash !== sourceHash(asset) || JSON.stringify(entry.config) !== JSON.stringify(japaneseGenerationConfig)) {
      throw new Error(`Source/mapping mismatch: ${asset.phraseId}`);
    }
    const path = `web/public/${asset.path}`;
    if (sha256(await readFile(path)) !== entry.audioSha256) throw new Error(`Audio hash mismatch: ${asset.phraseId}`);
    const actual = inspectJapaneseAudio(path);
    if (actual.duration !== entry.duration || JSON.stringify(actual.format) !== JSON.stringify(entry.format)) {
      throw new Error(`Audio metadata mismatch: ${asset.phraseId}`);
    }
  }
  return { files: files.length, missing: 0, extra: 0, duplicateIds: 0, mismatches: 0 };
}
