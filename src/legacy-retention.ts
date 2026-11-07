import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import { sha256, validateAssetPath } from './verified-asset-manifest.js';

export const publishedSite = 'https://hiroaki-hirai.github.io/English-Audio-Generator/';
export const initialCommit = '811d93d1df635317981e9ef1b04661711ecbb10f';
export type RetainedAsset = { path: string; url: string; source: string; status: number; contentType: string;
  size: number; sha256: string; retrievedAt: string; dependencies: string[]; verification: string };
export type RetentionRecord = { schemaVersion: 1; site: string; commitSha: string;
  assurance: 'live-observation-not-independent-build-proof';
  acquisitionEvidence: string[];
  html: Omit<RetainedAsset, 'path'>; roots: string[]; assets: RetainedAsset[] };
export type RetentionCatalog = { schemaVersion: 1; records: Array<{path: string; sha256: string}> };

export function retentionPath(name: string): string {
  validateAssetPath(name);
  assert.ok(/^(?:assets|icons|fonts|images)\//.test(name), `Not a retained static resource: ${name}`);
  assert.ok(/\.(?:js|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|wasm|json)$/i.test(name), `Unsupported retained type: ${name}`);
  return name;
}

function reference(name: string, owner: string): string | null {
  if (name.startsWith('data:') || name.startsWith('#')) return null;
  assert.ok(name && !/[\\%?\s]/.test(name), `Invalid resource reference: ${name}`);
  const target = new URL(name, new URL(owner, publishedSite));
  const base = new URL(publishedSite);
  assert.equal(target.origin, base.origin, `External dependency refused: ${name}`);
  assert.ok(target.pathname.startsWith(base.pathname), `Dependency escapes base: ${name}`);
  return retentionPath(target.pathname.slice(base.pathname.length));
}

export function htmlRoots(html: string): string[] {
  assert.ok(/<!doctype html>/i.test(html) && /<html\b/i.test(html), 'Not an HTML document');
  assert.ok(!/<base\b/i.test(html), 'Unsupported HTML base');
  const roots = new Set<string>();
  for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = match[0];
    if (match[1]!.toLowerCase() === 'link' && !/\brel=["'](?:stylesheet|modulepreload)["']/i.test(tag)) continue;
    const attr = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag);
    if (!attr) { assert.ok(!/\b(?:src|href)\s*=/i.test(tag), 'Unquoted HTML dependency'); continue; }
    const name = reference(attr[1]!, 'index.html');
    assert.ok(name && /^assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(?:js|css)$/.test(name), 'Expected hashed HTML entry');
    roots.add(name);
  }
  assert.ok([...roots].some(name => name.endsWith('.js')) && [...roots].some(name => name.endsWith('.css')), 'Missing JS/CSS roots');
  return [...roots].sort();
}

export function staticDependencies(name: string, bytes: Uint8Array): string[] {
  const text = Buffer.from(bytes).toString('utf8');
  const dependencies = new Set<string>();
  const add = (value: string) => { const resolved = reference(value, name); if (resolved) dependencies.add(resolved); };
  if (name.endsWith('.js')) {
    assert.ok(!/^\s*</.test(text), 'HTML disguised as JavaScript');
    const tree = parseAst(text);
    type Node = {type: string; value?: unknown; source?: Node; callee?: Node; name?: string;
      arguments?: Node[]; start: number; end: number; [key: string]: unknown};
    const literal = (node: Node | undefined): node is Node & {value: string} =>
      node?.type === 'Literal' && typeof node.value === 'string';
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const node = value as Node;
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) {
        assert.ok(literal(node.source), 'Computed module dependency'); add(node.source.value);
      }
      if (node.type === 'ImportExpression') {
        assert.ok(literal(node.source), 'Computed import requires review'); add(node.source.value);
      }
      if (node.type === 'NewExpression' && node.callee?.name === 'URL' && node.arguments?.[1] &&
          text.slice(node.arguments[1].start, node.arguments[1].end).replace(/\s/g, '') === 'import.meta.url') {
        assert.ok(literal(node.arguments[0]), 'Computed static URL requires review'); add(node.arguments[0].value);
      }
      // Vite preload maps hold emitted dependency URLs outside import expressions.
      if (literal(node) && /^(?:\/English-Audio-Generator\/)?assets\/[^?#]+\.(?:js|css|png|svg|woff2?|wasm)$/.test(node.value)) {
        add(node.value.startsWith('/') ? node.value : '/English-Audio-Generator/' + node.value);
      }
      Object.values(node).forEach(visit);
    };
    visit(tree);
  } else if (name.endsWith('.css')) {
    assert.ok(!/<(?:html|!doctype)\b/i.test(text) && (text.includes('{') || /@import\s/i.test(text)), 'Invalid CSS');
    for (const match of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)|@import\s+["']([^"']+)["']/gi)) {
      add(match[1] ?? match[2] ?? match[3] ?? match[4]!);
    }
  }
  return [...dependencies].sort();
}

