# English Audio Generator

English Audio Generator (EAG) automatically creates practical English listen-and-repeat lessons for Uber Eats delivery situations.

The current MVP generates a realistic delivery scenario, five short English practice sentences, Japanese translations, speech audio, and an archived lesson set.

## Current MVP

EAG currently supports:

- AI-generated Uber Eats delivery scenarios
- Exactly 5 English practice sentences per lesson
- Japanese translation of the scenario and all 5 sentences
- Recent-scenario history to reduce repetition
- Deduplication of repeated scenario labels
- OpenAI text-to-speech
- `cedar` voice
- Each English sentence played twice
- 5-second practice pauses
- English text reference
- English/Japanese text reference
- Multiple lessons per day
- Date and sequence-based lesson archives
- One-command lesson generation

## Requirements

- Node.js
- npm
- FFmpeg
- OpenAI API access
- An OpenAI API key

This project was developed and tested with:

- Node.js 24
- FFmpeg 8
- TypeScript
- `tsx`

## Setup

Install dependencies:

```powershell
npm install
```

Create a `.env` file in the project root. You can copy `.env.example` and replace the placeholder with your API key.

```text
OPENAI_API_KEY=your_api_key_here
```

Do not commit `.env` or your API key to Git.

Confirm that FFmpeg is available:

```powershell
ffmpeg -version
```

Confirm that TypeScript validation passes:

```powershell
npx tsc --noEmit
```

## Usage

Generate a complete lesson with:

```powershell
npm run lesson
```

This command runs:

```text
generate:phrases
    ↓
generate:speech
    ↓
build:lesson
```

Equivalent commands:

```powershell
npm run generate:phrases
npm run generate:speech
npm run build:lesson
```

## Lesson Generation Flow

```text
Recent scenario archives
        ↓
Load recent unique scenarios
        ↓
Generate a different delivery scenario
        ↓
Generate 5 English practice sentences
        ↓
Generate Japanese translations
        ↓
Generate English speech with cedar
        ↓
Build repeat-and-pause lesson audio
        ↓
Create lesson reference files
        ↓
Archive the completed lesson
```

## Current Lesson Format

Each lesson contains one delivery scenario and exactly 5 English sentences.

Audio format:

```text
Sentence 1
5-second pause
Sentence 1 again
5-second pause

Sentence 2
5-second pause
Sentence 2 again
5-second pause

...
```

The current TTS voice is `cedar`.

The audio is intended for listen-and-repeat and shadowing practice.

Japanese translations are provided for reference only and are not included in the lesson audio.

## Current Output

The latest generated files are written under:

```text
output/
├─ lesson.mp3
├─ lesson.txt
└─ lesson-ja.txt
```

Intermediate phrase audio files are also generated under `output/`.

Completed lessons are archived using a date and sequence number:

```text
output/
└─ lessons/
   └─ YYYY-MM-DD/
      ├─ 01/
      │  ├─ lesson.mp3
      │  ├─ lesson.txt
      │  ├─ lesson-ja.txt
      │  └─ scenario.txt
      ├─ 02/
      │  └─ ...
      └─ 03/
         └─ ...
```

Multiple lessons generated on the same day receive increasing sequence numbers.

## Lesson Files

### `lesson.mp3`

The complete English listen-and-repeat audio lesson.

### `lesson.txt`

English text reference for the lesson.

### `lesson-ja.txt`

English and Japanese reference containing:

- English scenario label
- Japanese scenario translation
- Each English sentence
- Japanese translation of each sentence

### `scenario.txt`

The scenario label used for lesson-history tracking and repetition avoidance.

## Input Files

During generation, EAG uses:

```text
input/
├─ phrases.txt
├─ scenario.txt
└─ translations.txt
```

These files represent the current lesson before the final lesson files are assembled.

## Scenario Repetition Avoidance

EAG reads recent archived `scenario.txt` files before generating a new lesson.

Recent duplicate scenario labels are removed, and the remaining recent scenarios are sent as context so that the model can choose a meaningfully different delivery situation.

The current recent-scenario limit is 3 unique scenarios.

## Git-Ignored Files

The following are intentionally excluded from Git:

```text
node_modules/
output/
.env
.env.*
```

`.env.example` is explicitly allowed so that a safe configuration example can be committed.

## iPhone Background Continuous Training

The web app generates a separate `continuous-training.mp3` for each lesson.
For lessons without phrases marked Weak, the Start Training button plays this
single uninterrupted media resource with the following sequence:

```text
phrase
1-second pause
same phrase
5-second recall pause
```

This minimizes foreground JavaScript scheduling so iOS can keep the media
session playing when the installed PWA is in the background. Weak Phrase
Training and Meaning → English Active Recall retain their existing scheduled
playback paths and are not covered by background playback yet.

`npm run build:training` is an audio-generation command and can invoke paid TTS;
it is not part of CI or publication. Do not run it during release preparation.
Source hashes include exact script bytes and Continuous Training configuration.
Seven legacy hashes predate a domain-only JSON edit; they are pinned historical
exceptions, not permission to regenerate or overwrite assets. See
[source-hash investigation and policy](docs/LEGACY-SOURCE-HASH-AUDIT.md).

