# English Audio Generator --- Development History

## 1. Overview

**English Audio Generator (EAG)** is a personal English-learning tool
that automatically creates practical listen-and-repeat lessons for
realistic Uber Eats delivery situations.

The v0.1.0 MVP was developed incrementally using small Vertical Slices.
Rather than designing a large system up front, each slice added one
usable capability, was validated in actual execution, and then became
the foundation for the next slice.

The MVP reached its first public milestone on **2026-08-23** with:

-   one-command lesson generation
-   AI-generated delivery scenarios
-   exactly five short English practice sentences
-   Japanese translations
-   OpenAI text-to-speech
-   repeated listen-and-repeat playback with pauses
-   text reference files
-   scenario-history-based repetition avoidance
-   date and sequence-based lesson archives
-   README / setup documentation
-   semantic version `0.1.0`
-   Git tag `v0.1.0`
-   publication to GitHub

Repository:

`hiroaki-hirai/English-Audio-Generator`

------------------------------------------------------------------------

## 2. Project Goal

The original goal was not to build a general-purpose English-learning
platform.

The goal was to create a small system that could continuously generate
**practical English material tailored to situations likely to occur
during food delivery work**, so that new material could be used for
listening, shadowing, and speaking practice without manually preparing
every lesson.

The desired daily workflow eventually became:

``` text
Generate a new scenario
        ↓
Generate 5 practical English sentences
        ↓
Generate Japanese translations
        ↓
Generate speech for all sentences
        ↓
Build repeated listen-and-repeat audio
        ↓
Create text reference files
        ↓
Archive the completed lesson
```

The final MVP exposes that entire workflow through:

``` powershell
npm run lesson
```

------------------------------------------------------------------------

## 3. Development Principles

### 3.1 Vertical Slice development

EAG was built as a sequence of small end-to-end capabilities.

Each slice was intentionally kept narrow enough to:

1.  implement quickly,
2.  validate directly,
3.  understand the behavior before expanding it,
4.  commit as an independent step,
5.  use the result to decide the next slice.

This prevented the project from becoming a large speculative
implementation before the basic learning workflow had been proven
useful.

### 3.2 Real-use validation

The project was repeatedly tested by actually generating lesson material
and listening to the resulting MP3 files.

The development process therefore included more than TypeScript
compilation. Validation also covered questions such as:

-   Does the generated English sound usable in a real delivery
    situation?
-   Does the audio correspond to the generated text?
-   Are the pauses suitable for listen-and-repeat practice?
-   Does a new lesson meaningfully differ from recent lessons?
-   Are Japanese translations useful as a reference?
-   Can multiple lessons be generated on the same day without
    overwriting one another?
-   Does the archive accurately represent completed lessons?

### 3.3 Build only what current use requires

The MVP intentionally remained small.

Features were added when the existing workflow exposed a concrete need.
For example:

-   repetition avoidance was added after repeated lesson situations
    became a concern,
-   scenario metadata was introduced to make repetition detection more
    reliable,
-   numbered archives were added when multiple lessons per day became
    necessary,
-   Japanese references were added after the English/audio workflow was
    already working.

This kept the project focused on actual learning value.

------------------------------------------------------------------------

## 4. Development Timeline

## Phase 1 --- Minimal phrase and speech pipeline

### Vertical Slice 1 --- Initial phrase loading

**Commit:** `bf02fe3 feat: add initial phrase loading slice`

The project began with the smallest useful input pipeline: loading
English practice phrases from a file.

This established the basic idea that lesson content could be represented
as simple text input and processed programmatically.

The important result was not yet a complete lesson. It was a reliable
boundary between lesson content and the code that would later transform
that content.

------------------------------------------------------------------------

### Vertical Slice 2 --- Initial text-to-speech generation

**Commit:** `f89a1cd feat: add initial text-to-speech generation`

OpenAI text-to-speech was introduced for the first time.

The system could now turn an English phrase into an audio file, proving
the central technical assumption of the project: generated lesson text
could become usable listening material automatically.

------------------------------------------------------------------------

### Vertical Slice 3 --- Speech generation for all phrases

**Commit:** `e2edc50 feat: generate speech for all phrases`

The TTS pipeline was expanded from a single phrase to the complete
phrase input.

Each phrase received its own generated MP3 file.

This established the intermediate audio structure later used by the
lesson builder.