export function checkContentType(name: string, type: string): void {
  const mime = type.split(';')[0]!.trim().toLowerCase();
  const valid = name.endsWith('.html') ? mime === 'text/html' : name.endsWith('.js')
    ? ['text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript'].includes(mime)
    : name.endsWith('.css') ? mime === 'text/css'
    : /\.(?:png|jpe?g|gif|svg|webp|avif|ico)$/.test(name) ? mime.startsWith('image/')
    : /\.(?:woff2?|ttf|otf)$/.test(name) ? mime.startsWith('font/') || ['application/font-woff', 'application/vnd.ms-fontobject'].includes(mime)
    : name.endsWith('.wasm') ? mime === 'application/wasm' : name.endsWith('.json') && mime === 'application/json';
  assert.ok(valid, `Unexpected Content-Type for ${name}: ${type}`);
}

export async function capturePublished(commitSha: string, request: typeof fetch = fetch) {
  assert.match(commitSha, /^[a-f0-9]{40}$/);
  const bodies = new Map<string, Buffer>();
  const read = async (name: string) => {
    const url = name === 'index.html' ? publishedSite : new URL(name, publishedSite).href;
    const response = await request(url, {cache: 'no-store', redirect: 'error'});
    assert.equal(response.status, 200, `Resource unavailable: ${url}`);
    assert.ok(!response.headers.has('content-range') && response.type !== 'opaque', 'Incomplete observation');
    const contentType = response.headers.get('content-type') ?? '';
    checkContentType(name, contentType);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length, `Empty observation: ${url}`);
    bodies.set(name, bytes);
    return {url, source: 'live-github-pages', status: response.status, contentType,
      size: bytes.length, sha256: sha256(bytes), retrievedAt: new Date().toISOString(),
      dependencies: [] as string[], verification: 'HTTP headers, exact bytes and static dependency graph; not independent original-build proof'};
  };
  const html = await read('index.html'), roots = htmlRoots(bodies.get('index.html')!.toString('utf8'));
  const pending = [...roots], assets: RetainedAsset[] = [], seen = new Set<string>();
  while (pending.length) {
    const name = retentionPath(pending.shift()!);
    if (seen.has(name)) continue;
    assert.ok(![...seen].some(old => old.toLowerCase() === name.toLowerCase()), 'Case-colliding resources');
    seen.add(name);
    const record = await read(name), dependencies = staticDependencies(name, bodies.get(name)!);
    pending.push(...dependencies);
    assets.push({path: name, ...record, dependencies});
  }
  assets.sort((a, b) => a.path < b.path ? -1 : 1);
  const record: RetentionRecord = {schemaVersion: 1, site: publishedSite, commitSha,
    assurance: 'live-observation-not-independent-build-proof', acquisitionEvidence: [], html, roots, assets};
  return {record, bodies};
}

