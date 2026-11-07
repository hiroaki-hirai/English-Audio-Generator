// Replaced only in the completed build output, before final manifest hashes are calculated.
const WORKER_BUILD_ID = '__EAG_WORKER_BUILD_ID__';
const scopeUrl = self.registration.scope;
const scope = new URL(scopeUrl);
const CACHE_PREFIX = `eag-verified-${encodeURIComponent(scope.pathname)}-`;
const MARKER_URL = new URL('__eag_verified_complete__', scopeUrl).href;
const MANIFEST_FILES = ['verified-audio-assets.json', 'verified-app-assets.json'];
let currentGeneration = null;
let generationPromise = null;

async function digest(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const hashText = (text) => digest(new TextEncoder().encode(text));
const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function validPath(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_./-]+$/.test(value) &&
    value.split('/').every((part) => part && part !== '.' && part !== '..');
}

async function validateManifests(audio, app, expectedBuild = WORKER_BUILD_ID) {
  const seen = new Set();
  for (const [manifest, kind] of [[audio, 'audio'], [app, 'app']]) {
    if (!manifest || manifest.schemaVersion !== 1 || manifest.kind !== kind ||
        manifest.basePath !== scope.pathname || !validHash(manifest.releaseId) ||
        !validHash(manifest.workerBuildId) || manifest.workerBuildId !== expectedBuild ||
        !Array.isArray(manifest.assets) || !manifest.assets.length) throw new Error('Invalid verified manifest.');
    let previous = '';
    for (const asset of manifest.assets) {
      if (!asset || !validPath(asset.path) || asset.path <= previous ||
          MANIFEST_FILES.includes(asset.path) || asset.path === '__eag_verified_complete__' || asset.url !== scope.pathname + asset.path ||
          !Number.isSafeInteger(asset.size) || asset.size <= 0 || !validHash(asset.sha256) ||
          seen.has(asset.path.toLowerCase()) || seen.has(asset.url.toLowerCase())) throw new Error('Invalid or duplicate asset.');
      if (kind === 'audio' && !/^lessons\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:lesson\.mp3|continuous-training\.mp3|metadata\.json|japanese-cues\/phrase-\d{3,}\.mp3)$/.test(asset.path)) throw new Error('Invalid audio asset.');
      previous = asset.path;
      seen.add(asset.path.toLowerCase());
      seen.add(asset.url.toLowerCase());
    }
  }
  if (audio.releaseId !== app.releaseId) throw new Error('Release mismatch.');
  for (const name of ['index.html', 'sw.js', 'training-audio-assets.js', 'manifest.webmanifest']) {
    if (!app.assets.some((asset) => asset.path === name)) throw new Error('Incomplete app manifest.');
  }
  const canonical = (assets) => assets.map(({ path, url, size, sha256 }) => ({ path, url, size, sha256 }));
  const audioAssets = canonical(audio.assets), appAssets = canonical(app.assets);
  const release = await hashText(JSON.stringify({ schemaVersion: 1, basePath: scope.pathname, audio: audioAssets, app: appAssets }));
  if (release !== audio.releaseId) throw new Error('Invalid release identity.');
  return { audio, app, assets: [...audio.assets, ...app.assets], name: CACHE_PREFIX + release };
}

async function verifiedResponse(response, asset) {
  if (!response || response.status !== 200 || response.type === 'opaque' || response.type === 'opaqueredirect' ||
      response.headers.has('content-range') || response.headers.get('vary')?.split(',').some((part) => part.trim().toLowerCase() === 'range')) return false;
  const bytes = await response.clone().arrayBuffer();
  return bytes.byteLength === asset.size && await digest(bytes) === asset.sha256;
}

async function verifyWorkerAndHtml(plan, cache) {
  const source = await (await cache.match(new URL('sw.js', scopeUrl).href)).text();
  const declaration = `const WORKER_BUILD_ID = '${plan.audio.workerBuildId}';`;
  if (!source.includes(declaration)) throw new Error('Worker belongs to another build.');
  const template = source.replace(declaration, "const WORKER_BUILD_ID = '__EAG_WORKER_BUILD_ID__';");
  const app = plan.app.assets.map((asset) => asset.path === 'sw.js'
    ? { ...asset, size: new TextEncoder().encode(template).length, sha256: null } : { ...asset });
  app.find((asset) => asset.path === 'sw.js').sha256 = await hashText(template);
  const canonical = (assets) => assets.map(({ path, url, size, sha256 }) => ({ path, url, size, sha256 }));
  const build = await hashText(JSON.stringify({ schemaVersion: 1, basePath: scope.pathname,
    audio: canonical(plan.audio.assets), app: canonical(app) }));
  if (build !== plan.audio.workerBuildId) throw new Error('Worker build identity mismatch.');
  const html = await (await cache.match(new URL('index.html', scopeUrl).href)).text();
  const urls = new Set(plan.app.assets.map((asset) => new URL(asset.url, scopeUrl).href));
  for (const tag of html.matchAll(/<(?:script|link|img|source)\b[^>]*>/gi)) {
    const reference = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag[0]);
    if (reference) {
      const url = new URL(reference[1] ?? reference[2], new URL('index.html', scopeUrl));
      if (!urls.has(url.href)) throw new Error('HTML dependency missing from app manifest.');
    }
  }
}

