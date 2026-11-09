'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const excluded = new Set(['candidate-provenance.json', 'publish-package.json', 'retained-assets.json']);
const archiveName = 'package.eag.json';
const maxBytes = 512 * 1024 * 1024;

function safePath(name) {
  assert.ok(typeof name === 'string' && /^[a-zA-Z0-9_./-]+$/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..' && !part.endsWith('.') &&
      !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)), 'Unsafe archive path');
  return name;
}

function inventory(root, relative = '') {
  const stat = fs.lstatSync(root);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Package root must be a real directory');
  const files = [];
  for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
    const item = safePath(relative ? `${relative}/${name}` : name);
    const file = path.join(root, item), info = fs.lstatSync(file);
    assert.ok(!info.isSymbolicLink(), 'Symlink in package');
    if (info.isDirectory()) files.push(...inventory(file).map(row => ({...row, path: item + '/' + row.path})));
    else {
      assert.ok(info.isFile(), 'Non-file in package');
      const bytes = fs.readFileSync(file);
      files.push({path: item, size: bytes.length, sha256: sha256(bytes)});
    }
  }
  const names = files.map(row => row.path.toLowerCase());
  assert.equal(new Set(names).size, names.length, 'Case-colliding package paths');
  return files.sort((a, b) => a.path < b.path ? -1 : 1);
}

function verifyPackage(root, origin) {
  const env = {...process.env, CANDIDATE_REPOSITORY: origin.repository, CANDIDATE_SHA: origin.commitSha,
    CANDIDATE_RUN_ID: origin.runId, CANDIDATE_RUN_ATTEMPT: origin.runAttempt,
    CANDIDATE_EVENT: 'push', CANDIDATE_REF: 'refs/heads/main'};
  const result = execFileSync(process.execPath, ['--import', 'tsx', 'src/check-publish-package.ts', 'verify', '--root', root],
    {cwd: path.resolve(__dirname, '../..'), env, encoding: 'utf8', maxBuffer: 1024 * 1024});
  return JSON.parse(result.trim());
}

function snapshot(root) {
  const read = name => fs.readFileSync(path.join(root, name));
  const files = inventory(root);
  const pkg = JSON.parse(read('publish-package.json'));
  const audio = JSON.parse(read('verified-audio-assets.json'));
  const retained = JSON.parse(read('retained-assets.json'));
  const retainedRows = retained.assets.map(row => ({path: row.path, size: row.size, sha256: row.sha256})).sort((a, b) => a.path < b.path ? -1 : 1);
  return {packageId: pkg.packageId, packageManifestSha256: sha256(read('publish-package.json')),
    payloadSha256: sha256(JSON.stringify(files.filter(row => !excluded.has(row.path)))),
    releaseId: audio.releaseId, workerBuildId: audio.workerBuildId,
    audioManifestSha256: sha256(read('verified-audio-assets.json')), appManifestSha256: sha256(read('verified-app-assets.json')),
    retentionRegistrySha256: retained.registrySha256, retentionManifestSha256: sha256(read('retained-assets.json')),
    retainedAssetsSha256: sha256(JSON.stringify(retainedRows)), files: files.length,
    runtimeAssets: audio.assets.length + JSON.parse(read('verified-app-assets.json')).assets.length};
}

