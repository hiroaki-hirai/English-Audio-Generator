import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { candidateFile, distributionInventory, validateOrigin, verifyBuiltAssets, verifyCandidate, type CandidateOrigin } from './pages-candidate.js';
import { htmlRoots, retentionPath, staticDependencies, verifyRetention } from './legacy-retention.js';
import { sha256, validateAssetPath } from './verified-asset-manifest.js';

const packageFile = 'publish-package.json';
const retentionFile = 'retained-assets.json';

async function inventory(root: string) {
  const files = (await distributionInventory(root)).filter(file => file.path !== packageFile);
  const provenance = await readFile(path.join(root, candidateFile));
  files.push({path: candidateFile, size: provenance.length, sha256: sha256(provenance)});
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

async function retentionPlan(candidate: Awaited<ReturnType<typeof verifyCandidate>>, registry: string) {
  const verified = await verifyRetention(registry);
  const assets = [...verified.files.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([name, file]) => {
    const collision = candidate.files.find(item => item.path.toLowerCase() === name.toLowerCase());
    if (collision) {
      assert.equal(collision.path, name, 'Case-colliding publish path');
      assert.equal(collision.sha256, file.asset.sha256, `Publish collision: ${name}`);
      assert.equal(collision.size, file.asset.size);
    }
    return {...file.asset, generations: file.generations, disposition: collision ? 'IDENTICAL' : 'ADDED'};
  });
  return {verified, document: {schemaVersion: 1, registrySha256: sha256(await readFile(path.join(registry, 'catalog.json'))),
    generations: verified.generations, assets}};
}

export async function createPublishPackage(input: string, registry: string, output: string,
  lessons: unknown, basePath: string, origin: CandidateOrigin) {
  for (const source of [input, registry]) {
    const relative = path.relative(path.resolve(source), path.resolve(output));
    assert.ok(relative && (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)), 'Output must be separate from input/registry');
  }
  const candidate = await verifyCandidate(input, lessons, basePath, origin);
  assert.ok(!candidate.files.some(file => [packageFile, retentionFile].includes(file.path)), 'Candidate contains package records');
  const plan = await retentionPlan(candidate, registry); // Reject every conflict before creating output.
  const bodies = new Map<string, Buffer>();
  for (const file of candidate.files) {
    validateAssetPath(file.path);
    const bytes = await readFile(path.join(input, file.path));
    assert.equal(sha256(bytes), file.sha256); assert.equal(bytes.length, file.size);
    bodies.set(file.path, bytes);
  }
  bodies.set(candidateFile, await readFile(path.join(input, candidateFile)));
  for (const [name, file] of plan.verified.files) if (!bodies.has(name)) bodies.set(name, file.bytes);
  const nextRoots = htmlRoots(bodies.get('index.html')!.toString('utf8'));
  const nextAssets = new Map<string, {path: string; size: number; sha256: string; dependencies: string[]}>();
  const visit = (name: string) => {
    if (nextAssets.has(name)) return;
    const bytes = bodies.get(name); assert.ok(bytes, `Missing new static dependency: ${name}`);
    const dependencies = staticDependencies(name, bytes);
    nextAssets.set(name, {path: name, size: bytes.length, sha256: sha256(bytes), dependencies});
    dependencies.forEach(visit);
  };
  nextRoots.forEach(visit);
  const retained = {...plan.document, nextPublication: {status: 'PENDING_NOT_PUBLISHED',
    commitSha: origin.commitSha, releaseId: candidate.releaseId, workerBuildId: candidate.workerBuildId,
    roots: nextRoots, assets: [...nextAssets.values()].sort((a, b) => a.path < b.path ? -1 : 1)}};
  bodies.set(retentionFile, Buffer.from(JSON.stringify(retained, null, 2) + '\n'));
  await mkdir(output, {recursive: false});
  for (const [name, bytes] of bodies) {
    await mkdir(path.dirname(path.join(output, name)), {recursive: true});
    await writeFile(path.join(output, name), bytes, {flag: 'wx'});
  }
  const files = await inventory(output);
  const record = {schemaVersion: 1, candidate, candidateSha256: sha256(bodies.get(candidateFile)!),
    retentionSha256: sha256(bodies.get(retentionFile)!), files};
  await writeFile(path.join(output, packageFile), JSON.stringify({...record, packageId: sha256(JSON.stringify(record))}, null, 2) + '\n', {flag: 'wx'});
  return verifyPublishPackage(output, registry, lessons, basePath, origin);
}