------------------------------------------------------------------------

## Phase 2 --- Listen-and-repeat lesson construction

### Vertical Slice 4 --- Build lesson audio with repeat pauses

**Commit:** `c23a5f4 feat: build lesson audio with repeat pauses`

Individual phrase audio files were combined into a lesson.

FFmpeg was used to construct the final audio and insert silence for
speaking practice.

The emerging lesson pattern became:

``` text
Sentence
5-second pause
Sentence again
5-second pause
```

This transformed EAG from a TTS experiment into a practical
listen-and-repeat tool.

------------------------------------------------------------------------

### Vertical Slice 5 --- Derive lesson phrase count from input

**Commit:** `1454619 refactor: derive lesson phrase count from input`

The lesson builder was refactored so that its behavior was derived from
the actual input rather than depending unnecessarily on duplicated
assumptions.

This improved the internal consistency of the lesson-generation
pipeline.

------------------------------------------------------------------------

### Vertical Slice 6 --- Repeated lesson playback and Cedar voice

**Commit:** `2c00e44 feat: add repeated lesson playback and cedar voice`

The lesson format was refined for repeated practice, and the TTS voice
was standardized on `cedar`.

At this stage, the characteristic EAG audio format was largely
established:

-   short practical sentence
-   spoken twice
-   five-second practice pauses
-   consistent voice

------------------------------------------------------------------------

### Vertical Slice 7 --- Lesson text reference

**Commit:** `eeaf469 feat: generate lesson text reference`

A text companion file was added.

The resulting `lesson.txt` made it possible to confirm the exact English
contained in the generated audio and use the lesson for reading or
review as well as listening.

This also became useful during development because the generated audio
could be checked against a deterministic text reference.

------------------------------------------------------------------------

## Phase 3 --- Automatic daily lesson generation

### Vertical Slice 8 --- Generate delivery practice phrases

**Commit:** `d96a441 feat: generate daily delivery practice phrases`

The project moved beyond manually supplied lesson text.

OpenAI generation was introduced to create practical English sentences
for realistic Uber Eats delivery situations.

The generator was constrained toward short spoken English suitable for
listen-and-repeat practice.

This was a major transition: EAG could now generate the learning content
itself rather than merely convert prepared text into audio.

------------------------------------------------------------------------

### Vertical Slice 9 --- One-command lesson generation

**Commit:** `92153ff feat: add one-command lesson generation`

The individual generation stages were connected through npm scripts.

The full workflow became:

``` text
generate:phrases
    ↓
generate:speech
    ↓
build:lesson
```

and could be run with:

``` powershell
npm run lesson
```

This was an important usability milestone. Generating a lesson no longer
required manually executing every internal stage.

------------------------------------------------------------------------

## Phase 4 --- Lesson history and variation

### Vertical Slice 10 --- Archive lessons by date

**Commit:** `0de8368 feat: archive lessons by date`

Completed lessons began to be archived rather than existing only as the
latest generated output.

The initial archive structure grouped lessons by generation date.

This created the first persistent history of learning material.

------------------------------------------------------------------------

### Vertical Slice 11 --- Avoid recent lesson repetition

**Commit:** `0453144 feat: avoid recent lesson repetition`

Once lessons could be generated repeatedly, a new practical problem
appeared: generated situations could become too similar.

Recent lesson information was therefore supplied as generation context
so the model could choose a meaningfully different delivery situation.

This was the first step toward making EAG suitable for continuous daily
use rather than isolated generation.

------------------------------------------------------------------------

### Vertical Slice 12 --- Separate phrase-generation instructions

**Commit:** `a2f800d fix: separate phrase generation instructions`

The generation prompt/instruction structure was corrected and clarified.

This slice reflects an important lesson from AI-assisted content
generation: prompt structure is part of application behavior and should
be treated as implementation logic rather than incidental text.

------------------------------------------------------------------------

### Vertical Slice 13 --- Scenario metadata

**Commit:** `ce9bb0b feat: add lesson scenario metadata`

A dedicated scenario label was introduced.

Instead of trying to infer lesson identity only from the generated
practice sentences, each lesson could now explicitly record its main
situation in `scenario.txt`.

Examples produced during development included:

``` text
Missing Gate Code
Customer Doesn't Answer
Spilled Drink
Order Not Ready
```

This made the lesson history easier for both the program and the
developer to understand.

------------------------------------------------------------------------

