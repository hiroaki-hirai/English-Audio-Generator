import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { spawn } from 'node:child_process';

const silenceSeconds = 5;
const inputPath = 'input/phrases.txt';
const outputDirectory = 'output';
const silencePath = `${outputDirectory}/silence-${silenceSeconds}s.mp3`;
const lessonPath = `${outputDirectory}/lesson.mp3`;
const lessonTextPath = `${outputDirectory}/lesson.txt`;
const lessonArchiveDirectory = `${outputDirectory}/lessons`;
const concatListPath = `${outputDirectory}/concat-list.txt`;
const scenarioPath = 'input/scenario.txt';
const translationPath = 'input/translations.txt';
const lessonJapaneseTextPath = `${outputDirectory}/lesson-ja.txt`;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', args, {
      stdio: 'inherit',
    });

    process.on('error', reject);

    process.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

async function loadPhrases(): Promise<string[]> {
  const content = await readFile(inputPath, 'utf8');

  return content
    .split(/\r?\n/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);
}

async function getNextLessonDirectory(
  datedLessonDirectory: string,
): Promise<string> {
  const entries = await readdir(datedLessonDirectory, {
    withFileTypes: true,
  });

  const existingNumbers = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => Number(entry.name))
    .filter((number) => Number.isInteger(number) && number > 0);

  const nextNumber =
    existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

  const sequence = String(nextNumber).padStart(2, '0');

  return `${datedLessonDirectory}/${sequence}`;
}

async function main(): Promise<void> {
  const phrases = await loadPhrases();
  const scenario = (await readFile(scenarioPath, 'utf8')).trim();
  const translations = (await readFile(translationPath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (translations.length !== 6) {
    throw new Error(
      `Expected exactly 6 translations in ${translationPath}, but received ${translations.length}.`,
    );
  }

  const [scenarioTranslation, ...phraseTranslations] = translations;

  if (!scenarioTranslation) {
    throw new Error(`No scenario translation found in ${translationPath}`);
  }

  const lessonJapaneseText = [
    `Scenario: ${scenario}`,
    `シチュエーション: ${scenarioTranslation}`,
    '',
    ...phrases.flatMap((phrase, index) => [
      `${String(index + 1).padStart(2, '0')}. ${phrase}`,
      `    ${phraseTranslations[index]}`,
      '',
    ]),
  ].join('\n');

  await writeFile(lessonJapaneseTextPath, lessonJapaneseText, 'utf8');

  console.log(`Created ${lessonJapaneseTextPath}`);

  if (!scenario) {
    throw new Error(`No scenario found in ${scenarioPath}`);
  }

  if (phrases.length === 0) {
    throw new Error(`No phrases found in ${inputPath}`);
  }

  const now = new Date();

  const dateStamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  const datedLessonDirectory = `${lessonArchiveDirectory}/${dateStamp}`;

  await mkdir(outputDirectory, { recursive: true });
  await mkdir(datedLessonDirectory, { recursive: true });

  const lessonArchivePath = await getNextLessonDirectory(datedLessonDirectory);

  const lessonText = [
    'English Audio Lesson',
    '',
    ...phrases.map(
      (phrase, index) => `${String(index + 1).padStart(2, '0')}. ${phrase}`,
    ),
    '',
  ].join('\n');

  await writeFile(lessonTextPath, lessonText, 'utf8');

  console.log(`Created ${lessonTextPath}`);

  const phrasePaths = phrases.map(
    (_, index) =>
      `${outputDirectory}/phrase-${String(index + 1).padStart(3, '0')}.mp3`,
  );

  for (const phrasePath of phrasePaths) {
    await access(phrasePath);
  }

  console.log(`Found ${phrases.length} phrases.`);
  console.log(`Creating ${silenceSeconds} seconds of silence...`);

  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=24000:cl=mono',
    '-t',
    String(silenceSeconds),
    '-q:a',
    '9',
    silencePath,
  ]);

  const concatEntries: string[] = [];

  phrasePaths.forEach((phrasePath, index) => {
    const phraseFile = phrasePath.replace('output/', '');
    const silenceFile = silencePath.replace('output/', '');

    concatEntries.push(`file '${phraseFile}'`);
    concatEntries.push(`file '${silenceFile}'`);
    concatEntries.push(`file '${phraseFile}'`);

    if (index < phrasePaths.length - 1) {
      concatEntries.push(`file '${silenceFile}'`);
    }
  });

  await writeFile(concatListPath, `${concatEntries.join('\n')}\n`, 'utf8');

  console.log('Building lesson audio...');

  await runFfmpeg([
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatListPath,
    '-af',
    'loudnorm=I=-16:LRA=7:TP=-1.5',
    '-ar',
    '24000',
    '-c:a',
    'libmp3lame',
    lessonPath,
  ]);

  console.log(`Created ${lessonPath}`);

  await mkdir(lessonArchivePath, { recursive: true });

  const archivedLessonPath = `${lessonArchivePath}/lesson.mp3`;
  const archivedLessonTextPath = `${lessonArchivePath}/lesson.txt`;
  const archivedLessonJapaneseTextPath = `${lessonArchivePath}/lesson-ja.txt`;
  const archivedScenarioPath = `${lessonArchivePath}/scenario.txt`;

  await copyFile(lessonPath, archivedLessonPath);
  await copyFile(lessonTextPath, archivedLessonTextPath);
  await copyFile(lessonJapaneseTextPath, archivedLessonJapaneseTextPath);
  await copyFile(scenarioPath, archivedScenarioPath);

  console.log(`Archived lesson to ${lessonArchivePath}`);
}

main().catch((error: unknown) => {
  console.error('Failed to build lesson:', error);
  process.exitCode = 1;
});
