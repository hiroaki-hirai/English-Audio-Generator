import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

test('unchanged Service Worker fetches normal Japanese MP3 online, including Range requests', async () => {
  const code = await readFile('web/public/sw.js', 'utf8');
  for (const range of [false, true]) {
    const listeners = new Map<string, (event: unknown) => void>();
    let networkCalls = 0, cachedReads = 0, cachedWrites = 0;
    const context = {
      importScripts: () => {}, URL, Response,
      self: { registration: { scope: 'https://example.test/EAG/' },
        addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler) },
      caches: {
        match: async () => { cachedReads += 1; return new Response('stale'); },
        open: async () => ({ put: async () => { cachedWrites += 1; } }),
      },
      fetch: async () => { networkCalls += 1; return new Response('new Japanese audio', {
        status: range ? 206 : 200, headers: { 'Content-Type': 'audio/mpeg' },
      }); },
    };
    runInNewContext(code, context);
    let response: Promise<Response> | undefined;
    listeners.get('fetch')!({
      request: new Request('https://example.test/EAG/lessons/cash-payment/japanese-cues/phrase-004.mp3',
        { headers: range ? { Range: 'bytes=0-1023' } : {} }),
      respondWith: (value: Promise<Response>) => { response = value; },
    });
    assert.ok(response);
    const result = await response;
    assert.equal(await result.text(), 'new Japanese audio');
    assert.equal(result.status, range ? 206 : 200);
    assert.equal(networkCalls, 1);
    assert.equal(cachedReads, 0);
    assert.equal(cachedWrites, range ? 0 : 1);
  }
});