### Scenario-history refactor --- Use metadata for repetition avoidance

**Commit:**
`681f327 refactor: use scenario metadata for repetition avoidance`

Repetition avoidance was refactored to use the dedicated scenario
metadata.

This reduced coupling between the repetition logic and the full lesson
text and gave the system a cleaner representation of what constitutes
the lesson's main situation.

------------------------------------------------------------------------

## Phase 5 --- Multiple lessons per day

### Vertical Slice 14 --- Save multiple same-day lessons sequentially

**Commit:** `b4a57b4 feat: archive multiple lessons per day`

The original date-only archive structure was insufficient when more than
one lesson was generated on the same day.

The archive format was changed to use sequence directories:

``` text
output/
└─ lessons/
   └─ YYYY-MM-DD/
      ├─ 01/
      ├─ 02/
      ├─ 03/
      └─ ...
```

The next sequence number is determined from existing numbered
directories.

This allows repeated lesson generation without overwriting earlier
material from the same day.

------------------------------------------------------------------------

### Vertical Slice 15 --- Read scenarios from numbered archives

**Commit:** `df58745 refactor: read scenarios from numbered archives`

The scenario-history reader was updated to match the new archive
structure.

Repetition avoidance could therefore continue working after the archive
format changed from date-only directories to date-plus-sequence
directories.

This was an important consistency refactor: a storage change was not
considered complete until downstream history behavior understood the new
structure.

------------------------------------------------------------------------

### Vertical Slice 16 --- Deduplicate recent scenarios

**Commit:** `5711ff2 refactor: deduplicate recent scenarios`

Recent scenario context was refined so duplicate scenario labels did not
unnecessarily consume the limited history window.

The generator now works from recent **unique** scenarios.

The MVP's recent-scenario limit was set to three unique scenarios.

This improved the usefulness of the context sent to the model and made
variation control more intentional.

------------------------------------------------------------------------

## Phase 6 --- Japanese reference material

### Vertical Slice 17 --- Generate and save Japanese translations

**Commit:** `724d026 feat: add Japanese lesson translations`

Japanese translations were added for:

-   the scenario label,
-   all five English practice sentences.

Generation now produces:

``` text
input/
├─ scenario.txt
├─ phrases.txt
└─ translations.txt
```

The lesson builder creates:

``` text
output/lesson-ja.txt
```

with English and Japanese paired together.

A validated example was:

``` text
Scenario: Spilled Drink
シチュエーション: ドリンクをこぼしてしまった

01. I'm sorry, but one of the drinks spilled.
    申し訳ありませんが、ドリンクを1つこぼしてしまいました。
```

Japanese remains reference material only; it is not inserted into the
English practice audio.

This preserves the audio's immersion/listen-and-repeat purpose while
still providing immediate comprehension support.

------------------------------------------------------------------------

### Vertical Slice 18 --- Archive creation timing fix

**Commit:** `8148c8e fix: create archive directory after lesson build`

During validation, archive-directory creation was found to occur too
early in the process.

If lesson construction failed after the numbered archive directory had
already been created, an empty sequence directory could remain behind.

The creation of the archive directory was moved until after the lesson
audio had been built successfully.

This was a small code change but an important reliability improvement:

> an archive directory should represent a completed lesson, not merely
> an attempted lesson build.

This issue was observed during actual execution rather than anticipated
in advance, reinforcing the value of running the real workflow between
slices.

------------------------------------------------------------------------

## Phase 7 --- MVP documentation and release

### Vertical Slice 19 --- README / MVP usage guide

**Commit:** `cf782de docs: add EAG MVP usage guide`

The project received its first complete README.

The documentation records:

-   project purpose,
-   current MVP capabilities,
-   requirements,
-   setup procedure,
-   `.env` configuration,
-   FFmpeg requirement,
-   TypeScript validation,
-   one-command usage,
-   lesson-generation flow,
-   audio format,
-   output structure,
-   archive structure,
-   lesson files,
-   input files,
-   scenario repetition avoidance,
-   Git-ignored files,
-   current MVP status.

A safe configuration template was also added:

``` text
.env.example
```

containing:

``` text
OPENAI_API_KEY=your_api_key_here
```

The real `.env` remains excluded from Git.

------------------------------------------------------------------------

### MVP version alignment

**Commit:** `b79a81e chore: set MVP version to 0.1.0`

