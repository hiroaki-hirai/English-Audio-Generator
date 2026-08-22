import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const silenceSeconds = 5;
const inputPath = 'input/phrases.txt';
const outputDirectory = 'output';
const silencePath = `${outputDirectory}/silence-${silenceSeconds}s.mp3`;
const lessonPath = `${outputDirectory}/lesson.mp3`;
const lessonTextPath = `${outputDirectory}/lesson.txt`;
const concatListPath = `${outputDirectory}/concat-list.txt`;

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

async function main(): Promise<void> {
  const phrases = await loadPhrases();

  if (phrases.length === 0) {
    throw new Error(`No phrases found in ${inputPath}`);
  }

  await mkdir(outputDirectory, { recursive: true });

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
    '-c:a',
    'libmp3lame',
    lessonPath,
  ]);

  console.log(`Created ${lessonPath}`);
}

main().catch((error: unknown) => {
  console.error('Failed to build lesson:', error);
  process.exitCode = 1;
});
