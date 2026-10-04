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

Run `npm run build:training` after changing a training script or an audio build
parameter. The source hash includes the ordered script content and all
Continuous Training timing, sample-rate, codec, and normalization settings.
The generated track is included in the PWA's offline precache.

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

The current normal library has **8 lessons / 85 phrases**. `complete-delivery`
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

## Development Status

Current status:

```text
EAG v0.1 MVP
```

The MVP is intended for real daily use before additional features are added.

Future improvements should primarily be driven by issues observed during actual English-learning use rather than by adding features in advance.
