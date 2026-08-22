import { loadEnvFile } from 'node:process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import OpenAI from 'openai';

loadEnvFile('.env');

const outputPath = 'input/phrases.txt';
const scenarioOutputPath = 'input/scenario.txt';
const lessonArchiveDirectory = 'output/lessons';
const recentLessonLimit = 3;

async function loadRecentScenarios(): Promise<string[]> {
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

    const recentScenarios: string[] = [];

    for (const directory of lessonDirectories) {
      const scenarioPath = `${lessonArchiveDirectory}/${directory}/scenario.txt`;

      try {
        const scenario = (await readFile(scenarioPath, 'utf8')).trim();

        if (scenario.length > 0) {
          recentScenarios.push(scenario);
        }
      } catch {
        // Skip archive directories without a readable scenario.txt.
      }
    }

    return recentScenarios;
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const client = new OpenAI();
  const recentScenarios = await loadRecentScenarios();

  console.log(
    `Generating English practice phrases with ${recentScenarios.length} recent scenario(s) of context...`,
  );

  const recentScenarioContext =
    recentScenarios.length > 0
      ? [
          'Recent scenarios:',
          ...recentScenarios.map(
            (scenario, index) => `${index + 1}. ${scenario}`,
          ),
          '',
          'Choose a meaningfully different delivery situation from all of these recent scenarios.',
        ].join('\n')
      : 'There are no recent scenarios yet.';

  const prompt = [
    'Generate exactly 5 English sentences for today.',
    'Focus on one realistic Uber Eats delivery situation.',
    'Avoid repeating the same main situation or closely similar phrases from recent scenarios.',
    'Return exactly 6 lines.',
    'Line 1 must be a short English scenario label.',
    'Lines 2 through 6 must be exactly 5 English practice sentences.',
    'Do not number them. Do not add explanations, translations, headings, or bullet points.',
    '',
    recentScenarioContext,
  ].join('\n');

  const response = await client.responses.create({
    model: 'gpt-5.6',
    instructions:
      'You create practical English practice material for a Japanese Uber Eats delivery rider. ' +
      'Use natural spoken English that could realistically be used during delivery. ' +
      'Keep each sentence short enough for listen-and-repeat practice. ' +
      'Use straight ASCII apostrophes and quotation marks.',
    input: prompt,
  });

  const lines = response.output_text
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"'),
    )
    .filter((line) => line.length > 0);

  if (lines.length !== 6) {
    throw new Error(`Expected exactly 6 lines, but received ${lines.length}.`);
  }

  const [scenario, ...phrases] = lines;

  if (!scenario) {
    throw new Error('Scenario label was empty.');
  }

  if (phrases.length !== 5) {
    throw new Error(
      `Expected exactly 5 phrases, but received ${phrases.length}.`,
    );
  }

  await writeFile(scenarioOutputPath, `${scenario}\n`, 'utf8');
  await writeFile(outputPath, `${phrases.join('\n')}\n`, 'utf8');

  console.log(`Created ${scenarioOutputPath}`);
  console.log(`Created ${outputPath}`);
  console.log(`Scenario: ${scenario}`);

  phrases.forEach((phrase, index) => {
    console.log(`${index + 1}: ${phrase}`);
  });
}

main().catch((error: unknown) => {
  console.error('Failed to generate phrases:', error);
  process.exitCode = 1;
});
