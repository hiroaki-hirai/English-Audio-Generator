import { readFile } from 'node:fs/promises';
import { resolveConfig } from 'vite';
import path from 'node:path';
import { type CandidateOrigin } from './pages-candidate.js';
import { verifyRetention } from './legacy-retention.js';
import { createPublishPackage, verifyPublishPackage } from './publish-package.js';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'retention') {
    if (args.length) throw new Error('Unexpected retention arguments');
    const result = await verifyRetention('retained-assets');
    console.log(JSON.stringify({files: result.files.size, bytes: [...result.files.values()].reduce((n, file) => n + file.bytes.length, 0), generations: result.generations}));
    return;
  }
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--root', '--input', '--output'].includes(args[i]!) || !args[i + 1] || options.has(args[i]!)) throw new Error('Invalid package options');
    options.set(args[i]!, args[i + 1]!);
  }
  const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
  const origin: CandidateOrigin = {repository: required('CANDIDATE_REPOSITORY'), commitSha: required('CANDIDATE_SHA'),
    runId: required('CANDIDATE_RUN_ID'), runAttempt: required('CANDIDATE_RUN_ATTEMPT'),
    eventName: required('CANDIDATE_EVENT') as CandidateOrigin['eventName'], ref: required('CANDIDATE_REF')};
  const config = await resolveConfig({}, 'build');
  const lessons = JSON.parse(await readFile(path.join(config.root, 'src/training-lessons.json'), 'utf8'));
  if (command === 'create' && options.size === 2 && options.has('--input') && options.has('--output')) {
    console.log(JSON.stringify(await createPublishPackage(options.get('--input')!, 'retained-assets', options.get('--output')!, lessons, config.base, origin)));
  } else if (command === 'verify' && options.size === 1 && options.has('--root')) {
    console.log(JSON.stringify(await verifyPublishPackage(options.get('--root')!, 'retained-assets', lessons, config.base, origin)));
  } else throw new Error('Expected create --input ... --output ... or verify --root ...');
}
main().catch((error: unknown) => { console.error('Publish package HOLD:', error); process.exitCode = 1; });
