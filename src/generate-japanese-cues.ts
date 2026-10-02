import { loadEnvFile } from 'node:process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import OpenAI from 'openai';
import { japaneseCueMp3Path } from '../web/src/japanese-cue.js';

// Deliberately separate from the English lesson build: no input/output overwrite.
async function main(): Promise<void> {
  const lessonId = process.argv[2] ?? 'basic-delivery';
  const count = Number(process.argv[3] ?? '3');
  if (!/^[a-z0-9-]+$/.test(lessonId) || !Number.isInteger(count) || count < 1) {
    throw new Error('Usage: npx tsx src/generate-japanese-cues.ts [lesson-id] [count]');
  }
  const lesson = JSON.parse(await readFile(`training-scripts/${lessonId}.json`, 'utf8')) as {
    phrases: Array<{ ja: string }>;
  };
  if (count > lesson.phrases.length) throw new Error('Count exceeds lesson length.');
  try { loadEnvFile('.env'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const client = new OpenAI({ maxRetries: 0 });
  await mkdir(`web/public/diagnostics/japanese-cues/${lessonId}`, { recursive: true });
  for (const [index, phrase] of lesson.phrases.slice(0, count).entries()) {
    const path = `web/public/${japaneseCueMp3Path(lessonId, index)}`;
    try {
      await access(path);
      console.log(`Already exists: ${path}`);
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const response = await client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'cedar',
      input: phrase.ja,
      instructions: 'Read the Japanese text clearly and naturally in Japanese. Do not translate it.',
      response_format: 'mp3',
    });
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
    console.log(`Created ${path}`);
  }
}

main().catch((error: unknown) => {
  // Avoid printing request objects or credentials on API failure.
  console.error('Japanese cue generation failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
