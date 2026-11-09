'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const approvalSchema = require('../release/approval.schema.json');
const baselineBytes = fs.readFileSync(path.join(__dirname, '../release/etcl12-l2-baseline.json'));
const baseline = JSON.parse(baselineBytes);
const digest = value => createHash('sha256').update(value).digest('hex');

// This small validator implements only the keywords used by our closed schema.
// Unknown schema keywords fail instead of silently weakening validation.
function validateSchema(value, schema, location = 'approval') {
  const supported = new Set(['$schema', 'title', 'description', 'type', 'properties', 'required', 'additionalProperties', 'const', 'enum', 'pattern', 'minimum', 'format']);
  for (const key of Object.keys(schema)) assert.ok(supported.has(key), `Unsupported schema keyword: ${key}`);
  if (schema.type === 'object') {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value), `Missing ${location}`);
    for (const name of schema.required) assert.ok(Object.hasOwn(value, name), `Missing ${location}.${name}`);
    for (const name of Object.keys(value)) {
      assert.ok(Object.hasOwn(schema.properties, name), `Unexpected ${location}.${name}`);
      validateSchema(value[name], schema.properties[name], `${location}.${name}`);
    }
  } else if (schema.type === 'integer') {
    assert.ok(Number.isSafeInteger(value) && value >= schema.minimum, `Invalid ${location}`);
  } else assert.equal(typeof value, schema.type, `Invalid ${location}`);
  if (Object.hasOwn(schema, 'const')) assert.deepEqual(value, schema.const, `Wrong ${location}`);
  if (schema.enum) assert.ok(schema.enum.includes(value), `Wrong ${location}`);
  if (schema.pattern) assert.match(value, new RegExp(schema.pattern), `Invalid ${location}`);
  if (schema.format === 'date-time') assert.ok(typeof value === 'string' && /Z$/.test(value) && Number.isFinite(Date.parse(value)), `Invalid ${location}`);
}

function validateApproval(record, now = Date.now()) {
  validateSchema(record, approvalSchema);
  assert.equal(record.status, 'APPROVED', 'DEPLOYMENT BLOCKED: no explicit approval');
  assert.equal(record.l2BaselineSha256, digest(JSON.stringify(baseline)), 'L-2 baseline mismatch');
  assert.ok(Date.parse(record.approvedAt) <= now && now < Date.parse(record.expiresAt), 'Approval missing, future-dated or expired');
  assert.ok(Date.parse(record.localCopyReceipt.verifiedAt) <= Date.parse(record.approvedAt), 'Local backup must precede approval');
  assert.equal(record.localCopyReceipt.archiveSha256, record.archiveSha256);
  assert.equal(record.localCopyReceipt.packageId, record.package.packageId);
  assert.equal(record.localCopyReceiptSha256, digest(JSON.stringify(record.localCopyReceipt)), 'Local receipt hash mismatch');
  assert.equal(record.repository, baseline.repository);
  for (const [name, expected] of Object.entries(baseline.packageIdentity)) assert.deepEqual(record.package[name], expected, `L-2 distribution changed: ${name}`);
  if (record.action === 'release') {
    assert.equal(record.executionSha, record.targetSha);
    assert.equal(record.archiveAssetId, 0); assert.equal(record.checksumAssetId, 0);
  } else {
    assert.ok(record.archiveAssetId > 0 && record.checksumAssetId > 0, 'Recovery must pin existing archive assets');
  }
  return record;
}

function validateExecution(execution, approval) {
  assert.equal(execution.eventName, 'workflow_dispatch', 'Only manual dispatch can publish');
  assert.equal(execution.ref, 'refs/heads/main');
  assert.equal(execution.repository, approval.repository);
  assert.equal(execution.sha, approval.executionSha);
  assert.equal(execution.mainSha, execution.sha, 'Dispatched commit is no longer main');
  assert.equal(execution.workflowSha, execution.sha);
  assert.equal(execution.workflowRef, `${approval.repository}/.github/workflows/deploy-pages.yml@refs/heads/main`);
  for (const role of [execution.actorPermission, execution.approverPermission]) assert.ok(['write', 'maintain', 'admin'].includes(role), 'Write permission required');
  assert.equal(execution.actor, approval.approvedBy, 'The dispatching actor must attest their own approval');
  assert.equal(execution.action, approval.action, 'Release and recovery approvals are separate');
  const confirmation = approval.action === 'release' ? `DEPLOY ${approval.targetSha}` : `RECOVER ${approval.targetSha} ${approval.archiveSha256}`;
  assert.equal(execution.confirmation, confirmation, 'Exact manual confirmation required');
}

