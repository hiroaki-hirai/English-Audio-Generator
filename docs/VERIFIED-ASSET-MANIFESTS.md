# Verified asset manifest foundation (Phase 5B-2B-1)

## Scope and compatibility

Phase 5B-2B-1 introduced verification data only. Phase 5B-2B-2 now consumes it
through [verified cache migration](VERIFIED-CACHE-MIGRATION.md). Neither slice
adds ETCL to Active Recall or regenerates audio/lesson sources.

The existing `self.EAG_TRAINING_AUDIO_ASSETS` array remains an array of the same
24 Delivery/Everyday paths. Index generation explicitly limits that legacy array
to those domains while continuing to register all 20 lessons in the lesson index.
The separate verified audio manifest covers all 20 lessons. The legacy Japanese
cue verifier still verifies its 85 files, excluding only the 12 audited ETCL IDs
from its extra-file scan; the new manifest validation covers those ETCL files.

## Build order

`npm run web:build` runs, in order:

1. `generate:training-index`: regenerate the 20-lesson index and legacy 24-path array.
2. `vite build`: copy public assets, emit HTML/bundles, and produce `.vite/manifest.json`.
3. `tsx src/generate-verified-asset-manifests.ts`: resolve the Vite configuration,
   scan the completed output, bind the output Worker to this build, hash its final
   bytes, then write:
   - `web/dist/verified-audio-assets.json`
   - `web/dist/verified-app-assets.json`

Both collections are validated before either output is written. Generation errors
fail the build; an output directory from a failed build must not be published.
There is no second Vite build, timestamp, random ID, or self-referencing hash.
Both verified manifests and Vite's internal dependency manifest are excluded from
the verified asset collections. Generated output remains under ignored `web/dist`.

The standalone post-build command can be rerun on the same completed output without
changing the resulting bytes. Run it only after a successful Vite build.

## Schema version 1

Both files use the following JSON structure:

```json
{
  "schemaVersion": 1,
  "kind": "audio",
  "basePath": "/English-Audio-Generator/",
  "releaseId": "<64 lowercase hexadecimal characters>",
  "workerBuildId": "<64 lowercase hexadecimal characters>",
  "assets": [
    {
      "path": "lessons/basic-delivery/lesson.mp3",
      "url": "/English-Audio-Generator/lessons/basic-delivery/lesson.mp3",
      "size": 12345,
      "sha256": "<64 lowercase hexadecimal characters>"
    }
  ]
}
```

- `workerBuildId` binds the installed Worker to this build (required by the new
  cache consumer). Normalize the Worker declaration to its placeholder, hash the
  resulting asset collections with the release formula below, then stamp that ID
  into the output Worker. Finally compute `releaseId` from the final raw Worker
  bytes. Source `web/public/sw.js` retains its placeholder. This breaks the hash
  self-reference cycle and is deterministic on repeated post-build generation.
- `kind` is `audio` or `app`.
- `path` is relative to the completed Vite output directory.
- `url` is the same-origin pathname formed from the configured base and path.
- `size` is the byte length of the file actually read, not a filesystem estimate.
- `sha256` hashes the complete raw file bytes.
- `releaseId` is shared by the two manifests. It is SHA-256 over UTF-8
  `JSON.stringify({ schemaVersion: 1, basePath, audio, app })`, where `audio` and
  `app` are their sorted asset arrays, in that property order. Array entry property
  order is `path`, `url`, `size`, `sha256`.

Entries use deterministic JavaScript string sorting by path, fixed property order,
two-space JSON indentation and one final LF. Neither manifest includes itself or
its sibling. The release ID identifies content; it is not a signature or proof of
origin. A future consumer must trust the manifest's delivery and verify bytes
before migration. Generation does not implement that browser-side consumer.

## Audio collection

The generated lesson index supplies IDs and phrase counts. Each ID must match the
lowercase hyphenated filename convention and be unique. For every lesson, require:

- `lesson.mp3`, `continuous-training.mp3`, `metadata.json`;
- exactly `japanese-cues/phrase-001.mp3` through the lesson's final phrase.

Unexpected cue names, missing/empty files, invalid IDs and duplicate paths fail
generation. The current collection is 60 English/continuous/metadata files plus
153 Japanese cues: **213 entries / 28,491,461 bytes**. Source hashes, provenance,
diagnostic fixtures and generation manifests are not playback assets and are not
included in this collection.

## App startup collection

Read Vite's actual `.vite/manifest.json`; include emitted files, CSS, assets, static
imports and dynamic imports. Missing referenced chunks fail generation. Do not
guess hashed filenames. Inspect emitted HTML for script/link/image/source URLs;
follow CSS `url()` and `@import`, and webmanifest icons, start URL and scope.
Also include the existing `sw.js` and its `training-audio-assets.js` import.

The current collection has 9 entries: HTML, bundle JS, bundle CSS, webmanifest,
three icons, Service Worker and its legacy asset array. Vite's graph deduplicates
shared references. Final validation rejects case-insensitive path collisions.
Future changes that add resources at runtime through computed JS URLs must extend
the explicit startup seed list or use Vite-tracked imports; a manifest cannot
infer arbitrary runtime URLs. Lesson playback URLs belong to the audio collection.

HTML `base` and `srcset`, unquoted asset URL attributes, external references,
percent-encoded references and query strings fail closed rather than silently
claiming complete coverage. Inline data URLs and fragment-only CSS references do
not require a file. This scanner covers the current emitted app and tested Vite
dependency graph; new HTML/resource mechanisms require corresponding tests.

## Paths and future Service Worker consumption

Supported Vite bases are absolute same-origin directory paths (`/`, `/EAG/`, or
`/nested/EAG/`). Relative (`./`) and external/CDN bases fail explicitly. Asset paths
reject absolute paths, backslashes, empty/dot/traversal segments, query/fragment
syntax, percent escapes and unsupported characters. Real paths must remain inside
the output root, including when a symlink is encountered. Files must be nonempty
regular files. Duplicate/case-colliding public paths are errors.

A future Service Worker can `fetch()` these JSON files and obtain the URL, size,
SHA-256 and release identity. It must map a navigation to the base directory to
the `index.html` entry if it wants offline root navigation. Phase 5B-2B-2 implements this routing and migration. The manifests are fetched
during install with `cache: no-store`; they are not read from old Cache Storage.

## Verification

Tests cover the 20-lesson/213-file collection, independent byte-size/SHA checks,
duplicates, invalid IDs and paths, missing files, cue sequence errors, shared
release identity, deterministic regeneration with old output manifests present,
and a real isolated Vite build with dynamic imports, CSS/public dependencies and
a nested base. Existing legacy signatures remain:

- Global: `fnv1a32:85:32bf4dac`
- Sequential category modes: `fnv1a32:85:a7bb76ae`

The cache migration slice tests partial HTTP responses, update failures,
interruption and old cue preservation in a VM. Real iPhone Safari validation and
Range behavior extensions remain separate work.
