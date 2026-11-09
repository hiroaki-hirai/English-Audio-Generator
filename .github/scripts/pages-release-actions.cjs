'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('./pages-deployment-policy.cjs');
const pkg = require('./pages-release-package.cjs');
const controlFile = 'output/control/authorization.json';
function save(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
}

async function authenticate({github, context, core}) {
  const approval = JSON.parse(process.env.APPROVAL_JSON || 'null');
  policy.validateApproval(approval);
  const triggeringActor = process.env.GITHUB_TRIGGERING_ACTOR || context.actor;
  const runId = Number(approval.ciRunId), attemptNumber = Number(approval.ciRunAttempt);
  assert.ok(Number.isSafeInteger(runId) && runId > 0 && Number.isSafeInteger(attemptNumber) && attemptNumber > 0,
    'CI run/attempt IDs must be safe positive integers');
  const [main, actor, approver, metadata, attempt] = await Promise.all([
    github.rest.repos.getBranch({...context.repo, branch: 'main'}),
    github.rest.repos.getCollaboratorPermissionLevel({...context.repo, username: triggeringActor}),
    github.rest.repos.getCollaboratorPermissionLevel({...context.repo, username: approval.approvedBy}),
    github.rest.actions.getWorkflowRun({...context.repo, run_id: runId}),
    github.rest.actions.getWorkflowRunAttempt({...context.repo, run_id: runId, attempt_number: attemptNumber})
  ]);
  assert.ok(metadata?.data && typeof metadata.data === 'object' && attempt?.data && typeof attempt.data === 'object' &&
    !Array.isArray(metadata.data) && !Array.isArray(attempt.data),
    'CI run and fixed attempt responses required');
  // Run-level provenance is stable across reruns. Never borrow latest-attempt
  // status/conclusion/number when the approved attempt response is incomplete.
  for (const field of ['id', 'head_sha', 'head_branch', 'event']) {
    assert.equal(attempt.data[field], metadata.data[field], `Fixed attempt/run mismatch: ${field}`);
  }
  if (Object.hasOwn(attempt.data, 'path')) assert.equal(attempt.data.path, metadata.data.path, 'Fixed attempt workflow mismatch');
  for (const field of ['repository', 'head_repository']) {
    if (Object.hasOwn(attempt.data, field)) {
      assert.equal(attempt.data[field]?.full_name, metadata.data[field]?.full_name, `Fixed attempt ${field} mismatch`);
    }
  }
  assert.equal(String(attempt.data.run_attempt), approval.ciRunAttempt, 'Approved CI attempt mismatch');
  const run = {data: {id: attempt.data.id, run_attempt: attempt.data.run_attempt,
    head_sha: attempt.data.head_sha, head_branch: attempt.data.head_branch, event: attempt.data.event,
    status: attempt.data.status, conclusion: attempt.data.conclusion,
    repository: metadata.data.repository, head_repository: metadata.data.head_repository, path: metadata.data.path}};
  const execution = {repository: `${context.repo.owner}/${context.repo.repo}`, sha: context.sha,
    mainSha: main.data.commit.sha, eventName: context.eventName, ref: context.ref,
    workflowRef: process.env.GITHUB_WORKFLOW_REF, workflowSha: process.env.GITHUB_WORKFLOW_SHA,
    actor: triggeringActor, actorPermission: actor.data.permission, approverPermission: approver.data.permission,
    action: process.env.RELEASE_ACTION, confirmation: process.env.CONFIRMATION};
  policy.validateExecution(execution, approval);
  const name = policy.validateRun(run.data, {repository: execution.repository, sha: approval.targetSha,
    ref: 'refs/heads/main', runId: approval.ciRunId, confirmation: `DEPLOY ${approval.targetSha}`});
  let artifact = null;
  if (approval.action === 'release') {
    artifact = (await github.rest.actions.getArtifact({...context.repo, artifact_id: approval.artifactId})).data;
    assert.equal(policy.validateArtifact([artifact], name, run.data), approval.artifactId);
  }
  const origin = {repository: approval.repository, commitSha: approval.targetSha,
    runId: approval.ciRunId, runAttempt: approval.ciRunAttempt, eventName: 'push', ref: 'refs/heads/main'};
  save(controlFile, {approval, execution, run: run.data, artifact, origin});
  for (const [key, value] of Object.entries({sha: origin.commitSha, run_id: origin.runId,
    run_attempt: origin.runAttempt, artifact_id: approval.artifactId})) core.setOutput(key, String(value));
}

async function assetBytes(github, coordinates, id, name) {
  assert.ok(Number.isSafeInteger(id) && id > 0, 'Archive asset ID required');
  const meta = (await github.rest.repos.getReleaseAsset({...coordinates, asset_id: id})).data;
  assert.equal(meta.id, id); assert.equal(meta.name, name); assert.equal(meta.state, 'uploaded');
  assert.ok(meta.size > 0 && meta.size <= 512 * 1024 * 1024, 'Archive asset size invalid');
  const response = await github.rest.repos.getReleaseAsset({...coordinates, asset_id: id,
    headers: {accept: 'application/octet-stream'}});
  assert.ok(Buffer.isBuffer(response.data) || response.data instanceof ArrayBuffer || ArrayBuffer.isView(response.data), 'Binary Release asset unavailable');
  const bytes = Buffer.from(response.data);
  assert.equal(bytes.length, meta.size, 'Incomplete Release download');
  return bytes;
}