function candidateName(sha, runId, attempt) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  for (const value of [runId, attempt]) assert.match(String(value), /^[1-9]\d*$/);
  return `eag-candidate-${sha}-${runId}-${attempt}`;
}

function validateRun(run, expected) {
  assert.match(expected.sha, /^[a-f0-9]{40}$/);
  assert.equal(expected.ref, 'refs/heads/main', 'Dispatch must use main');
  assert.equal(expected.confirmation, `DEPLOY ${expected.sha}`, 'Explicit commit confirmation required');
  assert.equal(String(run.id), expected.runId);
  assert.equal(run.repository?.full_name, expected.repository);
  assert.equal(run.head_repository?.full_name, expected.repository, 'Fork runs cannot be published');
  assert.equal(run.path, '.github/workflows/ci.yml');
  assert.equal(run.event, 'push', 'PR artifacts cannot be published');
  assert.equal(run.head_branch, 'main');
  assert.equal(run.head_sha, expected.sha);
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  return candidateName(expected.sha, run.id, run.run_attempt);
}

function validateArtifact(artifacts, name, run, now = Date.now()) {
  const matches = artifacts.filter(artifact => artifact.name === name);
  assert.equal(matches.length, 1, 'Expected exactly one candidate artifact');
  const artifact = matches[0];
  assert.equal(artifact.expired, false, 'Candidate artifact expired');
  assert.ok(Number.isFinite(Date.parse(artifact.expires_at)) && Date.parse(artifact.expires_at) > now, 'Candidate expiry invalid');
  assert.ok(Number.isSafeInteger(artifact.id) && artifact.id > 0);
  assert.equal(artifact.workflow_run?.id, run.id);
  assert.equal(artifact.workflow_run?.head_sha, run.head_sha);
  return artifact.id;
}

function assertRetentionReady(evidence) {
  assert.ok(evidence, 'DEPLOYMENT BLOCKED: approval and verified evidence required');
  const {approval, execution, run, artifact, package: observed, archive} = evidence;
  validateApproval(approval);
  validateExecution(execution, approval);
  const name = validateRun(run, {repository: approval.repository, sha: approval.targetSha,
    ref: 'refs/heads/main', runId: approval.ciRunId, confirmation: `DEPLOY ${approval.targetSha}`});
  assert.equal(String(run.run_attempt), approval.ciRunAttempt);
  // Recovery outlives Actions artifact expiry: it uses a separately approved,
  // pinned Release archive, but still authenticates its original main CI run.
  if (approval.action === 'release') assert.equal(validateArtifact([artifact], name, run), approval.artifactId);
  assert.deepEqual(observed, approval.package, 'Verified package differs from approval');
  assert.ok(archive && archive.retrieved === true && archive.packageVerified === true, 'Recovery archive missing or unverified');
  assert.equal(archive.repository, approval.repository);
  assert.ok(Number.isSafeInteger(archive.assetId) && archive.assetId > 0);
  assert.ok(Number.isSafeInteger(archive.checksumAssetId) && archive.checksumAssetId > 0);
  assert.equal(archive.sha256, approval.archiveSha256);
  assert.equal(archive.checksumSha256, approval.archiveSha256);
  assert.equal(archive.packageId, observed.packageId);
  assert.equal(archive.sourceArtifactId, approval.artifactId, 'Archived source artifact ID mismatch');
  if (approval.action === 'recover') {
    assert.equal(archive.assetId, approval.archiveAssetId);
    assert.equal(archive.checksumAssetId, approval.checksumAssetId);
  }
  return {publicationAllowed: true, action: approval.action, packageId: observed.packageId};
}

module.exports = { candidateName, validateRun, validateArtifact, validateApproval, validateExecution,
  validateSchema, assertRetentionReady, baseline, baselineSha256: digest(JSON.stringify(baseline)) };
