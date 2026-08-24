import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';

const audioBuildVersion = '2';

async function loadLessonIds(): Promise<string[]> {
  const fileNames = (await readdir('training-scripts'))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();

  if (fileNames.length === 0) {
    throw new Error('No training scripts were found.');
  }

  return fileNames.map((fileName) => fileName.replace(/\.json$/, ''));
}

async function calculateSourceHash(lessonId: string): Promise<string> {
  const sourcePath = `training-scripts/${lessonId}.json`;
  const content = await readFile(sourcePath);

  return createHash('sha256')
    .update(audioBuildVersion)
    .update('\n')
    .update(content)
    .digest('hex');
}

async function readStoredHash(hashPath: string): Promise<string | null> {
  try {
    return (await readFile(hashPath, 'utf8')).trim();
  } catch {
    return null;
  }
}

const inputPaths = [
  'input/scenario.txt',
  'input/phrases.txt',
  'input/translations.txt',
];

function runNpm(args: string[]): void {
  const result =
    process.platform === 'win32'
      ? spawnSync(
          process.env.ComSpec ?? 'cmd.exe',
          ['/d', '/s', '/c', 'npm', ...args],
          {
            stdio: 'inherit',
          },
        )
      : spawnSync('npm', args, {
          stdio: 'inherit',
        });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `npm command failed with exit code ${result.status ?? 'unknown'}.`,
    );
  }
}

async function main(): Promise<void> {
  const lessonIds = await loadLessonIds();
  const originalInputs = new Map<string, string>();

  for (const inputPath of inputPaths) {
    originalInputs.set(inputPath, await readFile(inputPath, 'utf8'));
  }

  try {
    let builtCount = 0;
    let skippedCount = 0;

    for (const [index, lessonId] of lessonIds.entries()) {
      const destinationDirectory = `web/public/lessons/${lessonId}`;
      const destinationPath = `${destinationDirectory}/lesson.mp3`;
      const hashPath = `${destinationDirectory}/source-hash.txt`;

      const sourceHash = await calculateSourceHash(lessonId);
      const storedHash = await readStoredHash(hashPath);

      if (storedHash === sourceHash) {
        skippedCount += 1;

        console.log(
          `\nSkipping training lesson ${index + 1}/${lessonIds.length}: ${lessonId} (unchanged)`,
        );

        continue;
      }

      console.log(
        `\nBuilding training lesson ${index + 1}/${lessonIds.length}: ${lessonId}`,
      );

      runNpm(['run', 'lesson:script', '--', lessonId]);

      await mkdir(destinationDirectory, { recursive: true });

      const metadataDestinationPath = `${destinationDirectory}/metadata.json`;

      await copyFile('output/lesson.mp3', destinationPath);
      await copyFile('output/lesson-metadata.json', metadataDestinationPath);
      await writeFile(hashPath, `${sourceHash}\n`, 'utf8');

      builtCount += 1;

      console.log(`Copied lesson audio to ${destinationPath}`);
      console.log(`Copied lesson metadata to ${metadataDestinationPath}`);
      console.log(`Updated source hash at ${hashPath}`);
    }

    console.log(
      `\nTraining audio build complete: ${builtCount} built, ${skippedCount} skipped.`,
    );
  } finally {
    for (const [inputPath, content] of originalInputs) {
      await writeFile(inputPath, content, 'utf8');
    }

    console.log('Restored input files.');
  }
}

main().catch((error: unknown) => {
  console.error('Failed to build training audio:', error);
  process.exitCode = 1;
});
