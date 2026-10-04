import { loadEnvFile } from 'node:process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import OpenAI from 'openai';
import {
  expectedJapaneseAssets, japaneseGenerationConfig, japaneseManifestPath,
  inspectJapaneseAudio, sha256, sourceHash, verifyTrainingJapaneseAssets, type JapaneseManifest,
} from './training-japanese-assets.js';

async function main(): Promise<void> {
  try { loadEnvFile('.env'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let manifest: JapaneseManifest = { version: 1, entries: [] };
  try { manifest = JSON.parse(await readFile(japaneseManifestPath, 'utf8')); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const client = new OpenAI({ maxRetries: 0 });
  const expected = await expectedJapaneseAssets();
  for (const asset of expected) {
    const path = `web/public/${asset.path}`;
    const existing = manifest.entries.find(entry => entry.phraseId === asset.phraseId);
    let fileExists = true;
    try { await access(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      fileExists = false;
    }
    if (fileExists) {
      if (!existing || existing.sourceHash !== sourceHash(asset) || existing.audioSha256 !== sha256(await readFile(path))) {
        throw new Error(`Refusing to overwrite an unverified or stale file: ${path}`);
      }
      continue;
    }
    if (existing) throw new Error(`Manifest asset is missing: ${path}`);
    await mkdir(dirname(path), { recursive: true });
    const response = await client.audio.speech.create({
      model: japaneseGenerationConfig.model, voice: japaneseGenerationConfig.voice,
      input: asset.ja, instructions: japaneseGenerationConfig.instructions, response_format: 'mp3',
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes, { flag: 'wx' });
    manifest.entries.push({ ...asset, config: japaneseGenerationConfig,
      sourceHash: sourceHash(asset), audioSha256: sha256(bytes), ...inspectJapaneseAudio(path) });
    await writeFile(japaneseManifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Created ${asset.phraseId}: ${path} (${manifest.entries.length}/${expected.length})`);
  }
  console.log(JSON.stringify(await verifyTrainingJapaneseAssets()));
}
main().catch((error: unknown) => {
  console.error('Training Japanese generation failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
