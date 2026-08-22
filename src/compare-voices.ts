import { loadEnvFile } from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import OpenAI from 'openai';

loadEnvFile('.env');

const testPhrase = 'Could you show me your order screen, please?';

const voices = ['coral', 'marin', 'cedar'] as const;

const instructions =
  'Speak in a warm, natural, conversational tone. ' +
  'Use clear pronunciation and moderate pacing for an English learner. ' +
  'Avoid sounding like a formal narrator.';

async function main(): Promise<void> {
  const client = new OpenAI();

  await mkdir('output', { recursive: true });

  for (const voice of voices) {
    console.log(`Generating voice test: ${voice}`);

    const response = await client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice,
      input: testPhrase,
      instructions,
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const outputPath = `output/voice-test-${voice}.mp3`;

    await writeFile(outputPath, audioBuffer);

    console.log(`Created ${outputPath}`);
  }

  console.log('Finished generating voice comparison files.');
}

main().catch((error: unknown) => {
  console.error('Failed to compare voices:', error);
  process.exitCode = 1;
});