async function verifyGeneration(plan, cache) {
  for (const asset of plan.assets) {
    if (!await verifiedResponse(await cache.match(new URL(asset.url, scopeUrl).href), asset)) throw new Error(`Incomplete generation: ${asset.path}`);
  }
  await verifyWorkerAndHtml(plan, cache);
}

async function readCompleteGeneration(name, expectedBuild = WORKER_BUILD_ID) {
  if (!name.startsWith(CACHE_PREFIX)) return null;
  const cache = await caches.open(name);
  const response = await cache.match(MARKER_URL);
  if (!response) return null; // Recognizable incomplete generation; retain for verified retry.
  try {
    const marker = await response.json();
    if (marker.version !== 1 || typeof marker.firstInstall !== 'boolean') return null;
    const plan = await validateManifests(marker.audio, marker.app, expectedBuild);
    if (plan.name !== name) return null;
    await verifyGeneration(plan, cache); // Never trust the marker alone.
    return { ...plan, cache, firstInstall: marker.firstInstall };
  } catch {
    return null;
  }
}

async function loadCurrentGeneration() {
  if (currentGeneration) return currentGeneration;
  generationPromise ??= (async () => {
    try {
      for (const name of await caches.keys()) {
        const generation = await readCompleteGeneration(name);
        if (generation) return generation;
      }
    } catch { /* Unavailable Cache Storage must not prevent network-only fetches. */ }
    return null;
  })();
  currentGeneration = await generationPromise;
  return currentGeneration;
}

async function installGeneration() {
  const manifests = [];
  for (const file of MANIFEST_FILES) {
    const response = await fetch(new Request(new URL(file, scopeUrl).href, { method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error' }));
    if (response.status !== 200 || response.type === 'opaque' || response.type === 'opaqueredirect') throw new Error('Manifest download failed.');
    manifests.push(await response.json());
  }
  const plan = await validateManifests(...manifests);
  const names = await caches.keys();
  // A completed copy of this exact release can be reused without altering it.
  if (names.includes(plan.name) && await readCompleteGeneration(plan.name)) return;
  const cache = await caches.open(plan.name);
  // A stale completion record must not survive a failed revalidation/retry.
  await cache.delete(MARKER_URL);
  const sources = [];
  for (const name of names) {
    if (name === plan.name) continue;
    if (name === 'eag-training-v8') sources.push(await caches.open(name));
    else if (name.startsWith(CACHE_PREFIX)) {
      const source = await caches.open(name);
      const marker = await source.match(MARKER_URL);
      if (marker) {
        try {
          const record = await marker.json();
          const old = await validateManifests(record.audio, record.app, record.audio?.workerBuildId);
          if (old.name === name) sources.push(source);
        } catch { /* Never migrate an unrecognized generation. */ }
      }
    }
  }
  for (const asset of plan.assets) {
    const url = new URL(asset.url, scopeUrl).href;
    if (await verifiedResponse(await cache.match(url), asset)) continue;
    let response;
    for (const source of sources) {
      const candidate = await source.match(url);
      if (await verifiedResponse(candidate, asset)) { response = candidate; break; }
    }
    if (!response) response = await fetch(new Request(url, { method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error' }));
    if (!await verifiedResponse(response, asset)) throw new Error(`Unverified asset: ${asset.path}`);
    await cache.put(url, response.clone());
  }
  await verifyGeneration(plan, cache);
  // Historical compatibility metadata only; never use it to decide client control.
  const firstInstall = !self.registration.active;
  await cache.put(MARKER_URL, new Response(JSON.stringify({ version: 1, firstInstall, audio: plan.audio, app: plan.app }),
    { headers: { 'Content-Type': 'application/json' } }));
  // Do not expose install state to fetch. Activation/restart revalidates independently.
  generationPromise = null;
}

self.addEventListener('install', (event) => { event.waitUntil(installGeneration()); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const generation = await loadCurrentGeneration();
    if (!generation) throw new Error('No complete generation to activate.');
    // Keep every prior generation and unrelated cache. Cleanup is deliberately deferred.
    // Never claim clients: first installs use normal navigation control, and updates
    // or recovery cannot inherit an obsolete firstInstall flag from cached metadata.
  })());
});

async function currentCacheMatch(request) {
  try {
    const generation = await loadCurrentGeneration();
    return generation ? await generation.cache.match(request) : undefined;
  } catch { return undefined; }
}

async function saveRuntimeResponse(request, response) {
  try {
    const generation = await loadCurrentGeneration();
    if (!generation || response.status !== 200) return;
    const url = typeof request === 'string' ? request : request.url;
    const asset = generation.assets.find((entry) => new URL(entry.url, scopeUrl).href === url);
    if (asset && !await verifiedResponse(response, asset)) return;
    await generation.cache.put(request, response.clone());
  } catch { /* Cache failure must not fail online playback. */ }
}

async function createRangeResponse(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) return cachedResponse;
  const buffer = await cachedResponse.clone().arrayBuffer();
  const totalSize = buffer.byteLength;
  const contentType = cachedResponse.headers.get('Content-Type') ?? 'audio/mpeg';
  const unsatisfiable = () => new Response(null, {
    status: 416,
    statusText: 'Range Not Satisfiable',
    headers: {
      'Content-Range': `bytes */${totalSize}`,
      'Content-Length': '0',
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
    },
  });
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!totalSize || !match || (!match[1] && !match[2])) return unsatisfiable();
  // Parse as integers before clamping; huge headers must never lose precision.
  const size = BigInt(totalSize);
  let start, end;
  if (!match[1]) {
    const suffixLength = BigInt(match[2]);
    if (suffixLength === 0n) return unsatisfiable();
    start = suffixLength >= size ? 0n : size - suffixLength;
    end = size - 1n;
  } else {
    start = BigInt(match[1]);
    end = match[2] ? BigInt(match[2]) : size - 1n;
    if (start >= size || end < start) return unsatisfiable();
    if (end >= size) end = size - 1n;
  }
  const body = buffer.slice(Number(start), Number(end) + 1);
  return new Response(body, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(body.byteLength),
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
    },
  });
}