export async function verifyPublishPackage(root: string, registry: string, lessons: unknown, basePath: string, origin: CandidateOrigin) {
  validateOrigin(origin);
  // Reject symlinks and unsafe paths before reading any manifest-directed file.
  await distributionInventory(root);
  const record = JSON.parse(await readFile(path.join(root, packageFile), 'utf8'));
  const candidate = JSON.parse(await readFile(path.join(root, candidateFile), 'utf8'));
  assert.equal(record.schemaVersion, 1);
  assert.deepEqual(record.candidate, candidate);
  assert.equal(candidate.schemaVersion, 1); assert.equal(candidate.workflow, '.github/workflows/ci.yml');
  for (const [key, value] of Object.entries(origin)) assert.equal(candidate[key], value, `Wrong package origin: ${key}`);
  assert.equal(sha256(JSON.stringify(candidate.files)), candidate.distributionSha256);
  for (const file of candidate.files) {
    validateAssetPath(file.path);
    const bytes = await readFile(path.join(root, file.path));
    assert.equal(bytes.length, file.size); assert.equal(sha256(bytes), file.sha256);
  }
  const verified = await verifyBuiltAssets(root, lessons, basePath);
  for (const [key, value] of Object.entries(verified)) assert.equal(candidate[key], value);
  const plan = await retentionPlan(candidate, registry);
  const retainedBytes = await readFile(path.join(root, retentionFile));
  const retained = JSON.parse(retainedBytes.toString('utf8'));
  const {nextPublication, ...retainedPlan} = retained;
  assert.deepEqual(retainedPlan, plan.document);
  assert.equal(nextPublication.status, 'PENDING_NOT_PUBLISHED');
  assert.equal(nextPublication.commitSha, origin.commitSha); assert.equal(nextPublication.releaseId, verified.releaseId);
  assert.equal(nextPublication.workerBuildId, verified.workerBuildId);
  assert.deepEqual(nextPublication.roots, htmlRoots((await readFile(path.join(root, 'index.html'))).toString('utf8')));
  const reachable = new Set<string>();
  const visit = async (name: string): Promise<void> => {
    retentionPath(name);
    if (reachable.has(name)) return;
    reachable.add(name);
    const bytes = await readFile(path.join(root, name)), dependencies = staticDependencies(name, bytes);
    const item = nextPublication.assets.find((asset: {path: string}) => asset.path === name);
    assert.deepEqual(item, {path: name, size: bytes.length, sha256: sha256(bytes), dependencies});
    for (const dependency of dependencies) await visit(dependency);
  };
  for (const name of nextPublication.roots) await visit(name);
  assert.equal(reachable.size, nextPublication.assets.length);
  for (const [name, file] of plan.verified.files) assert.equal(sha256(await readFile(path.join(root, name))), file.asset.sha256);
  const actualFiles = await inventory(root);
  const expectedPaths = new Set([...candidate.files.map((file: {path: string}) => file.path), candidateFile, retentionFile, ...plan.verified.files.keys()]);
  assert.deepEqual(actualFiles.map(file => file.path).sort(), [...expectedPaths].sort());
  assert.deepEqual(record.files, actualFiles);
  const expected = {schemaVersion: 1, candidate, candidateSha256: sha256(await readFile(path.join(root, candidateFile))),
    retentionSha256: sha256(retainedBytes), files: actualFiles};
  assert.deepEqual(record, {...expected, packageId: sha256(JSON.stringify(expected))});
  return {packageId: record.packageId as string, releaseId: verified.releaseId, workerBuildId: verified.workerBuildId,
    retainedFiles: plan.verified.files.size, addedFiles: plan.document.assets.filter(asset => asset.disposition === 'ADDED').length,
    retainedBytes: [...plan.verified.files.values()].reduce((sum, file) => sum + file.bytes.length, 0),
    addedBytes: plan.document.assets.filter(asset => asset.disposition === 'ADDED').reduce((sum, asset) => sum + asset.size, 0),
    files: actualFiles.length + 1, publicationAllowed: false};
}