// A deterministic data-only archive avoids tar/zip traversal, links and extraction
// tools. No archived JavaScript is executed. Original file bytes are base64 encoded.
function validateArchiveSource(source) {
  assert.ok(source && typeof source === 'object' && !Array.isArray(source), 'Archive source required');
  assert.deepEqual(Object.keys(source).sort(), ['artifactId', 'commitSha', 'eventName', 'ref', 'repository', 'runAttempt', 'runId']);
  assert.match(source.repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  assert.match(source.commitSha, /^[a-f0-9]{40}$/);
  assert.match(source.runId, /^[1-9]\d*$/); assert.match(source.runAttempt, /^[1-9]\d*$/);
  assert.equal(source.eventName, 'push'); assert.equal(source.ref, 'refs/heads/main');
  assert.ok(Number.isSafeInteger(source.artifactId) && source.artifactId > 0, 'Fixed source artifact ID required');
}

function encodeArchive(root, source) {
  validateArchiveSource(source);
  const fixedSource = Object.fromEntries(['repository', 'commitSha', 'runId', 'runAttempt', 'eventName', 'ref', 'artifactId'].map(name => [name, source[name]]));
  const rows = inventory(root);
  assert.ok(rows.length > 0 && rows.length <= 1000, 'Invalid archive file count');
  const files = rows.map(row => ({...row, base64: fs.readFileSync(path.join(root, row.path)).toString('base64')}));
  const bytes = Buffer.from(JSON.stringify({schemaVersion: 1, format: 'eag-package-base64-v1', source: fixedSource, files}) + '\n');
  assert.ok(bytes.length <= maxBytes, 'Archive too large');
  return bytes;
}

function decodeArchive(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= maxBytes, 'Archive size/type invalid');
  const archive = JSON.parse(bytes.toString('utf8'));
  assert.deepEqual(Object.keys(archive).sort(), ['files', 'format', 'schemaVersion', 'source']);
  assert.equal(archive.schemaVersion, 1); assert.equal(archive.format, 'eag-package-base64-v1');
  validateArchiveSource(archive.source);
  assert.ok(Array.isArray(archive.files) && archive.files.length > 0 && archive.files.length <= 1000);
  const names = new Set(), bodies = [];
  let previous = '', total = 0;
  for (const row of archive.files) {
    assert.deepEqual(Object.keys(row).sort(), ['base64', 'path', 'sha256', 'size']);
    safePath(row.path);
    assert.ok(row.path > previous && !names.has(row.path.toLowerCase()), 'Unsorted/duplicate archive path');
    previous = row.path; names.add(row.path.toLowerCase());
    assert.ok(Number.isSafeInteger(row.size) && row.size >= 0 && typeof row.base64 === 'string');
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    const data = Buffer.from(row.base64, 'base64');
    assert.equal(data.toString('base64'), row.base64, 'Noncanonical base64');
    assert.equal(data.length, row.size); assert.equal(sha256(data), row.sha256, 'Archive body hash mismatch');
    total += data.length; assert.ok(total <= maxBytes);
    bodies.push({path: row.path, data});
  }
  return {source: archive.source, files: bodies};
}

function extractArchive(bytes, root) {
  const {files: bodies} = decodeArchive(bytes); // Validate all entries before writing anything.
  fs.mkdirSync(root); // Existing output, including a symlink, is rejected.
  for (const row of bodies) {
    const file = path.join(root, row.path);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, row.data, {flag: 'wx'});
  }
}

function writeArchive(root, output, source) {
  const relative = path.relative(path.resolve(root), path.resolve(output));
  assert.ok(relative && (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)),
    'Archive output must be separate from the verified package');
  const bytes = encodeArchive(root, source);
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, archiveName), bytes, {flag: 'wx'});
  fs.writeFileSync(path.join(output, archiveName + '.sha256'), sha256(bytes) + '  ' + archiveName + '\n', {flag: 'wx'});
  return {sha256: sha256(bytes), bytes};
}

function localCopy(source, destination, origin) {
  const bytes = fs.readFileSync(source);
  assert.deepEqual(decodeArchive(bytes).source, origin, 'Local archive source differs from independently supplied origin');
  fs.mkdirSync(destination);
  const copy = path.join(destination, archiveName);
  fs.writeFileSync(copy, bytes, {flag: 'wx'});
  const retrieved = fs.readFileSync(copy);
  assert.equal(sha256(retrieved), sha256(bytes));
  const root = path.join(destination, 'package');
  extractArchive(retrieved, root);
  verifyPackage(root, origin);
  const receipt = {schemaVersion: 1, archiveSha256: sha256(retrieved), packageId: snapshot(root).packageId,
    path: path.resolve(copy), verifiedAt: new Date().toISOString()};
  fs.writeFileSync(path.join(destination, 'local-copy-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  fs.writeFileSync(path.join(destination, archiveName + '.sha256'), sha256(retrieved) + '  ' + archiveName + '\n', {flag: 'wx'});
  return {receipt, receiptSha256: sha256(JSON.stringify(receipt))};
}

function parseArguments(args) {
  const [command, input, output, originFile] = args;
  assert.ok(args.length === 4 && ['archive', 'local-copy'].includes(command) && input && output && originFile,
    'Use archive <package> <new-directory> <expected-origin.json> OR local-copy <archive> <new-directory> <expected-origin.json>');
  return {command, input, output, originFile};
}

module.exports = {sha256, inventory, snapshot, verifyPackage, encodeArchive, decodeArchive, extractArchive, writeArchive, localCopy, archiveName, parseArguments};
if (require.main === module) {
  try {
    const {command, input, output, originFile} = parseArguments(process.argv.slice(2));
    const origin = JSON.parse(fs.readFileSync(originFile));
    if (command === 'archive') {
      verifyPackage(input, origin);
      const archived = writeArchive(input, output, origin);
      console.log(JSON.stringify({package: snapshot(input), archiveSha256: archived.sha256}));
    } else console.log(JSON.stringify(localCopy(input, output, origin)));
  } catch (error) { console.error('Archive BLOCKED:', error.message); process.exitCode = 1; }
}
