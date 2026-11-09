import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from 'vite';
import { bindVerifiedWorker, createVerifiedManifests } from './verified-asset-manifest.js';
import { candidateFile, recordCandidate, verifyCandidate, verifyBuiltAssets, validateOrigin, type CandidateOrigin } from './pages-candidate.js';
import { createPublishPackage, verifyPublishPackage } from './publish-package.js';
import { capturePublished, saveObservation } from './legacy-retention.js';

const require = createRequire(import.meta.url);
const policy = require('../.github/scripts/pages-deployment-policy.cjs');
const origin: CandidateOrigin = {repository: 'owner/EAG', commitSha: 'a'.repeat(40),
  runId: '123', runAttempt: '2', eventName: 'push', ref: 'refs/heads/main'};

test('candidate verifies 222 built assets and fails for missing/corrupt assets, identities and provenance', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'eag-candidate-test-'));
  const base = '/English-Audio-Generator/';
  const lessons = JSON.parse(await readFile('web/src/training-lessons.json', 'utf8'));
  try {
    await build({configFile: false, root: path.resolve('web'), base, logLevel: 'silent',
      build: {outDir: root, manifest: true, emptyOutDir: false}});
    const bound = bindVerifiedWorker(await createVerifiedManifests(root, lessons, base), await readFile(path.join(root, 'sw.js'), 'utf8'));
    await writeFile(path.join(root, 'sw.js'), bound.workerSource);
    await writeFile(path.join(root, 'verified-audio-assets.json'), JSON.stringify(bound.audio));
    await writeFile(path.join(root, 'verified-app-assets.json'), JSON.stringify(bound.app));
    const result = await verifyBuiltAssets(root, lessons, base);
    assert.equal(result.assetCount, 222);
    const candidate = await recordCandidate(root, lessons, base, origin);
    assert.equal(candidate.commitSha, origin.commitSha);
    assert.equal(candidate.releaseId, bound.audio.releaseId);
    assert.equal(candidate.workerBuildId, bound.audio.workerBuildId);
    assert.deepEqual(await verifyCandidate(root, lessons, base, origin), candidate);
    await assert.rejects(recordCandidate(root, lessons, base, origin), /EEXIST/);
    for (const changed of [{commitSha: 'b'.repeat(40)}, {runId: '456'}, {runAttempt: '3'}, {repository: 'fork/EAG'}]) {
      await assert.rejects(verifyCandidate(root, lessons, base, {...origin, ...changed}));
    }
    const names = ['verified-audio-assets.json', 'verified-app-assets.json', 'sw.js', 'index.html',
      'lessons/basic-delivery/metadata.json', 'lessons/etcl-01-talking-about-my-job/japanese-cues/phrase-001.mp3',
      bound.app.assets.find(asset => asset.path.endsWith('.js') && asset.path.startsWith('assets/'))!.path,
      bound.app.assets.find(asset => asset.path.endsWith('.css'))!.path];
    for (const name of names) {
      const file = path.join(root, name), before = await readFile(file);
      await rm(file);
      await assert.rejects(verifyBuiltAssets(root, lessons, base), `Missing ${name}`);
      await writeFile(file, Buffer.concat([before, Buffer.from('corruption')]));
      await assert.rejects(verifyBuiltAssets(root, lessons, base), `Corrupt ${name}`);
      await writeFile(file, before);
    }
    const appFile = path.join(root, 'verified-app-assets.json'), appBytes = await readFile(appFile);
    const wrongId = JSON.parse(appBytes.toString()); wrongId.workerBuildId = '0'.repeat(64);
    await writeFile(appFile, JSON.stringify(wrongId));
    await assert.rejects(verifyBuiltAssets(root, lessons, base));
    await writeFile(appFile, appBytes);
    const extra = path.join(root, 'unexpected.txt'); await writeFile(extra, 'unexpected');
    await assert.rejects(verifyCandidate(root, lessons, base, origin), /distribution mismatch/);
    await rm(extra);
    const provenance = path.join(root, candidateFile), record = await readFile(provenance);
    await writeFile(provenance, JSON.stringify({...candidate, distributionSha256: '0'.repeat(64)}));
    await assert.rejects(verifyCandidate(root, lessons, base, origin));
    await writeFile(provenance, record);
    assert.deepEqual(await verifyCandidate(root, lessons, base, origin), candidate);
    // This is a local test origin, never evidence of an actual GitHub CI run.
    const packageRoot = await mkdtemp(path.join(tmpdir(), 'eag-package-test-'));
    try {
      const first = path.join(packageRoot, 'first'), second = path.join(packageRoot, 'second');
      const packaged = await createPublishPackage(root, 'retained-assets', first, lessons, base, origin);
      assert.equal(packaged.publicationAllowed, false);
      assert.equal(packaged.retainedFiles, 2); assert.equal(packaged.retainedBytes, 45897);
      assert.equal(packaged.addedFiles, 1); assert.equal(packaged.addedBytes, 42231);
      assert.equal((await createPublishPackage(root, 'retained-assets', second, lessons, base, origin)).packageId, packaged.packageId);
      for (const name of ['verified-audio-assets.json', 'verified-app-assets.json', 'sw.js', 'index.html']) {
        assert.deepEqual(await readFile(path.join(first, name)), await readFile(path.join(root, name)));
      }
      assert.equal((await verifyBuiltAssets(first, lessons, base)).assetCount, 222);
      assert.deepEqual(await verifyPublishPackage(first, 'retained-assets', lessons, base, origin), packaged);
      await assert.rejects(createPublishPackage(root, 'retained-assets', first, lessons, base, origin), /EEXIST/);
      await assert.rejects(createPublishPackage(root, path.join(packageRoot, 'missing'), path.join(packageRoot, 'bad'), lessons, base, origin));
      await assert.rejects(verifyPublishPackage(first, 'retained-assets', lessons, base, {...origin, runId: '999'}), /origin/);
      for (const name of ['assets/index-CHF6roX8.js', 'retained-assets.json', 'publish-package.json', candidateFile]) {
        const file = path.join(first, name), bytes = await readFile(file);
        await writeFile(file, Buffer.concat([bytes, Buffer.from('corrupt')]));
        await assert.rejects(verifyPublishPackage(first, 'retained-assets', lessons, base, origin));
        await writeFile(file, bytes);
      }
      await writeFile(path.join(first, 'unexpected.txt'), 'extra');
      await assert.rejects(verifyPublishPackage(first, 'retained-assets', lessons, base, origin));
      const css = bound.app.assets.find(asset => asset.path.endsWith('.css'))!.path;
      const js = 'assets/conflict-abcdef.js';
      const oldHtml = `<!doctype html><html><script src="${base}${js}"></script><link rel="stylesheet" href="${base}${css}"></html>`;
      const response = (async (input: unknown) => {
        const name = String(input).split(base)[1] || 'index.html';
        return new Response(name === 'index.html' ? oldHtml : name === css ? 'body{color:magenta}' : 'console.log("old")',
          {headers: {'content-type': name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'application/javascript'}});
      }) as typeof fetch;
      const conflicting = path.join(packageRoot, 'conflicting');
      await saveObservation(conflicting, await capturePublished('b'.repeat(40), response));
      await assert.rejects(createPublishPackage(root, conflicting, path.join(packageRoot, 'rejected'), lessons, base, origin), /Publish collision/);
      console.log('Local fixture package verification:', JSON.stringify(packaged));
    } finally {
      assert.equal(path.dirname(packageRoot), path.resolve(tmpdir()));
      assert.ok(path.basename(packageRoot).startsWith('eag-package-test-'));
      await rm(packageRoot, {recursive: true, force: true});
    }
  } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('eag-candidate-test-'));
    await rm(root, {recursive: true, force: true});
  }
});