`package.json` and `package-lock.json` were aligned with the actual
project maturity:

``` json
"version": "0.1.0"
```

This corrected the initial npm default version of `1.0.0` and
established the first explicit semantic version for EAG.

------------------------------------------------------------------------

## 5. v0.1.0 Acceptance Validation

Before treating the MVP as complete, the full real-use workflow was
executed:

``` powershell
npm run lesson
```

The validated run generated the scenario:

``` text
Order Not Ready
```

with five phrases:

``` text
Hi, I'm picking up order 428.
Is it still being prepared?
How much longer will it take?
I'll wait by the door.
Thanks, I'll take it now.
```

The pipeline successfully:

1.  generated the scenario,
2.  generated exactly five English sentences,
3.  generated Japanese translations,
4.  generated five phrase MP3 files,
5.  built the repeated lesson audio,
6.  generated `lesson.txt`,
7.  generated `lesson-ja.txt`,
8.  archived the completed lesson.

The resulting archive was:

``` text
output/lessons/2026-08-23/07/
├─ lesson-ja.txt
├─ lesson.mp3
├─ lesson.txt
└─ scenario.txt
```

The Japanese reference was manually inspected and confirmed to
correspond to the English lesson.

TypeScript validation also passed:

``` powershell
npx tsc --noEmit
```

After acceptance testing, generated tracked input changes were restored
so the repository returned to a clean state.

------------------------------------------------------------------------

## 6. v0.1.0 Release

The MVP release was tagged locally as:

``` text
v0.1.0
```

using an annotated Git tag:

``` powershell
git tag -a v0.1.0 -m "EAG v0.1.0 MVP"
```

The tag points to:

``` text
b79a81e chore: set MVP version to 0.1.0
```

The repository was then connected to GitHub:

``` text
git@github.com:hiroaki-hirai/English-Audio-Generator.git
```

and both the `main` branch and `v0.1.0` tag were pushed successfully.

Final verified state:

``` text
b79a81e (HEAD -> main, tag: v0.1.0, origin/main)
```

with a clean working tree.

This marks the completion of the first EAG MVP.

------------------------------------------------------------------------

## 7. Final v0.1.0 Architecture

### Generation pipeline

``` text
Recent archived scenarios
        ↓
Load recent unique scenario metadata
        ↓
OpenAI generates a different delivery scenario
        ↓
Generate exactly 5 short English practice sentences
        ↓
Generate scenario + sentence Japanese translations
        ↓
Write current input files
        ↓
OpenAI TTS generates phrase audio
        ↓
FFmpeg builds repeated lesson audio
        ↓
Generate English reference
        ↓
Generate English/Japanese reference
        ↓
Create numbered archive directory
        ↓
Archive completed lesson
```

### Main source responsibilities

``` text
src/generate-phrases.ts
    AI scenario / phrase / translation generation
    recent-scenario loading
    repetition-avoidance context

src/generate-speech.ts
    phrase-level OpenAI TTS generation

src/build-lesson.ts
    lesson text generation
    Japanese reference generation
    silence generation
    FFmpeg lesson assembly
    archive sequence selection
    completed-lesson archiving
```

### Current lesson files

Latest generated lesson:

``` text
output/
├─ lesson.mp3
├─ lesson.txt
└─ lesson-ja.txt
```

Current generation input:

``` text
input/
├─ phrases.txt
├─ scenario.txt
└─ translations.txt
```

Completed archive:

``` text
output/
└─ lessons/
   └─ YYYY-MM-DD/
      └─ NN/
         ├─ lesson.mp3
         ├─ lesson.txt
         ├─ lesson-ja.txt
         └─ scenario.txt
```

------------------------------------------------------------------------

## 8. Key Technical Decisions

### Exactly five practice sentences

The MVP intentionally standardizes lessons at five English sentences.

This keeps lessons short enough for repeated daily practice and
simplifies validation of generated output.

### Scenario metadata separated from lesson text

A short scenario label is stored independently in `scenario.txt`.

This provides a lightweight semantic identifier for repetition avoidance
without requiring the application to compare complete lesson texts.

### Recent unique scenarios rather than unlimited history

Only a small recent context is supplied to generation.

The current limit is three unique scenarios.

The goal is not global uniqueness forever; it is to reduce noticeable
repetition during normal recent use.

### Japanese as reference, not audio