async function safeRead(root: string, name: string): Promise<Buffer> {
  validateAssetPath(name);
  const base = await realpath(root), target = await realpath(path.join(base, name));
  const relative = path.relative(base, target);
  assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), 'Retention path escapes root');
  assert.ok((await lstat(target)).isFile(), 'Not a retained file');
  return readFile(target);
}

async function storedPaths(root: string, relative = ''): Promise<string[]> {
  const files: string[] = [];
  for (const name of await readdir(path.join(root, relative))) {
    const child = relative ? `${relative}/${name}` : name;
    const info = await lstat(path.join(root, child));
    assert.ok(!info.isSymbolicLink(), 'Symlink in retention store');
    if (info.isDirectory()) files.push(...await storedPaths(root, child));
    else { assert.ok(info.isFile()); files.push(child); }
  }
  return files.sort();
}

export async function verifyRetention(root: string) {
  const catalog = JSON.parse((await safeRead(root, 'catalog.json')).toString('utf8')) as RetentionCatalog;
  assert.equal(catalog.schemaVersion, 1); assert.ok(catalog.records.length > 0, 'Empty retention registry');
  const files = new Map<string, {asset: RetainedAsset; bytes: Buffer; generations: string[]}>();
  const generations: Array<{recordPath: string; recordSha256: string; commitSha: string}> = [];
  const seenRecords = new Set<string>();
  for (const item of catalog.records) {
    validateAssetPath(item.path); assert.ok(!seenRecords.has(item.path.toLowerCase()), 'Duplicate retention record'); seenRecords.add(item.path.toLowerCase());
    const raw = await safeRead(root, item.path); assert.equal(sha256(raw), item.sha256, 'Retention record tampered');
    const record = JSON.parse(raw.toString('utf8')) as RetentionRecord;
    assert.equal(record.schemaVersion, 1); assert.equal(record.site, publishedSite);
    assert.match(record.commitSha, /^[a-f0-9]{40}$/);
    assert.equal(record.assurance, 'live-observation-not-independent-build-proof');
    const folder = path.posix.dirname(item.path), html = await safeRead(root, folder + '/evidence/index.html');
    assert.equal(record.html.status, 200); checkContentType('index.html', record.html.contentType);
    assert.equal(record.html.url, publishedSite); assert.equal(sha256(html), record.html.sha256); assert.equal(html.length, record.html.size);
    assert.ok(Number.isFinite(Date.parse(record.html.retrievedAt)));
    assert.deepEqual(htmlRoots(html.toString('utf8')), record.roots);
    const listed = new Map<string, RetainedAsset>();
    for (const asset of record.assets) {
      retentionPath(asset.path); assert.ok(!listed.has(asset.path.toLowerCase()), 'Duplicate retained path');
      listed.set(asset.path.toLowerCase(), asset);
      assert.equal(asset.url, new URL(asset.path, publishedSite).href);
      assert.equal(asset.source, 'live-github-pages'); assert.equal(asset.status, 200);
      assert.ok(Number.isFinite(Date.parse(asset.retrievedAt))); checkContentType(asset.path, asset.contentType);
      const bytes = await safeRead(root, folder + '/files/' + asset.path);
      assert.equal(bytes.length, asset.size); assert.equal(sha256(bytes), asset.sha256, 'Retained bytes mismatch');
      assert.deepEqual(staticDependencies(asset.path, bytes), asset.dependencies);
      const old = [...files.entries()].find(([name]) => name.toLowerCase() === asset.path.toLowerCase());
      if (old) { assert.equal(old[0], asset.path, 'Case-colliding retention path'); assert.equal(old[1].asset.sha256, asset.sha256, `Retention collision: ${asset.path}`); old[1].generations.push(record.commitSha); }
      else files.set(asset.path, {asset, bytes, generations: [record.commitSha]});
    }
    const reachable = new Set<string>();
    const visit = (name: string) => {
      if (reachable.has(name)) return;
      const asset = listed.get(name.toLowerCase()); assert.ok(asset && asset.path === name, `Missing dependency: ${name}`);
      reachable.add(name); asset.dependencies.forEach(visit);
    };
    record.roots.forEach(visit); assert.equal(reachable.size, record.assets.length, 'Unknown resource in retention record');
    assert.deepEqual(await storedPaths(path.join(root, folder, 'files')), record.assets.map(asset => asset.path).sort(), 'Unlisted retained files');
    generations.push({recordPath: item.path, recordSha256: item.sha256, commitSha: record.commitSha});
  }
  return {files, generations};
}

