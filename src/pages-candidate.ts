import assert from 'node:assert/strict';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bindVerifiedWorker, createVerifiedManifests, sha256, validateAssetPath } from './verified-asset-manifest.js';
import { createActiveRecallLibrarySignature } from '../web/src/active-recall.js';
import { selectLegacyActiveRecallLessons, orderLegacyActiveRecallLessons } from '../web/src/legacy-active-recall-library.js';

export const candidateFile = 'candidate-provenance.json';
export type CandidateOrigin = {
  repository: string; commitSha: string; runId: string; runAttempt: string;
  eventName: 'push' | 'pull_request'; ref: string;
};

export function validateOrigin(origin: CandidateOrigin): void {
  assert.match(origin.repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  assert.match(origin.commitSha, /^[a-f0-9]{40}$/);
  assert.match(origin.runId, /^[1-9]\d*$/);
  assert.match(origin.runAttempt, /^[1-9]\d*$/);
  assert.ok(['push', 'pull_request'].includes(origin.eventName));
  assert.ok(typeof origin.ref === 'string' && origin.ref.startsWith('refs/'));
}

export async function verifyBuiltAssets(root: string, lessons: unknown, basePath: string) {
  assert.ok(Array.isArray(lessons));
  assert.equal(lessons.length, 20);
  assert.equal(lessons.reduce((sum, lesson) => sum + lesson.phrases.length, 0), 153);
  assert.equal(createActiveRecallLibrarySignature(selectLegacyActiveRecallLessons(lessons)), 'fnv1a32:85:32bf4dac');
  assert.equal(createActiveRecallLibrarySignature(orderLegacyActiveRecallLessons(lessons)), 'fnv1a32:85:a7bb76ae');
  const worker = await readFile(path.join(root, 'sw.js'), 'utf8');
  const expected = bindVerifiedWorker(await createVerifiedManifests(root, lessons, basePath), worker);
  assert.equal(expected.workerSource, worker, 'Worker is not bound to this build');
  const audio = JSON.parse(await readFile(path.join(root, 'verified-audio-assets.json'), 'utf8'));
  const app = JSON.parse(await readFile(path.join(root, 'verified-app-assets.json'), 'utf8'));
  assert.deepEqual(audio, expected.audio, 'Audio manifest mismatch');
  assert.deepEqual(app, expected.app, 'App manifest mismatch');
  assert.equal(audio.assets.length, 213);
  assert.equal(app.assets.length, 9);
  assert.equal(audio.assets.filter((asset: {path: string}) => asset.path.includes('/japanese-cues/')).length, 153);
  return { releaseId: expected.audio.releaseId, workerBuildId: expected.audio.workerBuildId!,
    basePath, assetCount: audio.assets.length + app.assets.length };
}

export async function distributionInventory(root: string) {
  const inventory: Array<{path: string; size: number; sha256: string}> = [];
  const seen = new Set<string>();
  async function visit(relative: string): Promise<void> {
    for (const name of (await readdir(path.join(root, relative))).sort()) {
      const file = relative ? `${relative}/${name}` : name;
      validateAssetPath(file);
      if (file === candidateFile) continue; // Provenance must not hash itself.
      assert.ok(!seen.has(file.toLowerCase()), `Case-colliding distribution path: ${file}`);
      seen.add(file.toLowerCase());
      const info = await lstat(path.join(root, file));
      assert.ok(!info.isSymbolicLink(), `Symlink in candidate: ${file}`);
      if (info.isDirectory()) await visit(file);
      else {
        assert.ok(info.isFile(), `Invalid candidate file: ${file}`);
        const bytes = await readFile(path.join(root, file));
        inventory.push({path: file, size: bytes.length, sha256: sha256(bytes)});
      }
    }
  }
  assert.ok((await lstat(root)).isDirectory() && !(await lstat(root)).isSymbolicLink(), 'Invalid candidate root');
  await visit('');
  return inventory.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export async function describeCandidate(root: string, lessons: unknown, basePath: string, origin: CandidateOrigin) {
  validateOrigin(origin);
  const verified = await verifyBuiltAssets(root, lessons, basePath);
  const files = await distributionInventory(root);
  return { schemaVersion: 1, workflow: '.github/workflows/ci.yml', ...origin, ...verified,
    distributionSha256: sha256(JSON.stringify(files)), files };
}

export async function recordCandidate(root: string, lessons: unknown, basePath: string, origin: CandidateOrigin) {
  const record = await describeCandidate(root, lessons, basePath, origin);
  // Do not overwrite provenance from another run, attempt or commit.
  await writeFile(path.join(root, candidateFile), JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
  return record;
}

export async function verifyCandidate(root: string, lessons: unknown, basePath: string, origin: CandidateOrigin) {
  assert.ok((await lstat(path.join(root, candidateFile))).isFile() &&
    !(await lstat(path.join(root, candidateFile))).isSymbolicLink(), 'Invalid provenance file');
  const recorded = JSON.parse(await readFile(path.join(root, candidateFile), 'utf8'));
  const expected = await describeCandidate(root, lessons, basePath, origin);
  assert.deepEqual(recorded, expected, 'Candidate provenance or distribution mismatch');
  return expected;
}
