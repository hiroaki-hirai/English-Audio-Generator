import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const policy = require('../.github/scripts/pages-deployment-policy.cjs');
const pkg = require('../.github/scripts/pages-release-package.cjs');
const actions = require('../.github/scripts/pages-release-actions.cjs');

// Synthetic authorization only; no real record is created and no network is used.
function fixture(action = 'release') {
  const approval = JSON.parse(fs.readFileSync('.github/release/approval.template.json', 'utf8'));
  const now = Date.now();
  Object.assign(approval, {status: 'APPROVED', action, executionSha: 'a'.repeat(40), targetSha: 'a'.repeat(40),
    approvedBy: 'synthetic-owner', approvedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60000).toISOString(),
    l2BaselineSha256: policy.baselineSha256, ciRunId: '123', ciRunAttempt: '1', artifactId: 456,
    archiveSha256: 'b'.repeat(64), archiveAssetId: action === 'recover' ? 700 : 0, checksumAssetId: action === 'recover' ? 701 : 0});
  Object.assign(approval.package, policy.baseline.packageIdentity, {packageId: 'c'.repeat(64),
    packageManifestSha256: 'd'.repeat(64), retentionManifestSha256: 'e'.repeat(64)});
  Object.assign(approval.localCopyReceipt, {archiveSha256: approval.archiveSha256,
    packageId: approval.package.packageId, verifiedAt: new Date(now - 2000).toISOString(), path: 'C:/synthetic-backup/package.eag.json'});
  approval.localCopyReceiptSha256 = pkg.sha256(JSON.stringify(approval.localCopyReceipt));
  const execution = {repository: approval.repository, eventName: 'workflow_dispatch', ref: 'refs/heads/main',
    sha: approval.executionSha, mainSha: approval.executionSha, workflowSha: approval.executionSha,
    workflowRef: `${approval.repository}/.github/workflows/deploy-pages.yml@refs/heads/main`, actor: approval.approvedBy,
    actorPermission: 'write', approverPermission: 'admin', action,
    confirmation: action === 'release' ? `DEPLOY ${approval.targetSha}` : `RECOVER ${approval.targetSha} ${approval.archiveSha256}`};
  const run = {id: 123, run_attempt: 1, repository: {full_name: approval.repository}, head_repository: {full_name: approval.repository},
    path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main', head_sha: approval.targetSha, status: 'completed', conclusion: 'success'};
  const artifact = {id: 456, name: policy.candidateName(approval.targetSha, 123, 1), expired: false,
    expires_at: new Date(now + 60000).toISOString(), workflow_run: {id: 123, head_sha: approval.targetSha}};
  const archive = {repository: approval.repository, assetId: 700, checksumAssetId: 701, sha256: approval.archiveSha256,
    checksumSha256: approval.archiveSha256, packageId: approval.package.packageId, sourceArtifactId: 456, retrieved: true, packageVerified: true};
  return {approval, execution, run, artifact, package: structuredClone(approval.package), archive};
}

