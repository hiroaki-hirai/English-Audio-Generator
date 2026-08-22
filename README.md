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

## Development Status

Current status:

```text
EAG v0.1 MVP
```

The MVP is intended for real daily use before additional features are added.

Future improvements should primarily be driven by issues observed during actual English-learning use rather than by adding features in advance.