export async function saveObservation(root: string, captured: Awaited<ReturnType<typeof capturePublished>>) {
  // All remote fetches and dependency checks have completed before any registry write.
  assert.match(captured.record.commitSha, /^[a-f0-9]{40}$/);
  for (const name of captured.bodies.keys()) if (name !== 'index.html') retentionPath(name);
  await mkdir(root, {recursive: false});
  const folder = `releases/${captured.record.commitSha}`;
  for (const [name, bytes] of captured.bodies) {
    const target = name === 'index.html' ? `${folder}/evidence/index.html` : `${folder}/files/${retentionPath(name)}`;
    await mkdir(path.dirname(path.join(root, target)), {recursive: true});
    await writeFile(path.join(root, target), bytes, {flag: 'wx'});
  }
  const recordPath = folder + '/record.json', raw = JSON.stringify(captured.record, null, 2) + '\n';
  await writeFile(path.join(root, recordPath), raw, {flag: 'wx'});
  const catalog: RetentionCatalog = {schemaVersion: 1, records: [{path: recordPath, sha256: sha256(raw)}]};
  await writeFile(path.join(root, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n', {flag: 'wx'});
  return verifyRetention(root);
}

export async function mergeRetentionStores(output: string, sources: string[]) {
  assert.ok(sources.length >= 2, 'Merge requires existing and newly observed stores');
  const records = new Map<string, {raw: Buffer; html: Buffer; files: Map<string, Buffer>}>();
  const publicHashes = new Map<string, {path: string; hash: string}>();
  for (const source of sources) {
    const relative = path.relative(path.resolve(source), path.resolve(output));
    assert.ok(relative && (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)), 'Merge output must be separate');
    const verified = await verifyRetention(source);
    for (const [name, file] of verified.files) {
      const old = publicHashes.get(name.toLowerCase());
      if (old) {
        assert.equal(old.path, name, 'Case-colliding merge path');
        assert.equal(old.hash, file.asset.sha256, `Retention merge collision: ${name}`);
      }
      publicHashes.set(name.toLowerCase(), {path: name, hash: file.asset.sha256});
    }
    for (const generation of verified.generations) {
      const raw = await safeRead(source, generation.recordPath), record = JSON.parse(raw.toString('utf8')) as RetentionRecord;
      const folder = path.posix.dirname(generation.recordPath), files = new Map<string, Buffer>();
      for (const asset of record.assets) files.set(asset.path, await safeRead(source, folder + '/files/' + asset.path));
      records.set(generation.recordSha256, {raw, html: await safeRead(source, folder + '/evidence/index.html'), files});
    }
  }
  await mkdir(output, {recursive: false});
  const catalog: RetentionCatalog = {schemaVersion: 1, records: []};
  for (const [hash, record] of [...records].sort(([a], [b]) => a < b ? -1 : 1)) {
    const folder = `snapshots/${hash}`;
    const bodies = new Map([['record.json', record.raw], ['evidence/index.html', record.html],
      ...[...record.files].map(([name, bytes]) => ['files/' + name, bytes] as [string, Buffer])]);
    for (const [name, bytes] of bodies) {
      await mkdir(path.dirname(path.join(output, folder, name)), {recursive: true});
      await writeFile(path.join(output, folder, name), bytes, {flag: 'wx'});
    }
    catalog.records.push({path: folder + '/record.json', sha256: hash});
  }
  await writeFile(path.join(output, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n', {flag: 'wx'});
  return verifyRetention(output);
}
