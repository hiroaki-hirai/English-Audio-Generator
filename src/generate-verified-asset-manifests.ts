import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveConfig } from 'vite';
import { bindVerifiedWorker, createVerifiedManifests, verifiedManifestNames } from './verified-asset-manifest.js';

async function main(): Promise<void> {
  const config = await resolveConfig({}, 'build');
  const root = path.resolve(config.root, config.build.outDir);
  const lessons = JSON.parse(await readFile(path.join(config.root, 'src/training-lessons.json'), 'utf8'));
  // Validate both manifests completely before writing either output.
  const manifests = bindVerifiedWorker(await createVerifiedManifests(root, lessons, config.base),
    await readFile(path.join(root, 'sw.js'), 'utf8'));
  await writeFile(path.join(root, 'sw.js'), manifests.workerSource, 'utf8');
  for (const [index, manifest] of [manifests.audio, manifests.app].entries()) {
    await writeFile(path.join(root, verifiedManifestNames[index]!), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Generated ${verifiedManifestNames[index]}: ${manifest.assets.length} assets, ${manifest.assets.reduce((sum, asset) => sum + asset.size, 0)} bytes.`);
  }
  console.log(`Verified release: ${manifests.audio.releaseId}`);
}

main().catch((error: unknown) => {
  console.error('Failed to generate verified manifests:', error);
  process.exitCode = 1;
});
