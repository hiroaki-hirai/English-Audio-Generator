import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Manifest } from 'vite';

export type VerifiedAsset = { path: string; url: string; size: number; sha256: string };
export type VerifiedAssetManifest = {
  schemaVersion: 1;
  kind: 'audio' | 'app';
  basePath: string;
  releaseId: string;
  workerBuildId?: string;
  assets: VerifiedAsset[];
};
export const verifiedManifestNames = ['verified-audio-assets.json', 'verified-app-assets.json'] as const;

export function validateAssetPath(value: string): string {
  if (!/^[a-zA-Z0-9_./-]+$/.test(value) || value.split('/').some(
    (segment) => !segment || segment === '.' || segment === '..',
  )) throw new Error(`Invalid asset path: ${value}`);
  return value;
}

export function validateBasePath(base: string): string {
  if (base === '/') return base;
  if (!base.startsWith('/') || !base.endsWith('/')) throw new Error(`Invalid base path: ${base}`);
  validateAssetPath(base.slice(1, -1));
  return base;
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function assetBytes(root: string, name: string): Promise<Buffer> {
  validateAssetPath(name);
  const actualRoot = await realpath(root);
  const file = await realpath(path.join(actualRoot, name));
  const relative = path.relative(actualRoot, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Asset escapes root: ${name}`);
  if (!(await stat(file)).isFile()) throw new Error(`Not an asset file: ${name}`);
  const bytes = await readFile(file);
  if (!bytes.length) throw new Error(`Empty asset: ${name}`);
  return bytes;
}

export async function describeAssets(root: string, names: readonly string[], base: string): Promise<VerifiedAsset[]> {
  validateBasePath(base);
  const seen = new Set<string>();
  // Windows and case-sensitive hosting must agree about distinct public paths.
  for (const name of names) {
    validateAssetPath(name);
    if (seen.has(name.toLowerCase())) throw new Error(`Duplicate asset path: ${name}`);
    if (verifiedManifestNames.includes(name as typeof verifiedManifestNames[number])) {
      throw new Error(`Manifest cannot reference itself or its sibling: ${name}`);
    }
    seen.add(name.toLowerCase());
  }
  return Promise.all([...names].sort().map(async (name) => {
    const bytes = await assetBytes(root, name);
    return { path: name, url: base + name, size: bytes.length, sha256: sha256(bytes) };
  }));
}

export async function collectAudioAssetPaths(root: string, lessons: unknown): Promise<string[]> {
  if (!Array.isArray(lessons) || !lessons.length) throw new Error('Expected a nonempty lesson index.');
  const ids = new Set<string>();
  const names: string[] = [];
  for (const lesson of lessons) {
    if (typeof lesson?.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lesson.id)) {
      throw new Error('Invalid lesson ID.');
    }
    if (ids.has(lesson.id)) throw new Error(`Duplicate lesson ID: ${lesson.id}`);
    ids.add(lesson.id);
    if (!Array.isArray(lesson.phrases) || !lesson.phrases.length) throw new Error(`Invalid phrases: ${lesson.id}`);
    const directory = `lessons/${lesson.id}`;
    const cues = lesson.phrases.map((_: unknown, index: number) =>
      `phrase-${String(index + 1).padStart(3, '0')}.mp3`);
    const actualCues = (await readdir(path.join(root, directory, 'japanese-cues'))).sort();
    if (JSON.stringify(actualCues) !== JSON.stringify(cues)) throw new Error(`Invalid cue numbering: ${lesson.id}`);
    names.push(...['lesson.mp3', 'continuous-training.mp3', 'metadata.json'].map((file) => `${directory}/${file}`),
      ...cues.map((file: string) => `${directory}/japanese-cues/${file}`));
  }
  return names;
}

function referencePath(reference: string, owner: string, base: string): string | null {
  if (reference.startsWith('data:') || reference.startsWith('#')) return null;
  if (!reference || /[\\%?#\s]/.test(reference)) throw new Error(`Invalid asset reference: ${reference}`);
  const origin = 'https://eag.invalid';
  const url = new URL(reference, origin + base + owner);
  if (url.origin !== origin || !url.pathname.startsWith(base)) throw new Error(`Asset reference escapes base: ${reference}`);
  const name = url.pathname.slice(base.length);
  return validateAssetPath(name.endsWith('/') || !name ? name + 'index.html' : name);
}

function attributes(tag: string): Map<string, string> {
  return new Map([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1]!.toLowerCase(), match[2] ?? match[3] ?? '']));
}

export async function collectAppAssetPaths(root: string, base: string): Promise<string[]> {
  validateBasePath(base);
  const viteManifest = JSON.parse((await assetBytes(root, '.vite/manifest.json')).toString('utf8')) as Manifest;
  if (!Object.values(viteManifest).some((chunk) => chunk.isEntry)) throw new Error('Missing Vite entry.');
  const pending = ['index.html', 'sw.js', 'training-audio-assets.js'];
  const visitedChunks = new Set<string>();
  function visitChunk(key: string): void {
    if (visitedChunks.has(key)) return;
    const chunk = viteManifest[key];
    if (!chunk) throw new Error(`Unresolved Vite dependency: ${key}`);
    visitedChunks.add(key);
    pending.push(chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? []));
    for (const dependency of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) visitChunk(dependency);
  }
  for (const key of Object.keys(viteManifest)) visitChunk(key);
  const seen = new Set<string>();
  const addReference = (reference: string, owner: string): void => {
    const name = referencePath(reference, owner, base);
    if (name) pending.push(name);
  };
  while (pending.length) {
    const name = validateAssetPath(pending.pop()!);
    if (seen.has(name)) continue;
    seen.add(name);
    const bytes = await assetBytes(root, name);
    if (name.endsWith('.html')) {
      const html = bytes.toString('utf8');
      if (/<base\b|\bsrcset\s*=/i.test(html)) throw new Error('Unsupported HTML base/srcset dependency.');
      for (const match of html.matchAll(/<(?:script|link|img|source)\b[^>]*>/gi)) {
        const attrs = attributes(match[0]);
        const reference = attrs.get('src') ?? attrs.get('href');
        if (/\b(?:src|href)\s*=/i.test(match[0]) && reference === undefined) {
          throw new Error('Unsupported unquoted HTML asset reference.');
        }
        if (reference) addReference(reference, name);
      }
    } else if (name.endsWith('.css')) {
      const css = bytes.toString('utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)|@import\s+["']([^"']+)["']/gi)) {
        addReference(match[1] ?? match[2] ?? match[3] ?? match[4]!, name);
      }
    } else if (name.endsWith('.webmanifest')) {
      const manifest = JSON.parse(bytes.toString('utf8'));
      for (const icon of manifest.icons ?? []) addReference(icon.src, name);
      for (const field of ['start_url', 'scope']) if (manifest[field]) addReference(manifest[field], name);
    }
  }
  return [...seen].sort();
}

export async function createVerifiedManifests(root: string, lessons: unknown, base: string): Promise<{
  audio: VerifiedAssetManifest; app: VerifiedAssetManifest;
}> {
  const audio = await describeAssets(root, await collectAudioAssetPaths(root, lessons), base);
  const app = await describeAssets(root, await collectAppAssetPaths(root, base), base);
  const releaseId = sha256(JSON.stringify({ schemaVersion: 1, basePath: base, audio, app }));
  return {
    audio: { schemaVersion: 1, kind: 'audio', basePath: base, releaseId, assets: audio },
    app: { schemaVersion: 1, kind: 'app', basePath: base, releaseId, assets: app },
  };
}

// Bind the installed worker to a build without putting a release ID inside its own hash.
export function bindVerifiedWorker(
  manifests: { audio: VerifiedAssetManifest; app: VerifiedAssetManifest }, workerSource: string,
): { audio: VerifiedAssetManifest; app: VerifiedAssetManifest; workerSource: string } {
  const declaration = /^const WORKER_BUILD_ID = '(?:__EAG_WORKER_BUILD_ID__|[a-f0-9]{64})';$/gm;
  if ([...workerSource.matchAll(declaration)].length !== 1) throw new Error('Missing unique Worker build ID declaration.');
  const template = workerSource.replace(declaration, "const WORKER_BUILD_ID = '__EAG_WORKER_BUILD_ID__';");
  const withWorker = (source: string): VerifiedAsset[] => manifests.app.assets.map((asset) => asset.path === 'sw.js'
    ? { ...asset, size: Buffer.byteLength(source), sha256: sha256(source) } : asset);
  if (!manifests.app.assets.some(asset => asset.path === 'sw.js')) throw new Error('Missing Worker asset.');
  const identity = (app: VerifiedAsset[]): string => sha256(JSON.stringify({
    schemaVersion: 1, basePath: manifests.audio.basePath, audio: manifests.audio.assets, app,
  }));
  const workerBuildId = identity(withWorker(template));
  const finalSource = template.replace('__EAG_WORKER_BUILD_ID__', workerBuildId);
  const app = withWorker(finalSource);
  const releaseId = identity(app);
  return {
    audio: { ...manifests.audio, releaseId, workerBuildId },
    app: { ...manifests.app, assets: app, releaseId, workerBuildId },
    workerSource: finalSource,
  };
}