async function retrieveAndGate({github, context}, ids, root) {
  const control = JSON.parse(fs.readFileSync(controlFile));
  const {approval, origin} = control;
  const [bytes, checksum] = await Promise.all([
    assetBytes(github, context.repo, ids.assetId, pkg.archiveName),
    assetBytes(github, context.repo, ids.checksumAssetId, pkg.archiveName + '.sha256')
  ]);
  assert.equal(checksum.toString('utf8'), approval.archiveSha256 + '  ' + pkg.archiveName + '\n', 'Independent archive checksum mismatch');
  assert.equal(pkg.sha256(bytes), approval.archiveSha256, 'Retrieved archive hash mismatch');
  const source = pkg.decodeArchive(bytes).source;
  assert.deepEqual(source, {...origin, artifactId: approval.artifactId}, 'Archived CI artifact identity mismatch');
  save('output/retrieved/' + pkg.archiveName, bytes);
  save('output/retrieved/' + pkg.archiveName + '.sha256', checksum);
  pkg.extractArchive(bytes, root);
  pkg.verifyPackage(root, origin);
  const observed = pkg.snapshot(root);
  const archive = {repository: approval.repository, assetId: ids.assetId, checksumAssetId: ids.checksumAssetId,
    sha256: pkg.sha256(bytes), checksumSha256: checksum.toString('utf8').slice(0, 64),
    packageId: observed.packageId, sourceArtifactId: source.artifactId, retrieved: true, packageVerified: true};
  const result = policy.assertRetentionReady({...control, package: observed, archive});
  return {result, archive};
}

async function archiveRelease({github, context, core}) {
  const {approval, origin} = JSON.parse(fs.readFileSync(controlFile));
  assert.equal(approval.action, 'release', 'Recovery cannot create or overwrite an archive');
  pkg.verifyPackage('output/publish-ready', origin);
  assert.deepEqual(pkg.snapshot('output/publish-ready'), approval.package);
  const archived = pkg.writeArchive('output/publish-ready', 'output/archive', {...origin, artifactId: approval.artifactId});
  assert.equal(archived.sha256, approval.archiveSha256, 'Local approved archive differs from main package');
  const release = (await github.rest.repos.createRelease({...context.repo,
    tag_name: `eag-archive-${context.runId}-${process.env.GITHUB_RUN_ATTEMPT}`,
    target_commitish: approval.targetSha, name: `EAG fixed archive ${approval.targetSha}`,
    body: 'Verified archive only. This release does not deploy GitHub Pages.',
    draft: false, prerelease: true, make_latest: 'false'})).data;
  const uploaded = [];
  for (const name of [pkg.archiveName, pkg.archiveName + '.sha256']) {
    const data = fs.readFileSync(path.join('output/archive', name));
    uploaded.push((await github.rest.repos.uploadReleaseAsset({...context.repo, release_id: release.id,
      name, data, headers: {'content-type': 'application/octet-stream', 'content-length': data.length}})).data);
  }
  const checked = await retrieveAndGate({github, context}, {assetId: uploaded[0].id,
    checksumAssetId: uploaded[1].id}, 'output/retrieved-package');
  save('output/handoff/archive-proof.json', checked.archive);
  save('output/handoff/' + pkg.archiveName, archived.bytes);
  save('output/handoff/' + pkg.archiveName + '.sha256', approval.archiveSha256 + '  ' + pkg.archiveName + '\n');
  core.info(`Archive saved and reverified: Release ${release.id}, assets ${uploaded[0].id}/${uploaded[1].id}. No Pages publication yet.`);
}

async function prepareRecovery({github, context}) {
  const {approval} = JSON.parse(fs.readFileSync(controlFile));
  assert.equal(approval.action, 'recover');
  const checked = await retrieveAndGate({github, context}, {assetId: approval.archiveAssetId,
    checksumAssetId: approval.checksumAssetId}, 'output/recovered-package');
  save('output/handoff/archive-proof.json', checked.archive);
  save('output/handoff/' + pkg.archiveName, fs.readFileSync('output/retrieved/' + pkg.archiveName));
  save('output/handoff/' + pkg.archiveName + '.sha256', fs.readFileSync('output/retrieved/' + pkg.archiveName + '.sha256'));
}

async function verifyForDeploy({github, context, core}) {
  // Repeat live API authorization and archive retrieval. A handoff receipt alone
  // never authorizes Pages upload, even when the prepare job previously passed.
  await authenticate({github, context, core});
  const proof = JSON.parse(fs.readFileSync('output/handoff/archive-proof.json'));
  const {approval} = JSON.parse(fs.readFileSync(controlFile));
  assert.equal(pkg.sha256(fs.readFileSync('output/handoff/' + pkg.archiveName)), approval.archiveSha256);
  const checked = await retrieveAndGate({github, context}, proof, 'output/publish');
  assert.deepEqual(checked.archive, proof, 'Archive handoff changed');
  save('output/final-gate.json', checked);
}

module.exports = {authenticate, assetBytes, retrieveAndGate, archiveRelease, prepareRecovery, verifyForDeploy};