Japanese translations are generated and stored, but the audio remains
English-only.

This keeps the listening exercise focused while preserving a convenient
comprehension reference.

### Date + sequence archive structure

A date alone is not a unique lesson identifier because multiple lessons
may be generated on the same day.

The archive therefore uses:

``` text
YYYY-MM-DD/NN
```

where `NN` increases for each lesson.

### Archive only after successful lesson construction

The numbered archive directory is created only after the main lesson
build succeeds.

This avoids treating failed build attempts as completed archived
lessons.

### FFmpeg for lesson assembly

TTS generation and lesson assembly are separate responsibilities.

OpenAI produces phrase speech, while FFmpeg handles silence and
concatenation into the final practice format.

This keeps audio composition deterministic and locally controllable.

------------------------------------------------------------------------

## 9. Problems Encountered and What They Revealed

### Repeated scenarios

As generation was used repeatedly, similar delivery situations appeared.

**Response:** add recent-history context, then introduce explicit
scenario metadata, then deduplicate recent scenarios.

**Lesson:** generated content needs application-level memory and
constraints when diversity matters.

------------------------------------------------------------------------

### Date-only archives were insufficient

Generating multiple lessons on the same day required more than a
date-based directory.

**Response:** introduce sequential subdirectories such as `01`, `02`,
and `03`.

**Lesson:** storage identifiers should reflect actual usage patterns
rather than assumed frequency.

------------------------------------------------------------------------

### Archive structure changes affected history reading

Once numbered archives were introduced, repetition-avoidance code also
had to understand the new hierarchy.

**Response:** refactor scenario loading to read numbered lesson
archives.

**Lesson:** persistence structure is an application contract; changes
must be traced through every reader and writer.

------------------------------------------------------------------------

### Duplicate scenario labels reduced useful context

Repeated labels could occupy multiple positions in a small
recent-history window.

**Response:** deduplicate recent scenario labels before applying the
limit.

**Lesson:** context quality matters as much as context quantity when
supplying history to an AI model.

------------------------------------------------------------------------

### FFmpeg could not overwrite an open lesson file

During development, `output/lesson.mp3` was still in use and FFmpeg
failed with:

``` text
Permission denied
```

The immediate resolution was to close/release the file and remove it
before rebuilding.

**Lesson:** local media workflows can fail because of operating-system
file locks even when application logic is correct.

This is a useful future reliability consideration if EAG later gains a
more automated playback workflow.

------------------------------------------------------------------------

### Failed builds could leave empty archive directories

A numbered archive directory was initially created before the final
lesson build completed.

**Response:** move archive-directory creation until after successful
audio construction.

**Lesson:** persistent state should ideally be created at the point
where the application can truthfully regard the operation as complete.

------------------------------------------------------------------------

### `.env.example` naming mattered

During README setup, an initial `env.example` file did not match the
intended `.env.example` name and therefore did not correspond to the
`.gitignore` exception.

The file was corrected to:

``` text
.env.example
```

**Lesson:** configuration documentation, ignore rules, and actual
filenames must be validated together.

------------------------------------------------------------------------

### Initial package version did not represent project maturity

The npm-generated package metadata initially used `1.0.0`, while the
project itself was reaching its first MVP.

**Response:** align both package files to `0.1.0`.

**Lesson:** version metadata should communicate the actual release state
rather than remain an unnoticed tool default.

------------------------------------------------------------------------

## 10. Development Practices That Worked Well

### Small commits

The Git history preserves the evolution of the system in understandable
steps.

Examples:

``` text
feat: add initial text-to-speech generation
feat: build lesson audio with repeat pauses
feat: generate daily delivery practice phrases
feat: archive lessons by date
feat: add lesson scenario metadata
feat: archive multiple lessons per day
feat: add Japanese lesson translations
docs: add EAG MVP usage guide
```

This makes the history useful not only for rollback but also as
technical documentation.

### Compile validation throughout development

The project repeatedly used:

``` powershell
npx tsc --noEmit
```

before commits and acceptance checks.

### Git cleanliness checks

Development frequently used:

``` powershell
git status
git diff --check
git diff --cached --check
git diff --cached --stat
```

This kept commits scoped and made unintended changes visible before
commit.

### Manual output inspection

Generated text and Japanese references were inspected directly with
PowerShell, for example:

``` powershell
Get-Content output\lesson-ja.txt -Encoding utf8
```

