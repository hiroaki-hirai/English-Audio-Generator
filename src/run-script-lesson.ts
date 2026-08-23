import { spawnSync } from 'node:child_process';

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
    process.exit(result.status ?? 1);
  }
}

function main(): void {
  const scriptId = process.argv[2];

  if (!scriptId) {
    throw new Error(
      'Script ID is required. Example: npm run lesson:script -- basic-delivery',
    );
  }

  if (!/^[a-z0-9-]+$/.test(scriptId)) {
    throw new Error(
      'Script ID may contain only lowercase letters, numbers, and hyphens.',
    );
  }

  runNpm(['run', 'prepare:script', '--', scriptId]);
  runNpm(['run', 'generate:speech']);
  runNpm(['run', 'build:lesson']);
}

try {
  main();
} catch (error: unknown) {
  console.error('Failed to build scripted lesson:', error);
  process.exitCode = 1;
}
