import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { bindVerifiedWorker, type VerifiedAssetManifest } from './verified-asset-manifest.js';

const scope = 'https://example.test/EAG/';
const marker = scope + '__eag_verified_complete__';
const hash = (body: string) => createHash('sha256').update(body).digest('hex');
const key = (request: Request | string) => typeof request === 'string' ? request : request.url;

class MemoryCache {
  readonly entries = new Map<string, Response>();
  writes = 0;
  constructor(readonly store: MemoryStorage, readonly name: string) {}
  async match(request: Request | string) { return this.entries.get(key(request))?.clone(); }
  async put(request: Request | string, response: Response) {
    this.store.puts += 1;
    if (this.store.failAt !== null && this.store.puts >= this.store.failAt) throw new Error('QuotaExceededError / interrupted write');
    this.writes += 1;
    this.entries.set(key(request), response.clone());
  }
  async delete(request: Request | string) { return this.entries.delete(key(request)); }
}
class MemoryStorage {
  readonly values = new Map<string, MemoryCache>();
  puts = 0;
  failAt: number | null = null;
  deleted: string[] = [];
  async keys() { return [...this.values.keys()]; }
  async open(name: string) {
    if (!this.values.has(name)) this.values.set(name, new MemoryCache(this, name));
    return this.values.get(name)!;
  }
  async delete(name: string) { this.deleted.push(name); return this.values.delete(name); }
  async match() { throw new Error('Global caches.match must never be used'); }
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture(audioBody?: string) {
  const bodies = new Map<string, string>();
  const lessons = JSON.parse(await readFile('web/src/training-lessons.json', 'utf8')) as Array<{id: string; phrases: unknown[]}>;
  const audioNames = lessons.flatMap(lesson => [
    ...['lesson.mp3', 'continuous-training.mp3', 'metadata.json'].map(file => `lessons/${lesson.id}/${file}`),
    ...lesson.phrases.map((_, index) => `lessons/${lesson.id}/japanese-cues/phrase-${String(index + 1).padStart(3, '0')}.mp3`),
  ]);
  const appNames = ['assets/main.js', 'assets/main.css', 'icons/apple.png', 'icons/192.png', 'icons/512.png',
    'index.html', 'manifest.webmanifest', 'sw.js', 'training-audio-assets.js'];
  for (const name of [...audioNames, ...appNames]) bodies.set(name, name.endsWith('.mp3') && audioBody !== undefined ? audioBody : 'body:' + name);
  bodies.set('index.html', '<link rel="stylesheet" href="/EAG/assets/main.css"><link rel="manifest" href="/EAG/manifest.webmanifest"><script src="/EAG/assets/main.js"></script>');
  const source = await readFile('web/public/sw.js', 'utf8');
  bodies.set('sw.js', source);
  const manifest = (kind: 'audio' | 'app', names: string[]): VerifiedAssetManifest => ({
    schemaVersion: 1, kind, basePath: '/EAG/', releaseId: '0'.repeat(64),
    assets: [...names].sort().map(name => ({ path: name, url: '/EAG/' + name,
      size: Buffer.byteLength(bodies.get(name)!), sha256: hash(bodies.get(name)!) })),
  });
  const bound = bindVerifiedWorker({ audio: manifest('audio', audioNames), app: manifest('app', appNames) }, source);
  bodies.set('sw.js', bound.workerSource);
  return { ...bound, bodies, audioNames, appNames };
}

function harness(f: Fixture, storage = new MemoryStorage(), updating = true) {
  const listeners = new Map<string, (event: any) => void>();
  const requests: Request[] = [];
  let claims = 0, skips = 0;
  const registration = { scope, active: updating ? { state: 'activated' } : null,
    waiting: null as { state: string } | null };
  let network: (request: Request) => Promise<Response> = async request => {
    const name = new URL(request.url).pathname.slice('/EAG/'.length);
    if (name === 'verified-audio-assets.json') return Response.json(f.audio);
    if (name === 'verified-app-assets.json') return Response.json(f.app);
    const body = f.bodies.get(name);
    return body === undefined ? new Response('not found', {status: 404}) : new Response(body, { headers: { 'Content-Type': name.endsWith('.mp3') ? 'audio/mpeg' : 'text/plain' } });
  };
  const rangeResponse = runInNewContext(f.workerSource + '\ncreateRangeResponse;', {
    URL, Request, Response, TextEncoder, Uint8Array, crypto: webcrypto,
    self: { registration,
      clients: { claim: async () => { claims++; } }, skipWaiting: async () => { skips++; },
      addEventListener: (type: string, listener: (event: any) => void) => listeners.set(type, listener) },
    caches: storage,
    fetch: async (value: Request | string) => { const request = typeof value === 'string' ? new Request(value) : value; requests.push(request); return network(request); },
  });
  const lifecycle = async (type: string) => {
    let pending: Promise<void> | undefined;
    listeners.get(type)!({ waitUntil: (promise: Promise<void>) => { pending = promise; } });
    assert.ok(pending); await pending;
  };
  return {
    storage, requests, rangeResponse, registration,
    async install() {
      await lifecycle('install');
      registration.waiting = { state: 'installed' };
    },
    async activate() {
      // The browser promotes waiting to active before dispatching activate.
      registration.active = { state: 'activating' };
      registration.waiting = null;
      await lifecycle('activate');
      registration.active = { state: 'activated' };
    },
    setNetwork: (handler: typeof network) => { network = handler; },
    async fetch(name: string, headers: Record<string, string> = {}) {
      let pending: Promise<Response> | undefined;
      listeners.get('fetch')!({ request: new Request(scope + name, { headers }), respondWith: (promise: Promise<Response>) => { pending = promise; } });
      assert.ok(pending); return pending;
    },
    isIntercepted(url: string) {
      let intercepted = false;
      listeners.get('fetch')!({request: new Request(url, {headers: {Range: 'bytes=0-3'}}),
        respondWith: () => { intercepted = true; }});
      return intercepted;
    },
    claims: () => claims, skips: () => skips,
  };
}
async function generation(storage: MemoryStorage) {
  const names = (await storage.keys()).filter(name => name.startsWith('eag-verified-'));
  assert.equal(names.length, 1);
  return storage.open(names[0]!);
}
async function seedV8(f: Fixture, storage: MemoryStorage) {
  const cache = await storage.open('eag-training-v8');
  for (const name of f.audioNames.filter(name => !name.includes('/etcl-'))) {
    cache.entries.set(scope + name, new Response(f.bodies.get(name)!));
  }
  return cache;
}

test('fresh install verifies all 222 assets and all 153 cues without claiming the initial page', async () => {
  const f = await fixture(), h = harness(f, undefined, false);
  await h.install();
  const cache = await generation(h.storage);
  assert.equal(cache.entries.size, 223);
  assert.equal([...cache.entries.keys()].filter(url => url.includes('/japanese-cues/')).length, 153);
  assert.ok(await cache.match(marker));
  assert.equal(h.claims(), 0); assert.equal(h.skips(), 0);
  assert.equal(h.registration.active, null);
  assert.equal(h.registration.waiting?.state, 'installed');
  await h.activate(); assert.equal(h.claims(), 0);
  assert.deepEqual(h.registration.active, { state: 'activated' });
  assert.equal(h.requests.filter(r => r.url.endsWith('-assets.json')).length, 2);
  assert.ok(h.requests.every(r => r.cache === 'no-store' && !r.headers.has('Range') && r.method === 'GET'));
});

test('v8 migration reuses all 85 old cues, fetches ETCL 36 paths and 68 cues, and keeps old/unrelated caches', async () => {
  const f = await fixture(), storage = new MemoryStorage(), old = await seedV8(f, storage);
  await storage.open('another-application');
  const h = harness(f, storage);
  await h.install(); await h.activate();
  const assetRequests = h.requests.map(r => r.url).filter(url => !url.endsWith('-assets.json'));
  assert.equal(assetRequests.filter(url => url.includes('/etcl-') && !url.includes('/japanese-cues/')).length, 36);
  assert.equal(assetRequests.filter(url => url.includes('/etcl-') && url.includes('/japanese-cues/')).length, 68);
  assert.equal(assetRequests.length, 113);
  assert.equal(old.writes, 0); assert.equal(old.entries.size, 109);
  assert.equal(h.claims(), 0); assert.equal(h.skips(), 0);
  assert.deepEqual(storage.deleted, []);
  const cache = await generation(storage);
  assert.equal([...cache.entries.keys()].filter(url => url.includes('/japanese-cues/')).length, 153);
  // Restarted worker validates all bodies, not just its marker, without network access.
  const restarted = harness(f, storage);
  restarted.setNetwork(async () => { throw Error('offline'); });
  await restarted.activate();
  assert.equal(await (await restarted.fetch('')).text(), f.bodies.get('index.html'));
  assert.equal(await (await restarted.fetch('assets/main.js')).text(), f.bodies.get('assets/main.js'));
  assert.equal(await (await restarted.fetch('lessons/basic-delivery/japanese-cues/phrase-001.mp3')).text(), f.bodies.get('lessons/basic-delivery/japanese-cues/phrase-001.mp3'));
});

for (const failure of ['404', '206', 'network', 'size', 'sha', 'opaque', 'content-range', 'vary-range'] as const) {
  test(`failed ${failure} asset preserves v8 and never completes or exposes a staging cache`, async () => {
    const f = await fixture(), storage = new MemoryStorage(), old = await seedV8(f, storage);
    const h = harness(f, storage);
    const name = f.audioNames.find(name => name.includes('/etcl-'))!;
    h.setNetwork(async request => {
      if (request.url.endsWith('verified-audio-assets.json')) return Response.json(f.audio);
      if (request.url.endsWith('verified-app-assets.json')) return Response.json(f.app);
      if (request.url === scope + name) {
        if (failure === 'network') throw Error('disconnected');
        if (failure === '404' || failure === '206') return new Response('bad', {status: Number(failure)});
        if (failure === 'size') return new Response('x');
        if (failure === 'sha') return new Response('x'.repeat(Buffer.byteLength(f.bodies.get(name)!)));
        if (failure === 'opaque') { const r = new Response(f.bodies.get(name)); Object.defineProperty(r, 'type', {value: 'opaque'}); return r; }
        return new Response(f.bodies.get(name), {headers: failure === 'content-range' ? {'Content-Range': 'bytes 0-1/100'} : {'Vary': 'Range'}});
      }
      return new Response(f.bodies.get(new URL(request.url).pathname.slice(5)));
    });
    await assert.rejects(h.install());
    assert.equal(await (await generation(storage)).match(marker), undefined);
    assert.equal(old.writes, 0); assert.deepEqual(storage.deleted, []);
    const restarted = harness(f, storage);
    restarted.setNetwork(async () => new Response('network-only'));
    assert.equal(await (await restarted.fetch('lessons/basic-delivery/lesson.mp3')).text(), 'network-only');
    await assert.rejects(restarted.activate(), /No complete generation/);
  });
}

for (const mutation of ['schema', 'kind', 'base', 'release', 'build', 'duplicate', 'traversal', 'size', 'sha', 'missing'] as const) {
  test(`rejects ${mutation} manifest before modifying old caches`, async () => {
    const f = await fixture(), h = harness(f);
    if (mutation === 'schema') f.audio.schemaVersion = 2 as 1;
    if (mutation === 'kind') f.audio.kind = 'app';
    if (mutation === 'base') f.audio.basePath = '/other/';
    if (mutation === 'release') f.app.releaseId = '1'.repeat(64);
    if (mutation === 'build') f.app.workerBuildId = '1'.repeat(64);
    if (mutation === 'duplicate') f.audio.assets.push(f.audio.assets[0]!);
    if (mutation === 'traversal') f.audio.assets[0]!.path = '../escape';
    if (mutation === 'size') f.audio.assets[0]!.size = -1;
    if (mutation === 'sha') f.audio.assets[0]!.sha256 = 'invalid';
    if (mutation === 'missing') h.setNetwork(async () => new Response('', {status: 404}));
    await assert.rejects(h.install()); assert.equal(h.skips(), 0); assert.equal(h.claims(), 0);
    assert.deepEqual(h.storage.deleted, []);
  });
}

test('interrupted/quota-limited install resumes only reverified files and rejects marker-only completion', async () => {
  const f = await fixture(), storage = new MemoryStorage(), old = await seedV8(f, storage);
  storage.failAt = 145;
  await assert.rejects(harness(f, storage).install(), /QuotaExceededError/);
  const cache = await generation(storage);
  assert.equal(await cache.match(marker), undefined);
  const before = cache.entries.size;
  assert.ok(before > 0);
  const corruptUrl = [...cache.entries.keys()][0]!;
  cache.entries.set(corruptUrl, new Response('corrupt partial copy'));
  storage.failAt = null;
  const retry = harness(f, storage);
  await retry.install(); await retry.activate();
  assert.ok(retry.requests.length < 115);
  assert.ok(await cache.match(marker)); assert.equal(old.writes, 0);
  cache.entries.delete(scope + 'assets/main.js');
  const restart = harness(f, storage);
  await assert.rejects(restart.activate(), /No complete generation/);
  restart.setNetwork(async () => { throw Error('offline'); });
  await assert.rejects(restart.fetch('lessons/basic-delivery/lesson.mp3'));
});

test('waiting release never changes the active worker shell; normal Japanese and English Range behavior is retained', async () => {
  const f = await fixture(), storage = new MemoryStorage(), active = harness(f, storage);
  await active.install(); await active.activate();
  const oldCache = await generation(storage);
  const next = await fixture();
  next.bodies.set('assets/main.js', 'new application');
  next.app.assets.find(a => a.path === 'assets/main.js')!.sha256 = hash('new application');
  next.app.assets.find(a => a.path === 'assets/main.js')!.size = Buffer.byteLength('new application');
  const rebound = bindVerifiedWorker(next, next.workerSource);
  Object.assign(next, rebound); next.bodies.set('sw.js', next.workerSource);
  const waiting = harness(next, storage);
  await waiting.install();
  assert.equal(waiting.requests.length, 4); // Two manifests plus changed JS and Worker only.
  assert.equal(waiting.claims(), 0); assert.equal(waiting.skips(), 0);
  assert.equal(await (await active.fetch('assets/main.js')).text(), f.bodies.get('assets/main.js'));
  assert.equal(await (await active.fetch('?resume=1')).text(), f.bodies.get('index.html'));
  assert.ok(await oldCache.match(marker));
  for (const range of [false, true]) {
    const japanese = 'lessons/basic-delivery/japanese-cues/phrase-001.mp3';
    active.setNetwork(async () => new Response('online Japanese', {status: range ? 206 : 200}));
    const response = await active.fetch(japanese, range ? {Range: 'bytes=0-3'} : {});
    assert.equal(await response.text(), range ? f.bodies.get(japanese)!.slice(0, 4) : 'online Japanese');
    assert.equal(response.status, range ? 206 : 200);
    assert.equal(await (await oldCache.match(scope + japanese))!.text(), f.bodies.get(japanese));
  }
  active.setNetwork(async () => { throw Error('offline'); });
  const english = 'lessons/basic-delivery/lesson.mp3';
  const partial = await active.fetch(english, {Range: 'bytes=0-3'});
  assert.equal(partial.status, 206); assert.equal(await partial.text(), f.bodies.get(english)!.slice(0, 4));
  assert.equal(partial.headers.get('Content-Range'), `bytes 0-3/${Buffer.byteLength(f.bodies.get(english)!)}`);
  const suffix = await active.fetch(english, {Range: 'bytes=-4'});
  assert.equal(suffix.status, 206); assert.equal(await suffix.text(), f.bodies.get(english)!.slice(-4));
});

test('worker binding rejects changed source and HTML dependencies omitted from the release', async () => {
  const f = await fixture();
  f.bodies.set('sw.js', f.workerSource + '\n// changed deployment');
  await assert.rejects(harness(f).install(), /Unverified asset/);
  const missing = await fixture();
  missing.app.assets = missing.app.assets.filter(asset => asset.path !== 'assets/main.css');
  const rebound = bindVerifiedWorker(missing, missing.workerSource);
  Object.assign(missing, rebound); missing.bodies.set('sw.js', missing.workerSource);
  await assert.rejects(harness(missing).install(), /HTML dependency/);
});

test('invalid v8 candidates are fetched again without modifying their source cache', async () => {
  const f = await fixture(), storage = new MemoryStorage(), old = await seedV8(f, storage);
  const bad = ['lessons/basic-delivery/lesson.mp3', 'lessons/basic-delivery/japanese-cues/phrase-001.mp3'];
  old.entries.set(scope + bad[0], new Response('partial', {status: 206}));
  old.entries.set(scope + bad[1], new Response('wrong hash'));
  const h = harness(f, storage);
  await h.install();
  assert.ok(bad.every(name => h.requests.some(request => request.url === scope + name)));
  assert.equal(old.writes, 0);
  assert.equal((await old.match(scope + bad[0]))!.status, 206);
});

test('marker save failure remains incomplete and retry finishes without downloading verified bodies', async () => {
  const f = await fixture(), storage = new MemoryStorage();
  storage.failAt = 223; // All 222 required asset writes succeeded; the final marker fails.
  await assert.rejects(harness(f, storage).install(), /QuotaExceededError/);
  const cache = await generation(storage);
  assert.equal(cache.entries.size, 222); assert.equal(await cache.match(marker), undefined);
  storage.failAt = null;
  const retry = harness(f, storage);
  await retry.install(); assert.equal(retry.requests.length, 2);
  const writes = cache.writes;
  await harness(f, storage).install();
  assert.equal(cache.writes, writes); // A fully verified identical release is read-only.
});

test('A to B to cached A recovery never claims clients using a historical firstInstall flag', async () => {
  const a = await fixture(), storage = new MemoryStorage(), initial = harness(a, storage, false);
  await initial.install(); await initial.activate();
  assert.equal(initial.claims(), 0); assert.equal(initial.skips(), 0);
  const cacheA = await generation(storage);
  // A real legacy marker can retain true even after this registration has updated.
  const record = await (await cacheA.match(marker))!.json();
  record.firstInstall = true;
  cacheA.entries.set(marker, Response.json(record));
  const markerBefore = await (await cacheA.match(marker))!.text();
  const writesBefore = cacheA.writes;
  const b = await fixture();
  b.bodies.set('assets/main.js', 'generation B');
  const main = b.app.assets.find(asset => asset.path === 'assets/main.js')!;
  main.size = Buffer.byteLength('generation B'); main.sha256 = hash('generation B');
  Object.assign(b, bindVerifiedWorker(b, b.workerSource));
  b.bodies.set('sw.js', b.workerSource);
  const update = harness(b, storage);
  await update.install();
  assert.equal(update.registration.waiting?.state, 'installed');
  assert.equal(update.registration.active?.state, 'activated');
  assert.equal(await (await initial.fetch('assets/main.js')).text(), a.bodies.get('assets/main.js'));
  assert.equal(update.claims(), 0); assert.equal(update.skips(), 0);
  await update.activate();
  assert.equal(update.claims(), 0);
  const recovery = harness(a, storage);
  await recovery.install();
  assert.equal(recovery.requests.length, 2); // Manifest acquisition only; complete A is reused.
  assert.equal(cacheA.writes, writesBefore);
  assert.equal(await (await cacheA.match(marker))!.text(), markerBefore);
  assert.equal(recovery.claims(), 0); assert.equal(recovery.skips(), 0);
  await recovery.activate();
  assert.equal(recovery.claims(), 0, 'Recovery must not claim clients because old A was once a first install');
  assert.equal(cacheA.writes, writesBefore);
  assert.equal(await (await cacheA.match(marker))!.text(), markerBefore);
  assert.equal(storage.values.size, 2); assert.deepEqual(storage.deleted, []);
  assert.equal(recovery.skips(), 0);
});

test('failed first install, retry, waiting state changes and process restart never force client control', async () => {
  const f = await fixture(), storage = new MemoryStorage();
  storage.failAt = 50;
  const failed = harness(f, storage, false);
  await assert.rejects(failed.install(), /QuotaExceededError/);
  assert.equal(failed.registration.waiting, null);
  assert.equal(failed.claims(), 0); assert.equal(failed.skips(), 0);
  const cache = await generation(storage);
  assert.equal(await cache.match(marker), undefined);
  storage.failAt = null;
  const retry = harness(f, storage, false);
  await retry.install();
  assert.equal(retry.registration.waiting?.state, 'installed');
  assert.equal(retry.registration.active, null);
  assert.equal((await (await cache.match(marker))!.json()).firstInstall, true);
  // The registration may change after install; activate must not use old observations.
  retry.registration.active = {state: 'activated'};
  await retry.activate();
  assert.equal(retry.claims(), 0); assert.equal(retry.skips(), 0);
  const writes = cache.writes;
  for (const active of [null, {state: 'activated'}]) {
    const restarted = harness(f, storage);
    restarted.registration.active = active;
    await restarted.activate();
    assert.equal(restarted.claims(), 0); assert.equal(restarted.skips(), 0);
  }
  assert.equal(cache.writes, writes); assert.deepEqual(storage.deleted, []);
});

const rangeAudioPaths = [
  'lessons/basic-delivery/lesson.mp3',
  'lessons/etcl-01-talking-about-my-job/continuous-training.mp3',
  'lessons/etcl-12-expressing-opinions/japanese-cues/phrase-006.mp3',
];

test('all three audio types synthesize byte-exact offline single ranges without any network or cache writes', async () => {
  const body = Array.from({length: 1100}, (_, index) => String.fromCharCode(32 + index % 90)).join('') + 'é日本語';
  const bytes = Buffer.from(body);
  const f = await fixture(body), h = harness(f);
  await h.install(); await h.activate();
  const cache = await generation(h.storage), writes = cache.writes, requests = h.requests.length;
  h.setNetwork(async () => { throw Error('connection lost'); });
  const cases: Array<[string, number, number]> = [
    ['bytes=0-', 0, bytes.length - 1], ['bytes=100-499', 100, 499],
    ['bytes=100-', 100, bytes.length - 1], ['bytes=-500', bytes.length - 500, bytes.length - 1],
    [`bytes=${bytes.length - 1}-${bytes.length - 1}`, bytes.length - 1, bytes.length - 1],
    ['bytes=100-999999999999999999999', 100, bytes.length - 1],
    ['bytes=-999999999999999999999', 0, bytes.length - 1],
  ];
  for (const name of rangeAudioPaths) {
    for (const [header, start, end] of cases) {
      const response = await h.fetch(name, {Range: header});
      assert.equal(response.status, 206, name + ' ' + header);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
      assert.equal(response.headers.get('Content-Range'), `bytes ${start}-${end}/${bytes.length}`);
      assert.equal(response.headers.get('Content-Length'), String(end - start + 1));
      assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
      assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
    }
    assert.equal(await (await cache.match(scope + name))!.text(), body);
  }
  assert.equal(h.requests.length, requests); assert.equal(cache.writes, writes);
});

test('invalid and unsatisfiable single ranges return explicit 416; empty bodies are handled safely', async () => {
  const f = await fixture(), h = harness(f);
  await h.install(); await h.activate();
  h.setNetwork(async () => { throw Error('offline'); });
  for (const name of rangeAudioPaths) {
    const size = Buffer.byteLength(f.bodies.get(name)!);
    for (const header of [`bytes=${size}-`, 'bytes=20-10', 'bytes=-0', 'bytes=-', 'bytes=abc-def',
      'items=0-3', 'bytes=1.5-3', 'bytes=0--1', 'bytes=0-1 trailing', 'bytes=999999999999999999999-']) {
      const response = await h.fetch(name, {Range: header});
      assert.equal(response.status, 416, header);
      assert.equal(response.headers.get('Content-Range'), `bytes */${size}`);
      assert.equal(response.headers.get('Content-Length'), '0');
      assert.equal((await response.arrayBuffer()).byteLength, 0);
    }
  }
  // Empty files cannot pass manifest verification; the parser still fails safely in isolation.
  const empty = await h.rangeResponse(new Request(scope + rangeAudioPaths[0], {headers: {Range: 'bytes=0-'}}),
    new Response(new Uint8Array()));
  assert.equal(empty.status, 416); assert.equal(empty.headers.get('Content-Range'), 'bytes */0');
});

test('multiple ranges delegate online and report unsupported offline without altering complete cache entries', async () => {
  const f = await fixture(), h = harness(f);
  await h.install(); await h.activate();
  const cache = await generation(h.storage), writes = cache.writes;
  for (const name of rangeAudioPaths) {
    h.setNetwork(async request => {
      assert.equal(request.headers.get('Range'), 'bytes=0-9,20-29');
      return new Response('server multipart payload', {status: 206,
        headers: {'Content-Type': 'multipart/byteranges; boundary=test'}});
    });
    const online = await h.fetch(name, {Range: 'bytes=0-9,20-29'});
    assert.equal(online.status, 206); assert.equal(await online.text(), 'server multipart payload');
    assert.equal(online.headers.get('Content-Type'), 'multipart/byteranges; boundary=test');
    h.setNetwork(async () => { throw Error('offline'); });
    const offline = await h.fetch(name, {Range: 'bytes=0-9,20-29'});
    assert.equal(offline.status, 503);
    assert.equal(offline.headers.get('X-EAG-Range-Unsupported'), 'multiple');
    assert.equal(offline.headers.get('Content-Range'), null);
    assert.match(await offline.text(), /not supported offline/);
    assert.equal(await (await cache.match(scope + name))!.text(), f.bodies.get(name));
  }
  assert.equal(cache.writes, writes);
});

test('network 206 is never saved; invalid or missing complete bodies cannot be used for slicing', async () => {
  const f = await fixture(), h = harness(f);
  await h.install(); await h.activate();
  const cache = await generation(h.storage), writes = cache.writes;
  for (const [index, name] of rangeAudioPaths.entries()) {
    if (index === 0) cache.entries.delete(scope + name);
    if (index === 1) cache.entries.set(scope + name, new Response('wrong size/hash'));
    if (index === 2) cache.entries.set(scope + name, new Response(f.bodies.get(name), {status: 206}));
    h.setNetwork(async () => new Response('network bytes', {status: 206}));
    const response = await h.fetch(name, {Range: 'bytes=0-3'});
    assert.equal(response.status, 206); assert.equal(await response.text(), 'network bytes');
    h.setNetwork(async () => { throw Error('connection lost'); });
    await assert.rejects(h.fetch(name, {Range: 'bytes=0-3'}), /connection lost/);
  }
  assert.equal(cache.writes, writes);
  assert.equal(await cache.match(scope + rangeAudioPaths[0]), undefined);
  assert.equal(await (await cache.match(scope + rangeAudioPaths[1]))!.text(), 'wrong size/hash');
  assert.equal((await cache.match(scope + rangeAudioPaths[2]))!.status, 206);
});

test('uncompleted generations are excluded even when every audio file was copied', async () => {
  const f = await fixture(), storage = new MemoryStorage();
  storage.failAt = 223;
  await assert.rejects(harness(f, storage).install());
  storage.failAt = null;
  const h = harness(f, storage), cache = await generation(storage), writes = cache.writes;
  h.setNetwork(async () => { throw Error('offline'); });
  for (const name of rangeAudioPaths) await assert.rejects(h.fetch(name, {Range: 'bytes=0-3'}));
  assert.equal(cache.writes, writes); assert.equal(await cache.match(marker), undefined);
});

test('normal GET contracts, non-audio requests, external URLs and online cache-save failure remain isolated', async () => {
  const f = await fixture(), h = harness(f);
  await h.install(); await h.activate();
  const before = h.requests.length;
  for (const name of rangeAudioPaths.slice(0, 2)) {
    assert.equal(await (await h.fetch(name)).text(), f.bodies.get(name));
  }
  assert.equal(h.requests.length, before);
  h.setNetwork(async () => new Response('Japanese network first'));
  assert.equal(await (await h.fetch(rangeAudioPaths[2]!)).text(), 'Japanese network first');
  h.setNetwork(async () => new Response('unrelated audio', {status: 206}));
  const unrelated = await h.fetch('other.mp3', {Range: 'bytes=0-3'});
  assert.equal(await unrelated.text(), 'unrelated audio');
  assert.equal(h.isIntercepted('https://external.test/EAG/lessons/basic-delivery/lesson.mp3'), false);
  assert.equal(h.isIntercepted('https://example.test/other/lesson.mp3'), false);
  assert.equal(await (await h.fetch('assets/main.css', {Range: 'bytes=0-3'})).text(), f.bodies.get('assets/main.css'));
  const metadata = 'lessons/basic-delivery/metadata.json';
  h.setNetwork(async () => new Response(f.bodies.get(metadata)));
  h.storage.failAt = h.storage.puts + 1;
  const response = await h.fetch(metadata, {Range: 'bytes=0-3'});
  assert.equal(response.status, 200); assert.equal(await response.text(), f.bodies.get(metadata));
});
