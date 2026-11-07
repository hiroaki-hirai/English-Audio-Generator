import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { capturePublished, htmlRoots, staticDependencies, retentionPath, publishedSite,
  saveObservation, verifyRetention, mergeRetentionStores } from './legacy-retention.js';

const html = '<!doctype html><html><script type="module" src="/English-Audio-Generator/assets/index-abcdef.js"></script><link rel="stylesheet" href="/English-Audio-Generator/assets/index-abcdef.css"></html>';
function mocked(files: Record<string, string> = {}, status = 200, badType = false): typeof fetch {
  const bodies: Record<string, string> = {'index.html': html, 'assets/index-abcdef.js': 'console.log("old");',
    'assets/index-abcdef.css': 'body{color:red}', ...files};
  return (async (input: unknown) => {
    const url = String(input);
    assert.ok(url.startsWith(publishedSite), 'Never fetch outside the published site');
    const name = url.slice(publishedSite.length) || 'index.html';
    const type = name.endsWith('.html') ? 'text/html' : name.endsWith('.js') ? 'application/javascript' : 'text/css';
    return new Response(bodies[name] ?? 'missing', {status: bodies[name] === undefined ? 404 : status,
      headers: {'content-type': badType ? 'text/html' : type}});
  }) as typeof fetch;
}
async function temporary(action: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'eag-retention-test-'));
  try { await action(root); } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('eag-retention-test-'));
    await rm(root, {recursive: true, force: true});
  }
}

test('extracts hashed HTML roots and JS/CSS static dependencies without executing assets', () => {
  assert.deepEqual(htmlRoots(html), ['assets/index-abcdef.css', 'assets/index-abcdef.js']);
  assert.deepEqual(staticDependencies('assets/index-abcdef.js', Buffer.from(
    'import "./chunk-abcdef.js"; export * from "./other-abcdef.js"; import("./lazy-abcdef.js"); new URL("../images/logo.svg",import.meta.url);')),
    ['assets/chunk-abcdef.js', 'assets/lazy-abcdef.js', 'assets/other-abcdef.js', 'images/logo.svg']);
  assert.deepEqual(staticDependencies('assets/index-abcdef.css', Buffer.from(
    '@import "./extra-abcdef.css"; @font-face{src:url(../fonts/test.woff2)} a{background:url(data:image/png;base64,AA)}')),
    ['assets/extra-abcdef.css', 'fonts/test.woff2']);
  assert.deepEqual(staticDependencies('assets/index-abcdef.css', Buffer.from('@import "./extra-abcdef.css";')), ['assets/extra-abcdef.css']);
  assert.throws(() => staticDependencies('assets/index-abcdef.js', Buffer.from('import(variable)')), /Computed import/);
});

test('rejects unsafe paths, external URLs and root files before fetching them', async () => {
  for (const name of ['../assets/a.js', '/assets/a.js', 'assets/../../x.js', 'sw.js', 'index.html', 'verified-app-assets.json', 'assets/%2e.js']) {
    assert.throws(() => retentionPath(name));
  }
  for (const url of ['https://evil.example/a.js', '//evil.example/a.js', '/outside/assets/a.js']) {
    assert.throws(() => htmlRoots(html.replace('/English-Audio-Generator/assets/index-abcdef.js', url)));
    await assert.rejects(capturePublished('a'.repeat(40), mocked({'assets/index-abcdef.js': `import "${url}";`})));
  }
});

test('capture fails closed for HTTP404, partial responses, incorrect MIME and missing dependencies', async () => {
  await assert.rejects(capturePublished('a'.repeat(40), mocked({}, 404)), /unavailable/);
  await assert.rejects(capturePublished('a'.repeat(40), mocked({}, 206)), /unavailable/);
  await assert.rejects(capturePublished('a'.repeat(40), mocked({}, 200, true)), /Content-Type/);
  await assert.rejects(capturePublished('a'.repeat(40), mocked({'assets/index-abcdef.js': 'import "./missing.js";'})), /unavailable/);
  await assert.rejects(capturePublished('a'.repeat(40), mocked({'assets/index-abcdef.js': '<html>fallback</html>'})), /disguised/);
});

test('stored observations preserve exact bytes and refuse missing, modified, extra files and record tampering', async () => temporary(async root => {
  const captured = await capturePublished('a'.repeat(40), mocked());
  const store = path.join(root, 'store');
  const verified = await saveObservation(store, captured);
  assert.equal(verified.files.size, 2);
  await assert.rejects(saveObservation(store, captured), /EEXIST/);
  const folder = path.join(store, 'releases', 'a'.repeat(40));
  const asset = path.join(folder, 'files/assets/index-abcdef.js'), original = await readFile(asset);
  await rm(asset); await assert.rejects(verifyRetention(store));
  await writeFile(asset, 'tampered'); await assert.rejects(verifyRetention(store));
  await writeFile(asset, original);
  const extra = path.join(folder, 'files/assets/unknown.js');
  await writeFile(extra, 'extra'); await assert.rejects(verifyRetention(store), /Unlisted/); await rm(extra);
  const record = path.join(folder, 'record.json'), before = await readFile(record);
  await writeFile(record, Buffer.concat([before, Buffer.from(' ')]));
  await assert.rejects(verifyRetention(store), /tampered/);
  await writeFile(record, before);
  assert.equal((await verifyRetention(store)).files.size, 2);
}));

test('merging keeps all generations deterministically, allows identical bytes and rejects differing bytes', async () => temporary(async root => {
  const a = path.join(root, 'a'), b = path.join(root, 'b'), c = path.join(root, 'c');
  await saveObservation(a, await capturePublished('a'.repeat(40), mocked()));
  const nextHtml = html.replaceAll('index-abcdef', 'index-bcdefg');
  await saveObservation(b, await capturePublished('b'.repeat(40), mocked({'index.html': nextHtml,
    'assets/index-bcdefg.js': 'console.log("new")', 'assets/index-bcdefg.css': 'body{color:blue}'})));
  const first = path.join(root, 'first'), second = path.join(root, 'second');
  const combined = await mergeRetentionStores(first, [a, b]);
  assert.equal(combined.files.size, 4); assert.equal(combined.generations.length, 2);
  await mergeRetentionStores(second, [b, a]);
  assert.deepEqual(await readFile(path.join(first, 'catalog.json')), await readFile(path.join(second, 'catalog.json')));
  assert.equal((await mergeRetentionStores(path.join(root, 'same'), [a, a])).files.size, 2);
  await saveObservation(c, await capturePublished('c'.repeat(40), mocked({'assets/index-abcdef.js': 'different()'})));
  await assert.rejects(mergeRetentionStores(path.join(root, 'conflict'), [a, c]), /collision/);
  await assert.rejects(mergeRetentionStores(first, [a, b]), /EEXIST/);
}));

test('actual published snapshot is independently rehashed and explicitly marked as an observation', async () => {
  const result = await verifyRetention('retained-assets');
  assert.equal(result.files.size, 2);
  assert.equal([...result.files.values()].reduce((n, file) => n + file.bytes.length, 0), 45897);
  const record = JSON.parse(await readFile(path.join('retained-assets', result.generations[0]!.recordPath), 'utf8'));
  assert.equal(record.assurance, 'live-observation-not-independent-build-proof');
  assert.ok(record.acquisitionEvidence.length > 0);
});
