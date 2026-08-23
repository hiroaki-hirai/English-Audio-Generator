import { readFile, writeFile } from 'node:fs/promises';

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
  const scriptId = process.argv[2];

  if (!scriptId) {
    throw new Error(
      'Script ID is required. Example: npm run prepare:script -- basic-delivery',
    );
  }

  const scriptPath = `training-scripts/${scriptId}.json`;

  console.log(`Loading training script: ${scriptPath}`);

  const content = await readFile(scriptPath, 'utf8');
  const script = JSON.parse(content) as TrainingScript;

  if (!script.id || !script.scenario || !script.scenarioJa) {
    throw new Error(
      'Training script must contain id, scenario, and scenarioJa.',
    );
  }

  if (!Array.isArray(script.phrases) || script.phrases.length === 0) {
    throw new Error('Training script must contain at least one phrase.');
  }

  for (const [index, phrase] of script.phrases.entries()) {
    if (!phrase.en?.trim()) {
      throw new Error(`Phrase ${index + 1} has no English text.`);
    }

    if (!phrase.ja?.trim()) {
      throw new Error(`Phrase ${index + 1} has no Japanese translation.`);
    }
  }

  const englishPhrases = script.phrases.map((phrase) => phrase.en.trim());

  const translations = [
    script.scenarioJa.trim(),
    ...script.phrases.map((phrase) => phrase.ja.trim()),
  ];

  await writeFile('input/scenario.txt', `${script.scenario.trim()}\n`, 'utf8');

  await writeFile(
    'input/phrases.txt',
    `${englishPhrases.join('\n')}\n`,
    'utf8',
  );

  await writeFile(
    'input/translations.txt',
    `${translations.join('\n')}\n`,
    'utf8',
  );

  console.log(`Prepared training script: ${script.scenario}`);

  englishPhrases.forEach((phrase, index) => {
    console.log(`${index + 1}: ${phrase}`);
  });
}

main().catch((error: unknown) => {
  console.error('Failed to prepare training script:', error);
  process.exitCode = 1;
});