test('deployment policy rejects wrong workflow/run provenance, failed CI, PRs and expired or ambiguous artifacts', () => {
  const expected = {repository: origin.repository, sha: origin.commitSha, ref: origin.ref,
    runId: origin.runId, confirmation: `DEPLOY ${origin.commitSha}`};
  const run = {id: 123, run_attempt: 2, repository: {full_name: origin.repository}, head_repository: {full_name: origin.repository},
    path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main', head_sha: origin.commitSha,
    status: 'completed', conclusion: 'success'};
  const name = policy.validateRun(run, expected);
  assert.equal(name, `eag-candidate-${origin.commitSha}-123-2`);
  for (const patch of [{event: 'pull_request'}, {event: 'workflow_dispatch'}, {head_branch: 'feature'},
    {conclusion: 'failure'}, {conclusion: 'cancelled'}, {status: 'in_progress'}, {head_sha: 'b'.repeat(40)},
    {path: '.github/workflows/untrusted.yml'}, {repository: {full_name: 'other/EAG'}},
    {head_repository: {full_name: 'fork/EAG'}}, {id: 456}]) {
    assert.throws(() => policy.validateRun({...run, ...patch}, expected));
  }
  assert.throws(() => policy.validateRun(run, {...expected, ref: 'refs/heads/feature'}));
  assert.throws(() => policy.validateRun(run, {...expected, confirmation: 'yes'}));
  const now = Date.parse('2026-01-01T00:00:00Z');
  const artifact = {id: 99, name, expired: false, expires_at: '2026-01-02T00:00:00Z',
    workflow_run: {id: run.id, head_sha: run.head_sha}};
  assert.equal(policy.validateArtifact([artifact], name, run, now), 99);
  for (const patch of [{expired: true}, {expires_at: '2025-12-31T00:00:00Z'}, {expires_at: 'invalid'},
    {workflow_run: {id: 999, head_sha: run.head_sha}}, {workflow_run: {id: run.id, head_sha: 'b'.repeat(40)}}]) {
    assert.throws(() => policy.validateArtifact([{...artifact, ...patch}], name, run, now));
  }
  assert.throws(() => policy.validateArtifact([], name, run, now));
  assert.throws(() => policy.validateArtifact([artifact, artifact], name, run, now));
  assert.throws(() => policy.assertRetentionReady(), /DEPLOYMENT BLOCKED/);
  assert.throws(() => validateOrigin({...origin, commitSha: '$(unsafe)'}));
});

