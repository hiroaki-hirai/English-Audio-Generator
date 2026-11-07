import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveConfig } from 'vite';
import { recordCandidate, verifyBuiltAssets, verifyCandidate, type CandidateOrigin } from './pages-candidate.js';

async function main(): Promise<void> {
  const [command, ...options] = process.argv.slice(2);
  if (!['assets', 'record', 'verify'].includes(command ?? '')) throw new Error('Expected assets, record or verify.');
  if (options.length && (options.length !== 2 || options[0] !== '--root')) throw new Error('Only --root <directory> is supported.');
  const config = await resolveConfig({}, 'build');
  const root = options[1] ? path.resolve(options[1]) : path.resolve(config.root, config.build.outDir);
  const lessons = JSON.parse(await readFile(path.join(config.root, 'src/training-lessons.json'), 'utf8'));
  if (command === 'assets') {
    console.log(JSON.stringify(await verifyBuiltAssets(root, lessons, config.base)));
    return;
  }
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing provenance environment variable: ${name}`);
    return value;
  };
  const origin: CandidateOrigin = {
    repository: required('CANDIDATE_REPOSITORY'), commitSha: required('CANDIDATE_SHA'),
    runId: required('CANDIDATE_RUN_ID'), runAttempt: required('CANDIDATE_RUN_ATTEMPT'),
    eventName: required('CANDIDATE_EVENT') as CandidateOrigin['eventName'], ref: required('CANDIDATE_REF'),
  };
  const result = command === 'record'
    ? await recordCandidate(root, lessons, config.base, origin)
    : await verifyCandidate(root, lessons, config.base, origin);
  console.log(JSON.stringify({commitSha: result.commitSha, releaseId: result.releaseId,
    workerBuildId: result.workerBuildId, files: result.files.length, distributionSha256: result.distributionSha256}));
}

main().catch((error: unknown) => { console.error('Candidate validation failed:', error); process.exitCode = 1; });