test('release gate accepts a complete synthetic approval plus verified API/package/archive evidence', () => {
  assert.equal(policy.assertRetentionReady(fixture()).publicationAllowed, true);
});
test('release gate rejects the draft template and missing approval/evidence', () => {
  assert.throws(() => policy.assertRetentionReady(), /BLOCKED/);
  assert.throws(() => policy.validateApproval(JSON.parse(fs.readFileSync('.github/release/approval.template.json', 'utf8'))), /BLOCKED/);
  assert.throws(() => policy.assertRetentionReady({...fixture(), approval: null}));
  assert.throws(() => policy.assertRetentionReady({...fixture(), archive: null}));
});
const failures: Array<[string, (f: ReturnType<typeof fixture>) => void]> = [
  ['approval field missing', f => {delete f.approval.package;}],
  ['unknown approval field', f => {f.approval.bypass = true;}],
  ['wrong L-2 baseline', f => {f.approval.l2BaselineSha256 = '0'.repeat(64);}],
  ['changed runtime manifest', f => {f.approval.package.audioManifestSha256 = '0'.repeat(64);}],
  ['changed release manifest', f => {f.package.packageManifestSha256 = '0'.repeat(64);}],
  ['changed package', f => {f.package.packageId = '0'.repeat(64);}],
  ['changed retained JS/CSS', f => {f.approval.package.retainedAssetsSha256 = '0'.repeat(64);}],
  ['changed retention registry', f => {f.package.retentionRegistrySha256 = '0'.repeat(64);}],
  ['wrong commit', f => {f.approval.targetSha = '0'.repeat(40);}],
  ['wrong artifact ID', f => {f.artifact.id = 999;}],
  ['expired artifact', f => {f.artifact.expired = true;}],
  ['expired approval', f => {f.approval.expiresAt = '1970-01-01T00:00:00Z';}],
  ['non-main CI', f => {f.run.head_branch = 'feature';}],
  ['failed CI', f => {f.run.conclusion = 'failure';}],
  ['PR CI', f => {f.run.event = 'pull_request';}],
  ['wrong CI attempt', f => {f.run.run_attempt = 2;}],
  ['push event', f => {f.execution.eventName = 'push';}],
  ['non-main dispatch', f => {f.execution.ref = 'refs/heads/feature';}],
  ['moved main', f => {f.execution.mainSha = '0'.repeat(40);}],
  ['untrusted workflow', f => {f.execution.workflowRef = 'other';}],
  ['wrong workflow SHA', f => {f.execution.workflowSha = '0'.repeat(40);}],
  ['read-only actor', f => {f.execution.actorPermission = 'read';}],
  ['read-only approver', f => {f.execution.approverPermission = 'read';}],
  ['impersonated approval', f => {f.execution.actor = 'other';}],
  ['manual confirmation mismatch', f => {f.execution.confirmation = 'DEPLOY yes';}],
  ['archive missing', f => {f.archive.retrieved = false;}],
  ['archive hash mismatch', f => {f.archive.sha256 = '0'.repeat(64);}],
  ['checksum mismatch', f => {f.archive.checksumSha256 = '0'.repeat(64);}],
  ['archive package not verified', f => {f.archive.packageVerified = false;}],
  ['archived source artifact mismatch', f => {f.archive.sourceArtifactId = 999;}],
  ['local receipt mismatch', f => {f.approval.localCopyReceipt.archiveSha256 = '0'.repeat(64);}],
  ['crossed recovery route', f => {f.execution.action = 'recover';}]
];
for (const [name, mutate] of failures) test('release gate rejects ' + name, () => {
  const evidence = fixture(); mutate(evidence);
  assert.throws(() => policy.assertRetentionReady(evidence));
});

test('release gate recovery requires separate approval, exact assets and RECOVER confirmation, independent of CI artifact expiry', () => {
  const evidence = fixture('recover');
  evidence.artifact.expired = true;
  assert.equal(policy.assertRetentionReady(evidence).action, 'recover');
  for (const change of [
    (f: any) => {f.execution.confirmation = `DEPLOY ${f.approval.targetSha}`;},
    (f: any) => {f.archive.assetId = 999;},
    (f: any) => {f.approval.archiveAssetId = 0;},
    (f: any) => {f.run.head_branch = 'feature';}
  ]) { const changed = structuredClone(evidence); change(changed); assert.throws(() => policy.assertRetentionReady(changed)); }
});

function syntheticDirectory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eag-release-synthetic-'));
  const input = path.join(root, 'input'); fs.mkdirSync(input);
  fs.mkdirSync(path.join(input, 'assets'));
  fs.writeFileSync(path.join(input, 'index.html'), '<!doctype html><title>Synthetic</title>');
  fs.writeFileSync(path.join(input, 'assets/test.bin'), Buffer.from([0, 1, 127, 255]));
  return {root, input};
}

function syntheticSource() {
  return {repository: policy.baseline.repository, commitSha: 'a'.repeat(40), runId: '123', runAttempt: '1',
    eventName: 'push', ref: 'refs/heads/main', artifactId: 456};
}