Audio was also played and compared against the text.

This was particularly important because successful compilation alone
cannot establish that an English-learning artifact is correct or useful.

------------------------------------------------------------------------

## 11. Lessons Learned

### 11.1 A useful MVP can emerge from very small slices

EAG did not begin with automatic generation, translation, archives, and
history.

It began by loading phrases.

The progression was roughly:

``` text
text
→ speech
→ complete speech set
→ lesson audio
→ repeat format
→ text reference
→ AI generation
→ one-command workflow
→ archives
→ repetition avoidance
→ metadata
→ multiple lessons/day
→ Japanese reference
→ documentation
→ release
```

Each step remained understandable because it extended a working system.

### 11.2 Actual use exposes better requirements than speculation

Several important improvements came from running the system:

-   scenario repetition,
-   multiple lessons on one day,
-   duplicate history entries,
-   file locking,
-   empty archive directories,
-   the need for Japanese reference material.

These were concrete problems, not hypothetical feature ideas.

### 11.3 AI generation benefits from structured metadata

Once `scenario.txt` existed, the application had a simple semantic
representation of each lesson.

That made repetition avoidance cleaner and archive contents more
understandable.

### 11.4 Generated learning content still needs deterministic validation

The AI generates content, but the application validates structural
expectations:

-   exact output line counts,
-   one scenario,
-   exactly five English phrases,
-   scenario translation,
-   exactly five phrase translations.

This combination of probabilistic generation and deterministic checks is
an important design pattern for future EAG development.

### 11.5 A release includes more than working code

The MVP was not considered complete immediately after the feature set
worked.

The final phase also included:

-   README,
-   safe environment template,
-   acceptance run,
-   clean Git state,
-   correct package version,
-   annotated release tag,
-   remote repository,
-   push of branch and tag.

That turns a local experiment into a reproducible project milestone.

------------------------------------------------------------------------

## 12. Git History Through v0.1.0

The core development history through the MVP release is:

``` text
b79a81e chore: set MVP version to 0.1.0
cf782de docs: add EAG MVP usage guide
8148c8e fix: create archive directory after lesson build
724d026 feat: add Japanese lesson translations
5711ff2 refactor: deduplicate recent scenarios
df58745 refactor: read scenarios from numbered archives
b4a57b4 feat: archive multiple lessons per day
681f327 refactor: use scenario metadata for repetition avoidance
ce9bb0b feat: add lesson scenario metadata
a2f800d fix: separate phrase generation instructions
0453144 feat: avoid recent lesson repetition
0de8368 feat: archive lessons by date
92153ff feat: add one-command lesson generation
d96a441 feat: generate daily delivery practice phrases
eeaf469 feat: generate lesson text reference
2c00e44 feat: add repeated lesson playback and cedar voice
1454619 refactor: derive lesson phrase count from input
c23a5f4 feat: build lesson audio with repeat pauses
e2edc50 feat: generate speech for all phrases
f89a1cd feat: add initial text-to-speech generation
bf02fe3 feat: add initial phrase loading slice
```

Release:

``` text
v0.1.0 — EAG v0.1.0 MVP
```

------------------------------------------------------------------------

## 13. Current MVP Boundary

EAG v0.1.0 should be treated as a **usable learning MVP**, not a
finished learning platform.

The current scope is deliberately narrow:

> Generate a fresh, practical Uber Eats English lesson and turn it into
> repeatable audio plus reference material with minimal user effort.

The MVP does not need additional speculative features simply because
they are technically possible.

The preferred next phase is to use v0.1.0 regularly and record friction
observed during real English practice.

Future Vertical Slices should primarily be selected from those
observations.

------------------------------------------------------------------------

## 14. v0.1.0 Completion State

As of **2026-08-23**, the MVP state is:

``` text
Version:        0.1.0
Git tag:        v0.1.0
Branch:         main
Remote branch:  origin/main
Working tree:   clean
GitHub:         published
MVP test:       passed
```

The project has moved from initial phrase loading to a complete
automated lesson-generation workflow.

The most important result of v0.1.0 is not the number of implemented
features. It is that EAG now forms a complete feedback loop:

``` text
real delivery-English need
        ↓
generate focused practice material
        ↓
listen / repeat / review
        ↓
observe problems in actual use
        ↓
select the next small improvement
```

That loop is the foundation for development beyond v0.1.0.
