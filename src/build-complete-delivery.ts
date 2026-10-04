import { access, mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { canonicalCompleteDeliverySource, completeDeliveryRoot, diagnosticAssetRoot, decodeAudio, audioCommand,
  continuousPcm, normalizeContinuous, waveformCorrelation, verifyCompleteDeliveryAssets, type CompleteDeliveryMetadata } from './complete-delivery-assets.js';
import { continuousTrainingConfig, calculateTrainingAudioSourceHash } from './continuous-training.js';
import { expectedJapaneseAssets, japaneseManifestPath, japaneseGenerationConfig, inspectJapaneseAudio,
  sha256, sourceHash, type JapaneseManifest } from './training-japanese-assets.js';

async function main() {
  // Refuse to replace a previously completed lesson or partial import.
  try { await access(completeDeliveryRoot); throw new Error('Complete Delivery directory already exists.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const source = canonicalCompleteDeliverySource(await readFile('training-scripts/complete-delivery.json'));
  const lesson = JSON.parse(source.toString());
  const fixture = JSON.parse(await readFile('web/src/diagnostic-cues.json', 'utf8'));
  const diagnosticBytes = await readFile(`${diagnosticAssetRoot}/metadata.json`);
  const diagnostic = JSON.parse(diagnosticBytes.toString());
  const english = await readFile(`${diagnosticAssetRoot}/english/lesson.mp3`);
  if (lesson.phrases.length !== 20 || JSON.stringify(lesson.phrases) !== JSON.stringify(fixture.phrases)
    || sha256(english) !== diagnostic.lessonSha256) throw new Error('Diagnostic source/audio mismatch.');
  const decoded = decodeAudio(`${diagnosticAssetRoot}/english/lesson.mp3`);
  if (decoded.length / 2 !== diagnostic.totalSamples) throw new Error('Diagnostic duration mismatch.');

  // Validate the original per-phrase recordings against the completed lesson before reuse.
  // These are audit inputs only. Future reconstruction uses the completed normal asset.
  const originals = [];
  const originalPcm: Buffer[] = [];
  for (const [index, phrase] of diagnostic.phrases.entries()) {
    if (phrase.index !== index || phrase.en !== lesson.phrases[index].en || phrase.ja !== lesson.phrases[index].ja
      || phrase.start !== phrase.startSample / 24000 || phrase.end !== phrase.endSample / 24000) {
      throw new Error(`Diagnostic phrase/boundary mismatch: ${index}`);
    }
    const path = `output/20-cue-background-test/phrase-${String(index + 1).padStart(3, '0')}.mp3`;
    const pcm = decodeAudio(path);
    if (pcm.length / 2 !== phrase.endSample - phrase.startSample) throw new Error(`Original phrase duration mismatch: ${index}`);
    originalPcm.push(pcm);
    originals.push({ phraseIndex: index, auditSource: path, originalSha256: sha256(await readFile(path)), correlation: 0 });
  }
  const silence = Buffer.alloc(24000 * 5 * 2);
  const reference = normalizeContinuous(Buffer.concat(originalPcm.flatMap((pcm, index) =>
    index === 19 ? [pcm, silence, pcm] : [pcm, silence, pcm, silence])));
  if (reference.length !== decoded.length) throw new Error('Original normalized lesson duration mismatch.');
  for (const [index, original] of originals.entries()) {
    const phrase = diagnostic.phrases[index];
    const start = phrase.startSample * 2, end = phrase.endSample * 2;
    const correlation = waveformCorrelation(reference.subarray(start, end), decoded.subarray(start, end));
    if (!Number.isFinite(correlation) || correlation < 0.98) throw new Error(`Original phrase content mismatch: ${index}`);
    original.correlation = correlation;
  }
  const japanese = [];
  for (let index = 0; index < 20; index += 1) {
    const path = `${diagnosticAssetRoot}/japanese/phrase-${String(index + 1).padStart(3, '0')}.mp3`;
    japanese.push({ path, bytes: await readFile(path), inspected: inspectJapaneseAudio(path) });
  }
  const manifest: JapaneseManifest = JSON.parse(await readFile(japaneseManifestPath, 'utf8'));
  if (manifest.entries.some(entry => entry.lessonId === 'complete-delivery')) throw new Error('Lesson already in manifest.');
  const metadata: CompleteDeliveryMetadata = {
    lessonId: lesson.id, sampleRate: 24000, totalSamples: diagnostic.totalSamples,
    duration: diagnostic.duration, lessonSha256: sha256(english),
    phrases: diagnostic.phrases.map((phrase: CompleteDeliveryMetadata['phrases'][number]) => ({
      index: phrase.index, phraseId: `${lesson.id}:${phrase.index}`, en: phrase.en, ja: phrase.ja,
      start: phrase.start, end: phrase.end, startSample: phrase.startSample, endSample: phrase.endSample,
    })),
  };
  await mkdir(`${completeDeliveryRoot}/japanese-cues`, { recursive: true });
  const copies: Array<{ source: string; destination: string; originalSha256: string; copiedSha256: string; reuseReason: string }> = [];
  async function verifiedCopy(sourcePath: string, destination: string) {
    await copyFile(sourcePath, destination);
    const original = await readFile(sourcePath), copied = await readFile(destination);
    if (!original.equals(copied)) throw new Error(`Copy mismatch: ${destination}`);
    copies.push({ source: sourcePath.replace('web/public/', ''), destination: destination.replace('web/public/', ''),
      originalSha256: sha256(original), copiedSha256: sha256(copied), reuseReason: 'iPhone background-verified diagnostic audio; no TTS or re-encoding.' });
  }
  await verifiedCopy(`${diagnosticAssetRoot}/english/lesson.mp3`, `${completeDeliveryRoot}/lesson.mp3`);
  const assets = await expectedJapaneseAssets();
  for (const [index, original] of japanese.entries()) {
    const asset = assets.find(entry => entry.phraseId === `complete-delivery:${index}`)!;
    await verifiedCopy(original.path, `web/public/${asset.path}`);
    manifest.entries.push({ ...asset, config: japaneseGenerationConfig, sourceHash: sourceHash(asset),
      audioSha256: sha256(original.bytes), ...original.inspected });
  }
  const continuous = continuousPcm(decoded, metadata);
  const loudness = continuousTrainingConfig.loudnessNormalization;
  audioCommand(['-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0',
    '-af', `loudnorm=I=${loudness.integratedLoudness}:LRA=${loudness.loudnessRange}:TP=${loudness.truePeak}`,
    '-ar', '24000', '-c:a', continuousTrainingConfig.codec, `${completeDeliveryRoot}/continuous-training.mp3`], continuous.pcm);
  const hash = calculateTrainingAudioSourceHash(source);
  await writeFile(`${completeDeliveryRoot}/metadata.json`, JSON.stringify(metadata, null, 2) + '\n');
  await writeFile(`${completeDeliveryRoot}/source-hash.txt`, hash + '\n');
  await writeFile(`${completeDeliveryRoot}/audio-provenance.json`, JSON.stringify({
    version: 1, lessonId: lesson.id, source: 'training-scripts/complete-delivery.json', sourceSha256: sha256(source),
    sourceHash: hash, diagnosticMetadataSha256: sha256(diagnosticBytes.toString().replace(/\r\n/g, '\n')),
    diagnosticMetadataHashMethod: 'SHA-256 of UTF-8 metadata text with LF line endings', copies, originalEnglishAudit: originals,
    continuous: { reconstructionSource: 'lessons/complete-delivery/lesson.mp3',
      boundarySource: 'lessons/complete-delivery/metadata.json', config: continuousTrainingConfig,
      inputPcmSha256: sha256(continuous.pcm), totalSamples: continuous.totalSamples, segments: continuous.segments,
      audioSha256: sha256(await readFile(`${completeDeliveryRoot}/continuous-training.mp3`)) },
  }, null, 2) + '\n');
  await writeFile(japaneseManifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(await verifyCompleteDeliveryAssets()));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