test('archive deterministic round trip preserves binary bytes and rejects overwrites, traversal, duplicates and corruption', () => {
  const {root, input} = syntheticDirectory();
  const bytes = pkg.encodeArchive(input, syntheticSource());
  assert.deepEqual(pkg.encodeArchive(input, syntheticSource()), bytes);
  assert.equal(pkg.decodeArchive(bytes).source.artifactId, 456);
  assert.throws(() => pkg.encodeArchive(input, {...syntheticSource(), artifactId: 0}), /artifact ID/);
  assert.throws(() => pkg.writeArchive(input, path.join(input, 'archive')), /separate/);
  assert.equal(fs.existsSync(path.join(input, 'archive')), false);
  const output = path.join(root, 'unpacked'); pkg.extractArchive(bytes, output);
  assert.deepEqual(fs.readFileSync(path.join(output, 'assets/test.bin')), Buffer.from([0, 1, 127, 255]));
  assert.throws(() => pkg.extractArchive(bytes, output), /EEXIST/);
  for (const mutate of [
    (a: any) => {a.files[0].path = '../escape';},
    (a: any) => {a.files[1].path = a.files[0].path;},
    (a: any) => {a.files[0].sha256 = '0'.repeat(64);},
    (a: any) => {a.files[0].size++;},
    (a: any) => {a.files[0].base64 += '!';},
    (a: any) => {a.files[0].link = '/elsewhere';}
  ]) { const a = JSON.parse(bytes.toString('utf8')); mutate(a); assert.throws(() => pkg.decodeArchive(Buffer.from(JSON.stringify(a)))); }
  assert.throws(() => pkg.decodeArchive(Buffer.from('not-json')));
  assert.throws(() => pkg.decodeArchive(Buffer.from('{"schemaVersion":1,"format":"eag-package-base64-v1","files":[]}')));
});

test('archive CLI accepts exactly the documented four arguments and rejects missing/extra/unknown operations', () => {
  for (const command of ['archive', 'local-copy']) {
    assert.deepEqual(pkg.parseArguments([command, 'input', 'output', 'origin.json']),
      {command, input: 'input', output: 'output', originFile: 'origin.json'});
  }
  for (const args of [[], ['archive', 'input', 'output'], ['deploy', 'input', 'output', 'origin.json'],
    ['archive', 'input', 'output', 'origin.json', 'extra']]) assert.throws(() => pkg.parseArguments(args));
});

test('archive Release download rejects missing assets, wrong IDs/names, JSON metadata instead of binary and truncation', async () => {
  const good = {id: 700, name: pkg.archiveName, state: 'uploaded', size: 4};
  const client = (meta = good, body: any = Buffer.from('data')) => ({rest: {repos: {getReleaseAsset: async (args: any) => ({data: args.headers ? body : meta})}}});
  assert.deepEqual(await actions.assetBytes(client(), {owner: 'synthetic', repo: 'EAG'}, 700, pkg.archiveName), Buffer.from('data'));
  await assert.rejects(actions.assetBytes(client({...good, id: 701}), {}, 700, pkg.archiveName));
  await assert.rejects(actions.assetBytes(client({...good, name: 'wrong'}), {}, 700, pkg.archiveName));
  await assert.rejects(actions.assetBytes(client(good, {url: 'metadata'}), {}, 700, pkg.archiveName));
  await assert.rejects(actions.assetBytes(client(good, Buffer.from('short')), {}, 700, pkg.archiveName));
  await assert.rejects(actions.assetBytes({rest: {repos: {getReleaseAsset: async () => {throw Error('missing archive');}}}}, {}, 700, pkg.archiveName));
});

