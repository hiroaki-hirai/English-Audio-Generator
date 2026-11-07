import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from 'vite';
import {
  collectAudioAssetPaths, collectAppAssetPaths, createVerifiedManifests,
  describeAssets, validateAssetPath, validateBasePath, verifiedManifestNames,
} from './verified-asset-manifest.js';
import { createActiveRecallLibrarySignature } from '../web/src/active-recall.js';
import { selectLegacyActiveRecallLessons, orderLegacyActiveRecallLessons } from '../web/src/legacy-active-recall-library.js';

test('20 registered lessons produce 213 independently verified audio and metadata entries', async () => {
  const lessons = JSON.parse(await readFile('web/src/training-lessons.json', 'utf8'));
  assert.equal(lessons.length, 20);
  const names = await collectAudioAssetPaths('web/public', lessons);
  assert.equal(names.length, 213);
  assert.equal(names.filter(name => name.includes('/japanese-cues/')).length, 153);
  assert.equal(names.filter(name => !name.includes('/japanese-cues/')).length, 60);
  assert.equal(new Set(names).size, 213);
  assert.ok(names.every(name => !name.endsWith('source-hash.txt')));
  const assets = await describeAssets('web/public', names, '/English-Audio-Generator/');
  for (const asset of assets) {
    const bytes = await readFile(path.join('web/public', asset.path));
    assert.equal(asset.size, bytes.length);
    assert.equal(asset.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(asset.url, '/English-Audio-Generator/' + asset.path);
  }
  assert.equal(assets.reduce((total, asset) => total + asset.size, 0), 28491461);
  assert.deepEqual(await describeAssets('web/public', [...names].reverse(), '/English-Audio-Generator/'), assets);
  assert.equal(createActiveRecallLibrarySignature(selectLegacyActiveRecallLessons<any>(lessons)), 'fnv1a32:85:32bf4dac');
  assert.equal(createActiveRecallLibrarySignature(orderLegacyActiveRecallLessons<any>(lessons)), 'fnv1a32:85:a7bb76ae');
});

test('asset paths, base paths, duplicate paths and self references fail closed', async () => {
  for (const name of ['', '../x', '/x', 'a/../x', 'a/./x', 'a//x', 'a\\x', 'https://x', 'x?y', 'x#y', '%2e%2e/x']) {
    assert.throws(() => validateAssetPath(name), /Invalid asset path/);
  }
  for (const base of ['', './', 'https://example.test/', '/a', '//', '/a/../']) {
    assert.throws(() => validateBasePath(base));
  }
  assert.equal(validateBasePath('/'), '/');
  assert.equal(validateBasePath('/nested/eag/'), '/nested/eag/');
  await assert.rejects(describeAssets('web/public', ['sw.js', 'sw.js'], '/'), /Duplicate/);
  await assert.rejects(describeAssets('web/public', ['sw.js', 'SW.js'], '/'), /Duplicate/);
  for (const name of verifiedManifestNames) {
    await assert.rejects(describeAssets('web/public', [name], '/'), /reference itself/);
  }
  await assert.rejects(describeAssets('web/public', ['missing-file.mp3'], '/'), /ENOENT/);
  await assert.rejects(collectAudioAssetPaths('web/public', [{ id: '../escape', phrases: [{}] }]), /Invalid lesson ID/);
  await assert.rejects(collectAudioAssetPaths('web/public', [
    { id: 'cash-payment', phrases: Array(5).fill({}) },
    { id: 'cash-payment', phrases: Array(5).fill({}) },
  ]), /Duplicate lesson ID/);
});

test('real Vite output resolves startup dependencies, base URLs and deterministic release manifests', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'eag-verified-manifest-'));
  const put = async (name: string, value: string): Promise<void> => {
    const file = path.join(fixture, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
  };
  try {
    await put('index.html', '<link rel="manifest" href="%BASE_URL%manifest.webmanifest"><link rel="icon" href="%BASE_URL%icons/icon.png"><script type="module" src="/main.js"></script>');
    await put('main.js', 'import "./style.css"; import { shared } from "./shared.js"; console.log(shared); import("./lazy.js");');
    await put('shared.js', 'export const shared = 1;');
    await put('lazy.js', 'export const lazy = 2;');
    await put('style.css', 'body { background: url("/nested/eag/icons/background.png"); }');
    await put('public/icons/icon.png', 'icon bytes');
    await put('public/icons/background.png', 'background bytes');
    await put('public/manifest.webmanifest', JSON.stringify({ start_url: './', scope: './', icons: [{ src: 'icons/icon.png' }] }));
    await put('public/sw.js', '// Existing worker fixture');
    await put('public/training-audio-assets.js', 'self.EAG_TRAINING_AUDIO_ASSETS = [];');
    const lesson = { id: 'fixture-lesson', phrases: [{ en: 'Hello', ja: 'こんにちは' }] };
    for (const name of ['lesson.mp3', 'continuous-training.mp3', 'metadata.json', 'japanese-cues/phrase-001.mp3']) {
      await put('public/lessons/fixture-lesson/' + name, 'fixture bytes');
    }
    const root = path.join(fixture, 'dist');
    await build({ configFile: false, root: fixture, base: '/nested/eag/', logLevel: 'silent',
      build: { outDir: root, manifest: true } });
    const first = await createVerifiedManifests(root, [lesson], '/nested/eag/');
    assert.equal(first.audio.assets.length, 4);
    assert.equal(first.audio.releaseId, first.app.releaseId);
    assert.match(first.app.releaseId, /^[a-f0-9]{64}$/);
    assert.ok(first.app.assets.some(asset => asset.path.endsWith('.css')));
    assert.equal(first.app.assets.filter(asset => asset.path.endsWith('.js') && asset.path.startsWith('assets/')).length, 2);
    for (const name of ['index.html', 'manifest.webmanifest', 'icons/icon.png', 'icons/background.png', 'sw.js', 'training-audio-assets.js']) {
      assert.ok(first.app.assets.some(asset => asset.path === name), name);
    }
    for (const asset of [...first.audio.assets, ...first.app.assets]) {
      const bytes = await readFile(path.join(root, asset.path));
      assert.equal(asset.size, bytes.length);
      assert.equal(asset.sha256, createHash('sha256').update(bytes).digest('hex'));
      assert.equal(asset.url, '/nested/eag/' + asset.path);
    }
    // Existing output manifests must neither be included nor change a second run.
    for (const name of verifiedManifestNames) await writeFile(path.join(root, name), 'old manifest bytes');
    assert.equal(JSON.stringify(await createVerifiedManifests(root, [lesson], '/nested/eag/')), JSON.stringify(first));
    assert.ok(first.app.assets.every(asset => !verifiedManifestNames.includes(asset.path as typeof verifiedManifestNames[number])));
    assert.ok((await describeAssets(root, ['index.html'], '/'))[0]?.url === '/index.html');

    await writeFile(path.join(root, 'lessons/fixture-lesson/japanese-cues/phrase-003.mp3'), 'extra');
    await assert.rejects(collectAudioAssetPaths(root, [lesson]), /cue numbering/);
    await rm(path.join(root, 'lessons/fixture-lesson/japanese-cues/phrase-003.mp3'));
    await rm(path.join(root, 'lessons/fixture-lesson/lesson.mp3'));
    await assert.rejects(createVerifiedManifests(root, [lesson], '/nested/eag/'), /ENOENT/);
    const viteFile = path.join(root, '.vite/manifest.json');
    const vite = JSON.parse(await readFile(viteFile, 'utf8'));
    vite['index.html'].imports = ['missing-chunk'];
    await writeFile(viteFile, JSON.stringify(vite));
    await assert.rejects(collectAppAssetPaths(root, '/nested/eag/'), /Unresolved Vite dependency/);
  } finally {
    assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
    assert.ok(path.basename(fixture).startsWith('eag-verified-manifest-'));
    await rm(fixture, { recursive: true, force: true });
  }
});
