import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';

async function loadLessonIds(): Promise<string[]> {
  const fileNames = (await readdir('training-scripts'))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();

  if (fileNames.length === 0) {
    throw new Error('No training scripts were found.');
  }

  return fileNames.map((fileName) => fileName.replace(/\.json$/, ''));
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
    for (const [index, lessonId] of lessonIds.entries()) {
      console.log(
        `\nBuilding training lesson ${index + 1}/${lessonIds.length}: ${lessonId}`,
      );

      runNpm(['run', 'lesson:script', '--', lessonId]);

      const destinationDirectory = `web/public/lessons/${lessonId}`;
      const destinationPath = `${destinationDirectory}/lesson.mp3`;

      await mkdir(destinationDirectory, { recursive: true });

      await copyFile('output/lesson.mp3', destinationPath);

      console.log(`Copied lesson audio to ${destinationPath}`);
    }

    console.log(
      `\nFinished building ${lessonIds.length} training lesson audio files.`,
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