test('release gate Actions adapter saves/retrieves archive before handoff, reauthenticates before deploy and separates recovery', async () => {
  const startDirectory = process.cwd();
  const savedEnvironment = {...process.env};
  const originalVerify = pkg.verifyPackage, originalSnapshot = pkg.snapshot;
  const directories = syntheticDirectory();
  const evidence = fixture();
  const bytes = pkg.encodeArchive(directories.input, syntheticSource());
  evidence.approval.archiveSha256 = pkg.sha256(bytes);
  evidence.approval.localCopyReceipt.archiveSha256 = evidence.approval.archiveSha256;
  evidence.approval.localCopyReceiptSha256 = pkg.sha256(JSON.stringify(evidence.approval.localCopyReceipt));
  evidence.execution.confirmation = `DEPLOY ${evidence.approval.targetSha}`;
  const assets = new Map<number, {name: string; bytes: Buffer}>();
  const outputs = new Map<string, string>();
  let verifyCalls = 0, uploads = 0, ciArtifactCalls = 0, branchChecks = 0;
  let uploadFailure = false;
  const context = {repo: {owner: 'hiroaki-hirai', repo: 'English-Audio-Generator'}, sha: evidence.approval.executionSha,
    eventName: 'workflow_dispatch', ref: 'refs/heads/main', actor: evidence.approval.approvedBy, runId: 900};
  const core = {setOutput: (key: string, value: string) => outputs.set(key, value), info: () => {}};
  const github = {rest: {
    actions: {
      getWorkflowRun: async () => ({data: evidence.run}),
      getWorkflowRunAttempt: async (args: any) => {
        assert.equal(args.run_id, 123); assert.equal(args.attempt_number, 1);
        return {data: evidence.run};
      },
      getArtifact: async (args: any) => {ciArtifactCalls++; assert.equal(args.artifact_id, 456); return {data: evidence.artifact};}
    },
    repos: {
      getBranch: async () => {branchChecks++; return {data: {commit: {sha: context.sha}}};},
      getCollaboratorPermissionLevel: async () => ({data: {permission: 'write'}}),
      createRelease: async () => {assert.equal(evidence.approval.action, 'release'); return {data: {id: 800}};},
      uploadReleaseAsset: async (args: any) => {
        if (uploadFailure) throw Error('synthetic archive storage failed');
        const id = 700 + uploads++;
        assets.set(id, {name: args.name, bytes: args.data}); return {data: {id}};
      },
      getReleaseAsset: async (args: any) => {
        assert.equal(args.owner, context.repo.owner); assert.equal(args.repo, context.repo.repo);
        const asset = assets.get(args.asset_id); if (!asset) throw Error('missing archive');
        return {data: args.headers ? asset.bytes : {id: args.asset_id, name: asset.name, state: 'uploaded', size: asset.bytes.length}};
      }
    }
  }};
  const configure = () => {
    process.env.APPROVAL_JSON = JSON.stringify(evidence.approval);
    process.env.RELEASE_ACTION = evidence.approval.action;
    process.env.CONFIRMATION = evidence.execution.confirmation;
    process.env.GITHUB_WORKFLOW_REF = evidence.execution.workflowRef;
    process.env.GITHUB_WORKFLOW_SHA = context.sha;
    process.env.GITHUB_TRIGGERING_ACTOR = context.actor;
    process.env.GITHUB_RUN_ATTEMPT = '1';
  };
  // Synthetic verifier seam: actual audio/build/package verification is not rerun.
  pkg.verifyPackage = (_root: string, origin: any) => {
    verifyCalls++;
    assert.equal(origin.repository, evidence.approval.repository);
    assert.equal(origin.commitSha, evidence.approval.targetSha);
    assert.equal(origin.runId, evidence.approval.ciRunId);
    assert.equal(origin.runAttempt, evidence.approval.ciRunAttempt);
    assert.equal(origin.eventName, 'push'); assert.equal(origin.ref, 'refs/heads/main');
    return {publicationAllowed: false};
  };
  pkg.snapshot = () => structuredClone(evidence.approval.package);
  try {
    process.chdir(directories.root); configure();
    fs.mkdirSync('output/publish-ready', {recursive: true});
    fs.cpSync(directories.input, 'output/publish-ready', {recursive: true});
    await actions.authenticate({github, context, core});
    assert.equal(outputs.get('artifact_id'), '456');
    await actions.archiveRelease({github, context, core});
    assert.equal(uploads, 2); assert.equal(verifyCalls, 2);
    assert(fs.existsSync('output/handoff/archive-proof.json'));
    assert.deepEqual(fs.readFileSync('output/retrieved/package.eag.json'), bytes);
    const handoff = path.resolve('output/handoff');

    const deployDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eag-release-deploy-synthetic-'));
    process.chdir(deployDirectory); configure();
    fs.mkdirSync('output', {recursive: true}); fs.cpSync(handoff, 'output/handoff', {recursive: true});
    await actions.verifyForDeploy({github, context, core});
    assert.equal(branchChecks, 2); assert.equal(ciArtifactCalls, 2);
    assert.equal(verifyCalls, 3);
    assert.equal(JSON.parse(fs.readFileSync('output/final-gate.json', 'utf8')).result.publicationAllowed, true);
    assert.deepEqual(fs.readFileSync('output/publish/assets/test.bin'), Buffer.from([0, 1, 127, 255]));

    // A storage exception must never produce a handoff that a deploy job can use.
    const failureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eag-release-failure-synthetic-'));
    process.chdir(failureDirectory); configure();
    fs.mkdirSync('output', {recursive: true}); fs.cpSync(directories.input, 'output/publish-ready', {recursive: true});
    await actions.authenticate({github, context, core}); uploadFailure = true;
    await assert.rejects(actions.archiveRelease({github, context, core}), /storage failed/);
    assert.equal(fs.existsSync('output/handoff'), false); uploadFailure = false;

    // Recovery must fetch pinned existing assets, without a new upload or a live
    // Actions artifact (the latter may legitimately have expired).
    const recoveryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eag-recovery-synthetic-'));
    process.chdir(recoveryDirectory);
    evidence.approval.action = 'recover'; evidence.approval.archiveAssetId = 700; evidence.approval.checksumAssetId = 701;
    evidence.approval.executionSha = '9'.repeat(40); context.sha = evidence.approval.executionSha;
    evidence.execution.confirmation = `RECOVER ${evidence.approval.targetSha} ${evidence.approval.archiveSha256}`;
    evidence.artifact.expired = true; configure();
    const artifactCallsBeforeRecovery = ciArtifactCalls;
    await actions.authenticate({github, context, core});
    await actions.prepareRecovery({github, context});
    assert.equal(ciArtifactCalls, artifactCallsBeforeRecovery);
    assert.equal(uploads, 2);
    assert(fs.existsSync('output/handoff/archive-proof.json'));
  } finally {
    pkg.verifyPackage = originalVerify; pkg.snapshot = originalSnapshot;
    process.chdir(startDirectory);
    for (const key of Object.keys(process.env)) if (!(key in savedEnvironment)) delete process.env[key];
    Object.assign(process.env, savedEnvironment);
  }
});

