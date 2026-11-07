'use strict';
const assert = require('node:assert/strict');

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

function assertRetentionReady() {
  // Intentionally not controlled by workflow inputs, secrets or repository variables.
  // Replace only after the separate final audit and explicit publication approval.
  throw new Error('DEPLOYMENT BLOCKED: retained-asset packaging still requires final audit and explicit publication approval.');
}

module.exports = { candidateName, validateRun, validateArtifact, assertRetentionReady };