test('workflows separate validation, release and recovery and require the conditional gate', async () => {
  const ci = await readFile('.github/workflows/ci.yml', 'utf8');
  const publication = await readFile('.github/workflows/deploy-pages.yml', 'utf8');
  const triggers = (source: string) => /^on:\r?\n([\s\S]*?)(?=^\S)/m.exec(source)![1]!;
  assert.match(triggers(ci), /  push:/); assert.match(triggers(ci), /  pull_request:/);
  assert.doesNotMatch(ci, /pages: write|id-token: write|deploy-pages@|pull_request_target/);
  assert.match(triggers(publication), /  workflow_dispatch:/);
  assert.doesNotMatch(triggers(publication), /  push:|  pull_request:|workflow_run:/);
  const commands = ['npm ci', 'npm test', 'npm run typecheck', 'npm run web:build', 'npm run verify:built-assets', 'npm run candidate:record', 'actions/upload-artifact@v4'];
  for (let i = 1; i < commands.length; i++) assert.ok(ci.indexOf(commands[i - 1]!) < ci.indexOf(commands[i]!));
  assert.doesNotMatch(ci, /continue-on-error|always\(\)/);
  assert.match(publication, /needs: release_prepare/);
  assert.match(publication, /needs: recovery_prepare/);
  assert.match(publication, /needs\.release_prepare\.result == 'success'/);
  assert.match(publication, /needs\.recovery_prepare\.result == 'success'/);
  assert.equal((publication.match(/pages: write/g) ?? []).length, 2);
  assert.ok(publication.indexOf('pages: write') > publication.indexOf('  release_deploy:'));
  assert.doesNotMatch(publication, /npm run web:build|continue-on-error|always\(\)/);
  assert.match(publication, /artifact-ids: \$\{\{ steps.origin.outputs.artifact_id \}\}/);
  assert.match(publication, /candidate:verify -- --root output\/candidate/);
  assert.match(publication, /verifyForDeploy/);
  assert.equal((publication.match(/\.verifyForDeploy\(/g) ?? []).length, 2, 'Both deploy paths must reauthenticate and reverify');
  const recovery = /^  recovery_prepare:\r?\n([\s\S]*?)(?=^  release_deploy:)/m.exec(publication)![1]!;
  assert.doesNotMatch(recovery, /contents: write|package:create|archiveRelease/);
  assert.match(recovery, /prepareRecovery/);
  assert.match(publication, /package:create -- --input output\/candidate --output output\/publish-ready/);
  assert.match(ci, /include-hidden-files: true/);
});
