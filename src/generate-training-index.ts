import { resolveTrainingScriptDomain } from './training-script-domain.js';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';

type TrainingPhrase = {
  en: string;
  ja: string;
};

type TrainingScript = {
  id: string;
  domain: 'delivery' | 'everyday' | 'etcl';
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

    if (
      lesson.domain !== 'delivery' &&
      lesson.domain !== 'everyday' &&
      lesson.domain !== 'etcl'
    ) {
      throw new Error(
        `Training script ${fileName} must contain a valid domain.`,
      );
    }

    if (!Array.isArray(lesson.phrases) || lesson.phrases.length === 0) {
      throw new Error(
        `Training script ${fileName} must contain at least one phrase.`,
      );
    }

    if (lessons.some((existing) => existing.id === lesson.id)) {
      throw new Error(`Training script ${fileName} contains duplicate lesson id: ${lesson.id}.`);
    }

    lessons.push({
      ...lesson,
      domain: resolveTrainingScriptDomain(lesson.id, lesson.domain) as TrainingScript['domain'],
    });
  }

  const output = `${JSON.stringify(lessons, null, 2)}\n`;

  await writeFile('web/src/training-lessons.json', output, 'utf8');

  // Missing audio must not break Service Worker cache.addAll during installation.
  // Preserve the current Service Worker contract until cache migration is implemented.
  const trainingAssets = lessons
    .filter((lesson) => lesson.domain === 'delivery' || lesson.domain === 'everyday')
    .flatMap((lesson) => [
    `lessons/${lesson.id}/lesson.mp3`,
    `lessons/${lesson.id}/continuous-training.mp3`,
    `lessons/${lesson.id}/metadata.json`,
  ]).filter((path) => existsSync(`web/public/${path}`));

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