## Active Recall Japanese cues

Normal Active Recall (8 lessons / 85 phrases) defaults to pre-generated Japanese MP3 cues.
The selector retains **Speech Synthesis (legacy/debug)**; MP3 errors stop the run
without automatic fallback. Normal and diagnostic cue assets remain separate.
See [generation, verification and iPhone test procedure](docs/65-PHRASE-JAPANESE-MP3.md).

## 20-Cue background diagnostic

Use **Start Fresh 20-Cue MP3 Diagnostic** for the independent, memory-only
Japanese MP3 / English lesson experiment. It preserves normal saved progress
and the existing 3-Cue test. See [fixture, timing tables and verification](docs/20-CUE-DIAGNOSTIC.md).
The user confirmed completion of all 20 cues on iPhone Safari, including
Japanese-to-English transitions while another app was in the foreground.
That playback control path is reused by normal Active Recall. The user also
confirmed normal Japanese MP3 playback and background continuation on iPhone Safari
after the original 65-phrase migration. Separate exhaustive Weak/Resume results
were not supplied. The new 85-phrase library still requires its own device verification.

## Complete Delivery / 受け渡し総合

The legacy Active Recall library has **8 lessons / 85 phrases**. `complete-delivery`
is an independent 20-phrase Delivery lesson covering arrival, order verification,
cash payment, change, handoff, PIN and closing. Its exact script and 21 copied
English/Japanese assets come from the iPhone background-verified 20-Cue diagnostic.
The diagnostic remains independent and unchanged.

The new lesson also includes Continuous Training (English twice, 1-second repeat
interval, 5-second recall). This track is constructed from the completed normal
lesson's measured segments without TTS. See [asset provenance and verification](docs/COMPLETE-DELIVERY.md).

Adding this lesson changes the library signature. Existing 65-phrase Active Recall
sessions start a fresh 85-phrase queue once (`library-signature-mismatch`); no
session migration is performed. Existing Weak identities remain intact. Sessions
saved with the new library resume normally. Global Shuffle uses all 85 phrases;
category modes use 8 lessons. Start Training uses the selected lesson only.

## ETCL integration (local release candidate)

The lesson selector lists Delivery, Everyday, then ETCL. The generated index
contains **20 lessons / 153 phrases**, including **12 ETCL lessons / 68 phrases**.
The audited ETCL source files retain their original `everyday` domain and bytes;
`src/training-script-domain.ts` maps their exact IDs to `etcl` when generating
the index. File-name sorting and the eight legacy lessons remain unchanged.

All three existing Active Recall modes and normal Japanese cue asset validation
remain limited to Delivery and Everyday (**8 lessons / 85 phrases**), preserving
queue order, library signatures and storage keys. ETCL Active Recall is deferred.

ETCL audio is placed locally: **116 files**, including 12 lesson tracks, 12
Continuous Training tracks, 12 metadata files, 12 source hashes and 68 Japanese
cues. Copy integrity, source hashes and MP3 decoding were verified. Device playback
and the real GitHub migration remain unverified; **production publication is HOLD**.

## Development Status

### CI and publication safety

The local workflow definitions separate push/PR validation and verified candidate
artifacts from manual Pages publication. The GitHub main branch still has the old
automatic publication workflow until the approved migration; disable and verify
that old workflow before any main push. Local manual publication is currently
hard-blocked pending final publication audit and explicit approval. Legacy asset
retention and package verification are implemented; see
[retention storage and packaging](docs/LEGACY-ASSET-RETENTION.md).
See [candidate format, permissions and safe workflow migration](docs/CI-AND-DEPLOYMENT.md).

### Verified asset manifests

`npm run web:build` now generates separate verified audio and app startup manifests
after Vite completes. They contain public URLs, byte sizes, SHA-256 hashes and a
shared deterministic release ID. They cover **222 assets: 213 audio/metadata and
9 app startup assets**, including all 153 Japanese cues. The new Worker consumes
these manifests for verified migration. The legacy 24-path array is retained only
for its compatibility contract; it does not define the new precache inventory.
See [schema, build order and validation](docs/VERIFIED-ASSET-MANIFESTS.md).

Current status:

```text
EAG v0.1 MVP
```

The MVP is intended for real daily use before additional features are added.

Future improvements should primarily be driven by issues observed during actual English-learning use rather than by adding features in advance.

## Verified cache migration (Phase 5B-2B-2)

Production builds bind the Service Worker to verified manifests. Installation
reuses byte-verified old responses, downloads missing assets, and records completion
only after every required file passes verification. Updates wait for old clients
to close. Initial pages are not forcibly claimed either; after activation, normal
navigation starts Worker control. Previous
and unrelated caches are retained. Phase 5B-2B-3 adds verified offline single-range
responses for English, Continuous Training and Japanese Cue audio, including suffix
ranges. Multiple ranges are forwarded online and return an explicit 503 when offline.
See [migration, recovery and publishing constraints](docs/VERIFIED-CACHE-MIGRATION.md).
