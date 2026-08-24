import { readdir, readFile, writeFile } from 'node:fs/promises';

type TrainingPhrase = {
  en: string;
  ja: string;
};

type TrainingScript = {
  id: string;
  scenario: string;
  scenarioJa: string;
  phrases: TrainingPhrase[];
};

async function main(): Promise<void> {
  const directory = 'training-scripts';

  const fileNames = (await readdir(directory))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();

  if (fileNames.length === 0) {
    throw new Error('No training scripts were found.');
  }

  const lessons: TrainingScript[] = [];

  for (const fileName of fileNames) {
    const content = await readFile(`${directory}/${fileName}`, 'utf8');
    const lesson = JSON.parse(content) as TrainingScript;

    if (!lesson.id || !lesson.scenario || !lesson.scenarioJa) {
      throw new Error(
        `Training script ${fileName} must contain id, scenario, and scenarioJa.`,
      );
    }

    if (!Array.isArray(lesson.phrases) || lesson.phrases.length === 0) {
      throw new Error(
        `Training script ${fileName} must contain at least one phrase.`,
      );
    }

    lessons.push(lesson);
  }

  const output = `${JSON.stringify(lessons, null, 2)}\n`;

  await writeFile('web/src/training-lessons.json', output, 'utf8');

  const trainingAssets = lessons.flatMap((lesson) => [
    `lessons/${lesson.id}/lesson.mp3`,
    `lessons/${lesson.id}/metadata.json`,
  ]);

  const offlineAssetsOutput = [
    'self.EAG_TRAINING_AUDIO_ASSETS = [',
    ...trainingAssets.map((path) => `  ${JSON.stringify(path)},`),
    '];',
    '',
  ].join('\n');

  await writeFile(
    'web/public/training-audio-assets.js',
    offlineAssetsOutput,
    'utf8',
  );

  console.log(
    `Generated web/src/training-lessons.json with ${lessons.length} lessons.`,
  );

  console.log(
    `Generated web/public/training-audio-assets.js with ${trainingAssets.length} asset paths.`,
  );

  lessons.forEach((lesson, index) => {
    console.log(`${index + 1}: ${lesson.id}`);
  });
}

main().catch((error: unknown) => {
  console.error('Failed to generate training index:', error);
  process.exitCode = 1;
});
