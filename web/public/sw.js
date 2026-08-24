importScripts('./training-audio-assets.js');

const CACHE_NAME = 'eag-training-v7';

const scopeUrl = self.registration.scope;

const staticAssets = [
  '',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

const trainingAudioAssets = self.EAG_TRAINING_AUDIO_ASSETS ?? [];

const APP_ASSETS = [...staticAssets, ...trainingAudioAssets].map(
  (path) => new URL(path, scopeUrl).href,
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function createRangeResponse(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');

  if (!rangeHeader) {
    return cachedResponse;
  }

  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);

  if (!match) {
    return new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
    });
  }

  const buffer = await cachedResponse.arrayBuffer();
  const fileSize = buffer.byteLength;

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;
  const end = Math.min(requestedEnd, fileSize - 1);

  if (start >= fileSize || start > end) {
    return new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: {
        'Content-Range': `bytes */${fileSize}`,
      },
    });
  }

  const slicedBuffer = buffer.slice(start, end + 1);

  return new Response(slicedBuffer, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type':
        cachedResponse.headers.get('Content-Type') ?? 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': String(slicedBuffer.byteLength),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    (async () => {
      const requestUrl = new URL(event.request.url);

      const isLessonAudio =
        requestUrl.pathname.includes('/lessons/') &&
        requestUrl.pathname.endsWith('/lesson.mp3');

      const isLessonMetadata =
        requestUrl.pathname.includes('/lessons/') &&
        requestUrl.pathname.endsWith('/metadata.json');

      const isTrainingAssetList = requestUrl.pathname.endsWith(
        '/training-audio-assets.js',
      );

      if (isLessonMetadata) {
        try {
          const networkResponse = await fetch(event.request);

          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, networkResponse.clone());
          }

          return networkResponse;
        } catch {
          const cachedResponse = await caches.match(event.request);

          if (cachedResponse) {
            return cachedResponse;
          }

          throw new Error(`No cached metadata for ${event.request.url}`);
        }
      }

      if (isLessonAudio || isTrainingAssetList) {
        const cachedResponse = await caches.match(event.request);

        if (cachedResponse) {
          if (isLessonAudio && event.request.headers.has('range')) {
            try {
              return await fetch(event.request);
            } catch {
              return createRangeResponse(event.request, cachedResponse);
            }
          }

          return cachedResponse;
        }

        const networkResponse = await fetch(event.request);

        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());
        }

        return networkResponse;
      }

      try {
        const networkResponse = await fetch(event.request);

        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());
        }

        return networkResponse;
      } catch {
        const cachedResponse = await caches.match(event.request);

        if (cachedResponse) {
          return cachedResponse;
        }

        throw new Error(`No cached response for ${event.request.url}`);
      }
    })(),
  );
});