async function authenticateFixedAttempt(action: string, change?: (state: any) => void) {
  const evidence = fixture(action);
  const state: any = {
    metadata: {...structuredClone(evidence.run), run_attempt: 2, conclusion: 'failure'},
    // Optional repository/workflow fields deliberately omitted. Their provenance
    // comes from the independent run API, not from invented attempt response data.
    attempt: {id: 123, run_attempt: 1, head_sha: evidence.approval.targetSha,
      head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success'},
    artifact: structuredClone(evidence.artifact), attemptError: false
  };
  change?.(state);
  const startDirectory = process.cwd(), environment = {...process.env};
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eag-fixed-attempt-synthetic-'));
  const outputs = new Map<string, string>();
  const requests: any[] = [];
  const [owner, repo] = evidence.approval.repository.split('/');
  const github = {rest: {
    repos: {
      getBranch: async () => ({data: {commit: {sha: evidence.approval.executionSha}}}),
      getCollaboratorPermissionLevel: async () => ({data: {permission: 'write'}})
    },
    actions: {
      getWorkflowRun: async (args: any) => {requests.push({method: 'metadata', ...args}); return {data: state.metadata};},
      getWorkflowRunAttempt: async (args: any) => {
        requests.push({method: 'attempt', ...args});
        assert.deepEqual(args, {owner, repo, run_id: 123, attempt_number: 1});
        if (state.attemptError) throw Error('synthetic attempt API unavailable');
        return {data: state.attempt};
      },
      getArtifact: async (args: any) => {requests.push({method: 'artifact', ...args}); return {data: state.artifact};}
    }
  }};
  try {
    process.chdir(directory);
    Object.assign(process.env, {APPROVAL_JSON: JSON.stringify(evidence.approval), RELEASE_ACTION: action,
      CONFIRMATION: evidence.execution.confirmation, GITHUB_WORKFLOW_REF: evidence.execution.workflowRef,
      GITHUB_WORKFLOW_SHA: evidence.execution.workflowSha, GITHUB_TRIGGERING_ACTOR: evidence.execution.actor});
    await actions.authenticate({github, context: {repo: {owner, repo}, sha: evidence.approval.executionSha,
      actor: evidence.approval.approvedBy, eventName: 'workflow_dispatch', ref: 'refs/heads/main'},
      core: {setOutput: (key: string, value: string) => outputs.set(key, value)}});
    const control = JSON.parse(fs.readFileSync('output/control/authorization.json', 'utf8'));
    assert.equal(control.run.run_attempt, 1);
    assert.equal(control.run.conclusion, 'success');
    assert.equal(outputs.get('run_attempt'), '1');
    assert.equal(policy.assertRetentionReady({...evidence, run: control.run,
      artifact: control.artifact}).publicationAllowed, true);
    assert.equal(requests.filter(r => r.method === 'attempt').length, 1);
    assert.equal(requests.filter(r => r.method === 'artifact').length, action === 'release' ? 1 : 0);
    return control;
  } catch (error) {
    assert.equal(fs.existsSync('output/control/authorization.json'), false,
      'Rejected attempt must not create authenticated handoff metadata');
    throw error;
  } finally {
    process.chdir(startDirectory);
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
    Object.assign(process.env, environment);
  }
}

for (const action of ['release', 'recover']) {
  test(`release gate fixed attempt: ${action} accepts successful attempt 1 despite failed latest attempt 2`, async () => {
    await authenticateFixedAttempt(action);
  });
  const rejected: Array<[string, (state: any) => void]> = [
    ['failed approved attempt', s => {s.attempt.conclusion = 'failure';}],
    ['incomplete approved attempt', s => {s.attempt.status = 'in_progress'; s.attempt.conclusion = null;}],
    ['wrong returned attempt', s => {s.attempt.run_attempt = 2;}],
    ['wrong run ID', s => {s.attempt.id = 999;}],
    ['different SHA', s => {s.attempt.head_sha = '0'.repeat(40);}],
    ['different branch', s => {s.attempt.head_branch = 'feature';}],
    ['different event', s => {s.attempt.event = 'pull_request';}],
    ['both APIs agree on unapproved SHA', s => {s.metadata.head_sha = s.attempt.head_sha = '0'.repeat(40);}],
    ['both APIs agree on non-main branch', s => {s.metadata.head_branch = s.attempt.head_branch = 'feature';}],
    ['both APIs agree on non-push event', s => {s.metadata.event = s.attempt.event = 'pull_request';}],
    ['wrong workflow metadata', s => {s.metadata.path = '.github/workflows/other.yml';}],
    ['wrong repository metadata', s => {s.metadata.repository = {full_name: 'fork/EAG'};}],
    ['conflicting optional workflow field', s => {s.attempt.path = '.github/workflows/other.yml';}],
    ['conflicting optional repository field', s => {s.attempt.repository = {full_name: 'fork/EAG'};}],
    ['attempt API error', s => {s.attemptError = true;}],
    ['missing attempt response', s => {s.attempt = null;}],
    ['missing run metadata', s => {s.metadata = null;}],
    ...['id', 'run_attempt', 'head_sha', 'head_branch', 'event', 'status', 'conclusion'].map(
      field => [`missing attempt ${field}`, (s: any) => {delete s.attempt[field];}] as [string, (state: any) => void])
  ];
  for (const [name, change] of rejected) {
    test(`release gate fixed attempt: ${action} rejects ${name}`, async () => {
      await assert.rejects(authenticateFixedAttempt(action, change));
    });
  }
}
test('release gate fixed attempt: release still rejects the wrong fixed artifact ID', async () => {
  await assert.rejects(authenticateFixedAttempt('release', s => {s.artifact.id = 999;}));
});
