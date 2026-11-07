# Phase 5B-1 verification

Date: 2026-11-07 (Asia/Tokyo). Baseline HEAD: `811d93d1df635317981e9ef1b04661711ecbb10f`.

## Result

- Index: 20 lessons / 153 phrases; ETCL: 12 lessons / 68 phrases.
- Legacy: 8 lessons / 85 phrases, with identical complete lesson data and input order.
- Global signature: `fnv1a32:85:32bf4dac` before and after.
- Category signatures: `fnv1a32:85:a7bb76ae` before and after.
- All three modes preserve saved queue identities, current index and signature, resume without randomness, and exclude ETCL.
- Sequential category order remains Delivery first, then Everyday, with original phrase order.
- Original storage keys, lesson-selection persistence and playback engines are unchanged.
- Actual bundled UI test checks Delivery / Everyday / ETCL order and 20 buttons, including 12 ETCL buttons.
- `npm test`: 97 passed, 0 failed. `npm run web:build`: passed. `git diff --check`: passed.

## Source classification

The audited Phase 4B ETCL files have `domain: "everyday"`. With explicit user approval,
`src/training-script-domain.ts` maps only the 12 exact audited IDs to `etcl` when
read by index generation and legacy Japanese cue asset selection. The source bytes
remain untouched. Conflicting Delivery domains are rejected. Unknown domains,
missing required fields, empty phrase arrays and duplicate lesson IDs are rejected
by index generation; existing file-name sorting is retained.

## Service Worker (read-only inspection)

`web/public/sw.js` uses `importScripts('./training-audio-assets.js')` and
`self.EAG_TRAINING_AUDIO_ASSETS`. Installation opens `eag-training-v8`, runs
`cache.addAll` over static assets and training assets, then calls `skipWaiting`.
Activation deletes other cache names and calls `clients.claim`.

English lesson and continuous MP3s use cache-first retrieval. Cached audio Range
requests try the network first and synthesize a 206 response from cached full audio
when offline. Metadata uses network-first retrieval with cache fallback. The asset
list itself uses cache-first retrieval when requested through the fetch handler.

Japanese Cue MP3 paths are not special-cased or precached by this asset list. They
use the generic network-first path: successful HTTP 200 responses are cached and
network failures fall back to cached responses. HTTP 206 is not stored by that
path; cached Japanese Range response synthesis is not implemented.

This slice leaves the Service Worker and its cache version unchanged. The generated
audio list still has the same 24 existing paths. Missing ETCL files are omitted to
avoid failing the atomic `cache.addAll` install. No ETCL audio was copied. When audio
is introduced, regenerate the asset list and assess a cache-version rollout so
existing clients receive the intended precache and replace stale cache-first audio.
Verify installation/update and online/offline behavior on devices then.

## Integrity

SHA-256 comparison covered all 221 originally tracked files plus the 12 untracked
ETCL sources. Only the 11 intended originally tracked source/test/document/index
files changed. All 125 tracked MP3s and all 142 tracked MP3/metadata/source-hash
matching files remained byte-identical. `active-recall.ts`, `media-session.ts`,
`sw.js`, `training-audio-assets.js`, manifests and existing lesson sources are
unchanged. No Phase 4B external workspace was accessed or modified.

The original ETCL files remain untracked and byte-identical:

| Lesson ID | Phrases | SHA-256 (before = after) |
| --- | ---: | --- |
| etcl-01-talking-about-my-job | 5 | `9f8a727e70d665424e3e1618aa0a7af49a98a6c3601524c100e633739ad0f881` |
| etcl-02-daily-routine | 5 | `ee119d0a4b4d4f5d65b54e2e4d940ba6cf401bd64d114b56e270218816435743` |
| etcl-03-recent-events | 6 | `01175c051490b85cda27a287f959dcafe22eb4f11ceafdb4a7330873ac9643d2` |
| etcl-04-current-situation | 6 | `17b603da8624fa5fbd528b04ab8b1bc1221c7bfb442bb4213ff12b81eb9b6cf0` |
| etcl-05-reasons-and-decisions | 5 | `a40309f93c3f1745e903cc259b63c7edc79636c73030686076520d34d2e5bc3a` |
| etcl-06-preferences-and-priorities | 5 | `4a4468c009b979b7ed12c6f2a4193869db3dde89244c98986583939bbe75aac4` |
| etcl-07-asking-questions | 6 | `39ea38688b6a6fdc1affee86310dc1d5404269a75385f375d32c219ded9176eb` |
| etcl-08-responding-naturally | 6 | `acd5be40833dacb70f6cd738f643c4d6e48b58857b21ffc98d5ecf5bb187234a` |
| etcl-09-past-experiences | 6 | `b085cf879683333eb06959e41ec1e48903a684407460c59fa0f77ff798837a98` |
| etcl-10-explaining-problems | 6 | `51bbddec0dab746d29491d6bc187c3da0e52d36d37f3e59655770d6fb9e1241a` |
| etcl-11-plans-and-possibilities | 6 | `004a1778995ffce37e4c9f73d4a683c736f2a995f83aa715c17a09d1f95face4` |
| etcl-12-expressing-opinions | 6 | `210b28ef0f4a70996028680ec79fe00bf5305afe66e1eb619f26a2a5cf4735c0` |

Local detailed before/after hash snapshots and command logs are under the ignored
`output/phase-5b-1-verification/` directory. No API, TTS, prohibited generation
command, `git add`, commit or push was executed.

## Remaining scope / Phase 5B-2

ETCL normal playback is unverified because audio assets are absent. A separately
authorized follow-up must introduce audited English/Japanese audio and metadata,
verify mappings and source hashes, plan the cache rollout, and verify playback,
background behavior and offline handling. ETCL-specific Active Recall remains a
separate future design decision. This slice stops here.
