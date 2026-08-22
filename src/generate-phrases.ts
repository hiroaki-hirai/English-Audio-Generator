import { loadEnvFile } from 'node:process';
import { writeFile } from 'node:fs/promises';
import OpenAI from 'openai';

loadEnvFile('.env');

const outputPath = 'input/phrases.txt';

async function main(): Promise<void> {
  const client = new OpenAI();

  console.log('Generating English practice phrases...');

  const response = await client.responses.create({
    model: 'gpt-5.6',
    instructions:
      'You create practical English practice material for a Japanese Uber Eats delivery rider. ' +
      'Use natural spoken English that could realistically be used during delivery. ' +
      'Keep each sentence short enough for listen-and-repeat practice.' +
      'Use straight ASCII apostrophes and quotation marks.',
    input:
      'Generate exactly 5 English sentences for today. ' +
      'Focus on one realistic Uber Eats delivery situation. ' +
      'Return only the 5 English sentences, one sentence per line. ' +
      'Do not number them. Do not add explanations, headings, translations, or bullet points.',
  });

  const phrases = response.output_text
    .split(/\r?\n/)
    .map((phrase) =>
      phrase
        .trim()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"'),
    )
    .filter((phrase) => phrase.length > 0);

  if (phrases.length !== 5) {
    throw new Error(
      `Expected exactly 5 phrases, but received ${phrases.length}.`,
    );
  }

  await writeFile(outputPath, `${phrases.join('\n')}\n`, 'utf8');

  console.log(`Created ${outputPath}`);

  phrases.forEach((phrase, index) => {
    console.log(`${index + 1}: ${phrase}`);
  });
}

main().catch((error: unknown) => {
  console.error('Failed to generate phrases:', error);
  process.exitCode = 1;
});
