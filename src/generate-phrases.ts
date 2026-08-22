import { loadEnvFile } from 'node:process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import OpenAI from 'openai';

loadEnvFile('.env');

const outputPath = 'input/phrases.txt';
const lessonArchiveDirectory = 'output/lessons';
const recentLessonLimit = 3;

async function loadRecentLessons(): Promise<string[]> {
  try {
    const entries = await readdir(lessonArchiveDirectory, {
      withFileTypes: true,
    });

    const lessonDirectories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .slice(0, recentLessonLimit);

    const recentLessons: string[] = [];

    for (const directory of lessonDirectories) {
      const lessonTextPath = `${lessonArchiveDirectory}/${directory}/lesson.txt`;

      try {
        const content = await readFile(lessonTextPath, 'utf8');
        recentLessons.push(content.trim());
      } catch {
        // Skip archive directories without a readable lesson.txt.
      }
    }

    return recentLessons;
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const client = new OpenAI();
  const recentLessons = await loadRecentLessons();

  console.log(
    `Generating English practice phrases with ${recentLessons.length} recent lesson(s) of context...`,
  );

  const recentLessonContext =
    recentLessons.length > 0
      ? [
          'Recent lessons:',
          '',
          ...recentLessons.map(
            (lesson, index) => `Lesson ${index + 1}:\n${lesson}`,
          ),
          '',
          'Choose a meaningfully different delivery situation from these recent lessons.',
        ].join('\n')
      : 'There are no recent lessons yet.';

  const prompt = [
    'Generate exactly 5 English sentences for today.',
    'Focus on one realistic Uber Eats delivery situation.',
    'Avoid repeating the same main situation or closely similar phrases from recent lessons.',
    'Return only the 5 English sentences, one sentence per line.',
    'Do not number them. Do not add explanations, headings, translations, or bullet points.',
    '',
    recentLessonContext,
  ].join('\n');

  const response = await client.responses.create({
    model: 'gpt-5.6',
    instructions:
      'You create practical English practice material for a Japanese Uber Eats delivery rider. ' +
      'Use natural spoken English that could realistically be used during delivery. ' +
      'Keep each sentence short enough for listen-and-repeat practice.' +
      'Use straight ASCII apostrophes and quotation marks.',
    input: prompt,
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