async function audioRangeResponse(request, asset) {
  const header = request.headers.get('range');
  if (/^bytes=/i.test(header.trim()) && header.includes(',')) {
    try { return await fetch(request); } catch {
      return new Response('Multiple audio ranges are not supported offline.', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
          'X-EAG-Range-Unsupported': 'multiple' },
      });
    }
  }
  const cached = await currentCacheMatch(request);
  try {
    if (await verifiedResponse(cached, asset)) return await createRangeResponse(request, cached);
  } catch { /* An unreadable or invalid full response is never used for slicing. */ }
  // Preserve the server's response, including 206. Never cache a Range-request response.
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== scope.origin ||
      !new URL(event.request.url).pathname.startsWith(scope.pathname)) {
    return;
  }

  event.respondWith(
    (async () => {
      const requestUrl = new URL(event.request.url);
      const generation = await loadCurrentGeneration();
      // Pin the complete app shell to this Worker while a newer release is waiting.
      const appAsset = generation?.app.assets.find((asset) => new URL(asset.url, scopeUrl).pathname === requestUrl.pathname);
      const rootNavigation = requestUrl.pathname === scope.pathname;
      if (appAsset || rootNavigation) {
        const pinned = await currentCacheMatch(new URL(rootNavigation ? 'index.html' : appAsset.url, scopeUrl).href);
        if (pinned) return pinned;
      }

      const isLessonAudio =
        requestUrl.pathname.includes('/lessons/') &&
        (requestUrl.pathname.endsWith('/lesson.mp3') ||
          requestUrl.pathname.endsWith('/continuous-training.mp3'));

      const isLessonMetadata =
        requestUrl.pathname.includes('/lessons/') &&
        requestUrl.pathname.endsWith('/metadata.json');

      const isTrainingAssetList = requestUrl.pathname.endsWith(
        '/training-audio-assets.js',
      );

      const rangeAsset = generation?.audio.assets.find((asset) =>
        new URL(asset.url, scopeUrl).href === requestUrl.href &&
        /^lessons\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:lesson\.mp3|continuous-training\.mp3|japanese-cues\/phrase-\d{3,}\.mp3)$/.test(asset.path));
      if (rangeAsset && event.request.headers.has('range')) {
        return audioRangeResponse(event.request, rangeAsset);
      }

      if (isLessonMetadata) {
        try {
          const networkResponse = await fetch(event.request);

          if (networkResponse && networkResponse.status === 200) {
            await saveRuntimeResponse(event.request, networkResponse);
          }

          return networkResponse;
        } catch {
          const cachedResponse = await currentCacheMatch(event.request);

          if (cachedResponse) {
            return cachedResponse;
          }

          throw new Error(`No cached metadata for ${event.request.url}`);
        }
      }

      if (isLessonAudio || isTrainingAssetList) {
        const cachedResponse = await currentCacheMatch(event.request);

        if (cachedResponse) {
          return cachedResponse;
        }

        const networkResponse = await fetch(event.request);

        if (networkResponse && networkResponse.status === 200) {
          await saveRuntimeResponse(event.request, networkResponse);
        }

        return networkResponse;
      }

      try {
        const networkResponse = await fetch(event.request);

        if (networkResponse && networkResponse.status === 200) {
          await saveRuntimeResponse(event.request, networkResponse);
        }

        return networkResponse;
      } catch {
        const cachedResponse = await currentCacheMatch(event.request);

        if (cachedResponse) {
          return cachedResponse;
        }

        throw new Error(`No cached response for ${event.request.url}`);
      }
    })(),
  );
});
