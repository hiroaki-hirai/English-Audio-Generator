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

## 15. Post-v0.1.0 Development --- Web Training Player

After the v0.1.0 lesson-generation MVP was completed, regular use of the
generated material exposed the next practical requirement:

> make completed training lessons easy to select, play, repeat, and
> practice from an iPhone without manually managing individual audio
> files.

Development therefore moved from lesson generation alone toward a small
web-based training player.

The existing generation pipeline remained the source of lesson content.
The new web layer was designed around the generated training material
rather than replacing it.

---

## Phase 8 --- Reusable training lessons and Web UI

A set of reusable training scripts was introduced for common delivery
situations.

The initial training library contains six lessons:

```text
basic-delivery
cash-payment
change-handling
order-verification
pin-verification
restaurant-delay
```

Each training lesson contains:

- a stable lesson ID,
- an English scenario,
- a Japanese scenario translation,
- five English practice phrases,
- five Japanese phrase translations.

A generated lesson index allows the Web UI to discover these lessons
without manually maintaining the same lesson information separately in
the frontend.

The browser interface provides:

- lesson selection,
- scenario display,
- English/Japanese phrase references,
- audio playback,
- repeated playback,
- phrase-level navigation.

This created a second major EAG workflow:

```text
training script
        ↓
generate training audio
        ↓
generate Web lesson index
        ↓
publish training assets
        ↓
select lesson on iPhone
        ↓
listen / repeat / tap individual phrases
```

---

## Phase 9 --- Training asset synchronization

### Automated training lesson synchronization

**Commit:** `e82b3d4 feat: automate training lesson synchronization`

The training-script definitions and Web application assets were
connected through an automated synchronization step.

Instead of manually updating the frontend whenever a training lesson was
added, the project generates the lesson index consumed by the Web UI.

This reduced duplicated lesson-registration work and established the
training scripts as the canonical lesson definitions.

---

### Incremental training audio builds

**Commit:** `234ac67 feat: add incremental training audio builds`

Generating all training speech repeatedly would unnecessarily call the
TTS API even when a lesson had not changed.

Incremental audio generation was therefore introduced.

Each lesson records a source hash. When the training build runs, the
current lesson source is compared with the stored hash.

The resulting behavior is:

```text
lesson unchanged
        ↓
skip TTS/audio rebuild

lesson changed
        ↓
regenerate lesson audio
        ↓
update generated assets
        ↓
update source hash
```

A validated run with all six lessons unchanged produced:

```text
Training audio build complete: 0 built, 6 skipped.
```

This reduces unnecessary API usage, build time, and accidental
regeneration of otherwise stable audio.

---

## Phase 10 --- Phrase-level audio navigation

### Phrase seek metadata

**Commit:** `1d08a71 feat: add phrase audio seeking metadata`

The Web player initially supported complete lesson playback.

Actual use showed that individual phrases also needed to be selectable
directly from the English reference list.

To support this, lesson construction began producing phrase timing
metadata:

```json
{
  "phrases": [
    {
      "index": 0,
      "start": 0
    },
    {
      "index": 1,
      "start": 15.52
    }
  ]
}
```

Each training lesson therefore has two related generated artifacts:

```text
lesson.mp3
metadata.json
```

The Web application loads `metadata.json` and uses the selected phrase's
start value to seek within `lesson.mp3`.

This transformed the phrase list from a passive text reference into an
interactive training control.

---

## Phase 11 --- iPhone / PWA audio-seeking investigation

Phrase seeking worked correctly in the desktop browser, but real iPhone
testing exposed a platform-specific problem.

Tapping an English phrase on the installed iPhone application sometimes
started playback after the beginning of the sentence.

Several hypotheses were tested incrementally.

### Seek lead experiments

Commits:

```text
5a64fc2 test: add seek lead for iPhone audio
6d66f9f fix: tune phrase seek lead time
ecf7c81 fix: tune phrase seek lead time
7675b25 fix: tune phrase seek lead time
05bb001 fix: tune phrase seek lead time
```

Different amounts of pre-roll were tested before the metadata start
position.

Small changes alone did not initially resolve the behavior consistently,
which showed that the problem was not simply an incorrect constant.

---

### PWA cache investigation

**Commit:** `2bf088e fix: refresh PWA assets from network`

The investigation then moved to Service Worker behavior.

Because the iPhone application was installed as a PWA and also needed to
work offline, lesson audio could be served from Cache Storage rather than
directly from the network.

The Service Worker was refined so application resources could refresh
appropriately while preserving offline support.

---

### Audio Range Request investigation

**Commit:** `effdc40 test: bypass cached audio range requests online`

HTML audio seeking can use HTTP byte-range requests.

This became particularly important on iPhone/Safari, where media seeking
behavior differed from the desktop environment.

The Service Worker already contained support for constructing `206
Partial Content` responses from cached MP3 data for offline use.

As part of the investigation, online audio range requests were allowed
to use the network while cached range handling remained available as an
offline fallback.

This separated two cases:

```text
online
    → native network Range Request

offline
    → cached MP3
    → Service Worker creates 206 Partial Content response
```

---

### iPhone seek diagnostics

**Commit:** `d76af63 test: add iPhone audio seek diagnostics`

Temporary runtime diagnostics were added to observe:

- metadata phrase start,
- requested seek position,
- actual playback position.

An example observed during debugging was:

```text
Phrase 3 | start=32.528 | requested=29.528 | playing=29.911
```

These diagnostics were important because they showed that the browser
was broadly honoring the requested seek position.

The investigation therefore shifted from JavaScript seeking itself to
the correctness and freshness of the timing metadata.

---

## Phase 12 --- Synchronizing lesson audio and metadata

### Root cause discovered

Testing the `Giving Change` lesson revealed that the displayed metadata
did not correspond to the actual phrase boundaries in the MP3.

For example, phrase 3 was reported around:

```text
32.528 seconds
```

while inspection of the audio showed the phrase beginning much earlier.

FFprobe and waveform inspection were used to compare:

- individual phrase durations,
- final lesson duration,
- generated metadata,
- actual waveform structure.

This revealed an important build invariant:

> `lesson.mp3` and `metadata.json` must come from the same lesson build.

Regenerating or restoring only one side of this pair can produce a
technically valid MP3 and a technically valid metadata file that are
nevertheless semantically incompatible.

---

### Synchronize lesson audio and seek metadata

**Commit:** `7eb09d9 fix: synchronize lesson audio and seek metadata`

The training lessons were rebuilt so each `lesson.mp3` was paired with
the timing metadata generated from the same source audio.

For `change-handling`, for example, stale timing values changed from:

```text
16.624
32.528
45.264
59.680
```

to timing values corresponding to the rebuilt lesson:

```text
15.520
30.128
43.056
57.280
```

After deployment, desktop phrase selection matched the actual audio
again.

This established a new EAG artifact rule:

```text
lesson.mp3 + metadata.json = one generated artifact pair
```

They should not be independently restored, copied, or published when the
other member of the pair was generated from different phrase audio.

---

## Phase 13 --- PWA metadata freshness

### Refresh lesson metadata from network

**Commit:** `1a878ee fix: refresh lesson metadata from network`

Even after corrected metadata was deployed, the installed application
could continue reading an older cached `metadata.json`.

The Service Worker was therefore changed so lesson metadata uses a
network-first strategy:

```text
metadata request
        ↓
network available?
    yes → use fresh metadata and update cache
    no  → use cached metadata
```

Lesson audio retains behavior appropriate for media playback and offline
Range Requests.

The Service Worker cache version was also advanced so previously cached
assets could be retired during activation.

This resolved the stale metadata behavior after the new Service Worker
became active on the iPhone.

---

## Phase 14 --- Final iPhone phrase-seeking calibration

After audio and metadata synchronization was corrected, direct seeking
to the exact metadata boundary was tested again.

A very small amount of lead-in remained useful on iPhone because seeking
exactly to the first audio sample could make the beginning of some
sentences sound slightly clipped.

The final calibration became:

```typescript
const seekLeadSeconds = 0.5;
```

and the requested position is calculated as:

```typescript
Math.max(0, phraseMetadata.start - seekLeadSeconds);
```

This is intentionally different from the earlier multi-second diagnostic
workaround.

The final `0.5` second lead is a small playback margin rather than a
correction for incorrect metadata.

The final implementation was committed as:

```text
9ef253e fix: seek directly to phrase start
```

Temporary seek diagnostics were then removed:

```text
cad1da9 chore: remove audio seek diagnostics
```

---

## 16. Web / PWA Acceptance Validation

The completed training player was validated on both desktop and iPhone.

### Desktop

Confirmed:

- all six training lessons are selectable,
- lesson audio plays correctly,
- English and Japanese references correspond to the selected lesson,
- tapping an English phrase seeks to the intended phrase,
- phrase playback begins naturally from the sentence start.

### iPhone online

Confirmed:

- the application runs as an installed PWA,
- lesson selection works,
- lesson playback works,
- phrase tapping works,
- refreshed metadata is used,
- phrase playback begins naturally.

### iPhone offline

The final acceptance test was performed in airplane mode.

Confirmed:

```text
airplane mode
    ↓
open installed EAG application
    ↓
select training lesson
    ↓
tap English phrase
    ↓
audio seeks using cached lesson assets
    ↓
sentence plays naturally from the beginning
```

All tested phrases played naturally.

This validates not only the phrase-seeking feature but the complete
interaction between:

- generated lesson audio,
- generated seek metadata,
- Web UI,
- Service Worker caching,
- cached HTTP Range responses,
- iPhone/Safari media playback.

---

## 17. Web Training Architecture

The EAG architecture now contains two connected layers.

### Content generation

```text
training-scripts/*.json
        ↓
prepare training input
        ↓
OpenAI TTS
        ↓
build lesson
        ↓
lesson.mp3
metadata.json
source-hash.txt
```

### Web delivery

```text
training lesson definitions
        ↓
generate training index
        ↓
Web lesson selector
        ↓
load lesson.mp3 + metadata.json
        ↓
complete lesson playback
or
phrase-level seek
```

### Offline delivery

```text
GitHub Pages deployment
        ↓
Service Worker installation
        ↓
cache training assets
        ↓
PWA installed on iPhone
        ↓
offline lesson playback
        ↓
cached Range Request handling
        ↓
phrase-level seeking
```

The browser application is therefore not a separate source of lesson
truth.

Training scripts define the content, and generated Web assets expose that
content to the player.

---

## 18. Additional Technical Decisions

### Training scripts are canonical

Reusable lesson content should be changed in the training-script
definitions rather than manually editing generated Web indexes.

Generated files are outputs of that source.

### Audio and timing metadata are an atomic pair

`lesson.mp3` and `metadata.json` describe the same generated timeline.

They must be generated and deployed together.

This is particularly important because TTS output duration can vary
between generations even when the English text itself is unchanged.

### Incremental TTS builds use source hashes

Stable training lessons should not consume TTS requests merely because
the build command was executed again.

Source hashing provides a deterministic decision about whether a lesson
requires regeneration.

### Metadata uses network-first behavior

Timing metadata is small but correctness-sensitive.

When online, freshness is more important than avoiding a small network
request.

When offline, the cached version remains available.

### Offline audio must support byte ranges

Caching an MP3 alone is insufficient for reliable media seeking.

The Service Worker must understand Range requests and be able to return
a correct `206 Partial Content` response from the cached MP3.

### iPhone playback uses a small pre-roll

The final `0.5` second seek lead is intentional playback tolerance.

It should not be increased to compensate for inaccurate metadata.

If a future phrase requires a large lead value, audio/metadata
synchronization should be investigated first.

---

## 19. Problems Encountered During Web/PWA Development

### Desktop success did not guarantee iPhone success

Phrase seeking initially behaved correctly on the desktop but not in the
installed iPhone application.

**Lesson:** media behavior and Service Worker behavior must be validated
on the actual target device.

### Reloading Safari affected observed behavior

During debugging, refreshing the iPhone Safari page caused newer
behavior to become visible.

This demonstrated that deployment success alone does not prove that an
installed PWA is currently executing the newest application and Service
Worker state.

**Lesson:** distinguish source-code correctness, GitHub Pages deployment,
Service Worker activation, and client cache state during PWA debugging.

### Increasing seek lead could hide the real problem

Several lead values were tested while stale or mismatched timing metadata
was still present.

**Lesson:** a timing workaround should not be tuned until the underlying
timeline data is known to be correct.

### MP3 and metadata could silently diverge

Both files remained individually valid even when generated from different
audio builds.

**Lesson:** related generated artifacts need explicit synchronization
invariants.

### Offline seeking is more demanding than offline playback

Playing a cached MP3 from the beginning is simpler than seeking into it.

**Lesson:** offline media applications must account for byte-range
semantics, not merely Cache Storage availability.

---

## 20. Current State After Web/PWA Training Slice

As of **2026-08-25**, the validated EAG state is:

```text
Branch:             main
Remote branch:      origin/main
HEAD:               cad1da9
Working tree:       clean

Training lessons:   6
Web player:         operational
Phrase selection:   operational
Desktop playback:   validated
iPhone playback:    validated
PWA installation:   validated
Offline playback:   validated
Offline phrase seek: validated
```

The latest relevant commits are:

```text
cad1da9 chore: remove audio seek diagnostics
9ef253e fix: seek directly to phrase start
f6b8dd9 fix: seek directly to phrase start
1a878ee fix: refresh lesson metadata from network
7eb09d9 fix: synchronize lesson audio and seek metadata
05bb001 fix: tune phrase seek lead time
7675b25 fix: tune phrase seek lead time
ecf7c81 fix: tune phrase seek lead time
6d66f9f fix: tune phrase seek lead time
d76af63 test: add iPhone audio seek diagnostics
effdc40 test: bypass cached audio range requests online
2bf088e fix: refresh PWA assets from network
5a64fc2 test: add seek lead for iPhone audio
1d08a71 feat: add phrase audio seeking metadata
234ac67 feat: add incremental training audio builds
```

The Web/PWA training slice can now be regarded as complete.

The most important validated user-facing capability is:

```text
select a training lesson on iPhone
        ↓
listen to the complete lesson
        ↓
tap any English sentence
        ↓
hear that sentence naturally from its beginning
        ↓
repeat the exercise even while offline
```

This provides a stable foundation for selecting the next EAG Vertical
Slice from actual learning needs rather than continuing to debug the
training playback infrastructure.


## 21. Continuous Phrase Training Mode

After completing the Web/PWA training player, the next Vertical Slice
was selected from the perspective of English acquisition rather than
adding more playback infrastructure.

The learning goal was changed from repeatedly drilling a small number of
sentences until they were immediately perfect to moving through a larger
number of sentences at a relatively fast pace and improving them over
repeated rounds.

The resulting baseline training pattern is:

``` text
English phrase
        ↓
1 second
        ↓
same English phrase
        ↓
5-second recall period
        ↓
next phrase
```

The learner is expected to begin shadowing from the first playback
rather than treating the first playback as passive listening only.

The five-second silent period is intentional recall time rather than an
ordinary playback pause.

For short phrases, the recall period allows the phrase to be spoken
multiple times.

For longer phrases, it provides enough time to reproduce the phrase at
least once without audio support.

### Why two playbacks were selected

Three consecutive playbacks were initially considered.

Practical listening tests showed that two playbacks are sufficient for
the normal case because shadowing already begins during the first
playback.

A third playback remains useful for phrases that are difficult or long.

This led to the following future training model:

``` text
Normal phrase
        ↓
2 playbacks
        ↓
5-second recall

Weak phrase
        ↓
3 playbacks
        ↓
5-second recall
```

Weak Phrase behavior was intentionally excluded from this Vertical
Slice.

The first implementation validates the simpler Normal Phrase training
cycle before adding phrase difficulty state.

### Timing validation

The initial timing was tested as:

``` text
Playback 1
        ↓
1 second
        ↓
Playback 2
        ↓
5 seconds recall
```

The one-second interval can feel slightly slow for very short phrases,
but it is appropriate for longer phrases.

A fixed one-second interval was therefore retained rather than
introducing phrase-length-dependent timing at this stage.

The five-second recall period was also retained.

It is long enough for longer phrases while allowing short phrases to be
repeated two or three times during the silent interval.

------------------------------------------------------------------------

## 22. Training Mode v1 Implementation

The Web player gained a dedicated `Start Training` control.

Training Mode automatically processes every phrase in the selected
lesson without requiring phrase-by-phrase interaction.

For each phrase, the player:

1.  plays the English phrase once;
2.  waits approximately one second;
3.  plays the same phrase again;
4.  provides approximately five seconds of silent recall time;
5.  advances automatically to the next phrase.

After the final phrase, Training Mode stops.

The existing normal lesson player remains available independently of
Training Mode.

### Reusing existing generated audio

The existing `lesson.mp3` files were not regenerated.

Those files already contain a structure equivalent to:

``` text
English phrase
        ↓
5-second silence
        ↓
same English phrase
```

Training Mode instead derives the spoken portion of each phrase block
and uses browser seeking to replay only that spoken segment.

Phrase boundaries are derived from the existing `metadata.json` start
times together with the known generated lesson structure.

This allowed the new learning behavior to be implemented entirely in the
Web player without changing:

-   training scripts;
-   OpenAI TTS generation;
-   incremental source hashing;
-   generated `lesson.mp3`;
-   generated `metadata.json`.

This preserved the already validated audio-generation pipeline and
avoided unnecessary TTS regeneration.

### Training playback control

Training playback temporarily disables normal whole-audio looping while
the controlled phrase sequence is running.

The player tracks the active training run so that stale asynchronous
playback work cannot continue as part of the current training session.

The active phrase segment can also be explicitly cancelled.

This became important when switching from controlled Training Mode back
to ordinary playback.

### Phrase selection during Training Mode

An early implementation exposed a playback race when an English sentence
was tapped while Training Mode was active.

The first tap stopped at the selected phrase position, and a second tap
was required before ordinary playback continued.

The cause was the active Training Mode segment listener remaining
capable of pausing the audio after normal playback had started.

The segment playback logic was updated so that the active segment can be
cancelled and its listener removed immediately.

The validated behavior is now:

``` text
Training Mode active
        ↓
tap an English sentence
        ↓
cancel active training segment
        ↓
stop Training Mode
        ↓
seek to selected phrase
        ↓
start normal playback
```

Only one tap is required.

### Lesson switching during Training Mode

Training state originally lived inside each `renderLesson()` execution.

Because changing lessons replaces the rendered player, the previous
Training Mode also needed explicit cleanup.

The current player exposes the active training stop operation to the
lesson-switching path.

The validated behavior is:

``` text
Lesson A Training Mode
        ↓
select Lesson B
        ↓
stop Lesson A training
        ↓
render Lesson B
```

The previous lesson does not resume playback after the new lesson has
been selected.

------------------------------------------------------------------------

## 23. Continuous Training Validation

Training Mode v1 was validated on the desktop development environment
and on the target iPhone environment.

### Desktop validation

The production Web build completed successfully with:

``` text
npm run web:build
```

The build regenerated the six-lesson training index and completed the
Vite production build successfully.

The following behaviors were manually validated:

-   Training Mode starts from the Web player;
-   each phrase is played twice;
-   approximately one second separates the two playbacks;
-   approximately five seconds of recall follows the second playback;
-   playback automatically advances to the next phrase;
-   Training Mode can be stopped manually;
-   tapping a phrase during training exits Training Mode and starts
    normal playback from that phrase with one tap;
-   switching lessons during training stops the previous lesson
    correctly.

### iPhone validation

The same Training Mode was then deployed through the existing GitHub
Pages/PWA delivery path and tested on iPhone.

The iPhone implementation behaved normally with the controlled phrase
playback and automatic progression.

This was an important validation because previous EAG development showed
that desktop media behavior alone is not sufficient evidence for iPhone
PWA correctness.

The validated Training Mode timing is therefore currently:

``` text
Normal phrase:
2 playbacks
1-second repeat gap
5-second recall
automatic advance
```

------------------------------------------------------------------------

## 24. Current State After Continuous Phrase Training Slice

As of **2026-08-26**, the validated EAG state is:

``` text
Branch:              main
Remote branch:       origin/main
HEAD:                e478f41
Working tree:        clean

Training lessons:    6
Web player:          operational
Phrase selection:    operational
Training Mode v1:    operational
Normal repetitions:  2
Repeat gap:          1 second
Recall period:       5 seconds
Automatic advance:   operational
Desktop playback:    validated
iPhone playback:     validated
PWA installation:    validated
Offline foundation:  validated
```

The implementation commit is:

``` text
e478f41 feat: add continuous phrase training mode
```

The current learning model is:

``` text
preview English + Japanese
        ↓
start Training Mode
        ↓
shadow a large number of phrases continuously
        ↓
2 audio repetitions per Normal phrase
        ↓
5-second active recall
        ↓
continue through the lesson
        ↓
improve through repeated exposure over time
```

The next likely learning-oriented Vertical Slice is Weak Phrase
Training.

The current candidate behavior is:

``` text
Normal
→ 2 playbacks + 5-second recall

Weak
→ 3 playbacks + 5-second recall
```

The third playback would serve two purposes:

1.  provide additional practice for a difficult phrase;
2.  act as an audible indication that the phrase was previously marked
    as difficult.

This behavior has not yet been implemented.

It remains a candidate for the next Vertical Slice Selection Review
rather than being treated as part of Training Mode v1.


## 25. Weak Phrase Training v1

After validating Continuous Phrase Training Mode v1, the next
learning-oriented Vertical Slice focused on adapting repetition density
to phrases that the learner finds difficult.

Practical use of Training Mode showed that two repetitions are
sufficient for the normal case because shadowing already begins during
the first playback.

However, difficult or longer phrases benefit from one additional
repetition.

The selected model is:

``` text
Normal phrase
        ↓
2 playbacks
        ↓
5-second recall

Weak phrase
        ↓
3 playbacks
        ↓
5-second recall
```

The third playback also provides an audible indication that the current
phrase has previously been marked as difficult.

This avoids requiring the learner to look at the screen while
concentrating on continuous listening and shadowing.

### Scope

Weak Phrase Training v1 intentionally remains simple.

The slice includes:

-   manual Weak ON/OFF selection for individual phrases;
-   persistent Weak state in the browser;
-   two repetitions for Normal phrases;
-   three repetitions for Weak phrases;
-   the existing five-second recall period;
-   automatic progression through the lesson;
-   compatibility with existing phrase tapping, Stop Training, lesson
    switching, PWA playback, and offline playback.

The slice does not include:

-   automatic difficulty detection;
-   correctness scoring;
-   spaced-repetition scheduling;
-   automatic promotion from Weak back to Normal;
-   multiple difficulty levels;
-   learning-history analytics;
-   Weak selection during hands-free training.

------------------------------------------------------------------------

## 26. Weak Phrase State and UI

Weak state is stored client-side using `localStorage`.

The storage key is:

``` text
eag.weakPhrases.v1
```

Individual phrases are identified using the combination of lesson ID and
phrase index.

Conceptually:

``` text
cash-payment:2
pin-verification:0
```

This keeps Weak state independent between lessons without requiring
changes to the canonical training scripts, generated audio, or timing
metadata.

The stored JSON is loaded defensively.

If the stored value is missing, malformed, or is not an array, the
application falls back to an empty Weak set rather than preventing the
player from loading.

### Weak control

Each phrase gained a separate Weak control.

The English sentence itself retains its existing phrase-playback
behavior.

Weak selection is therefore not overloaded onto the phrase playback
button.

The states are presented as:

``` text
☆ Weak
```

and:

``` text
★ Weak
```

The control also uses `aria-pressed` so that the selected state is
exposed semantically.

Manual validation confirmed that:

-   a Normal phrase can be changed to Weak;
-   a Weak phrase can be changed back to Normal;
-   Weak state survives lesson switching;
-   Weak state survives page reload;
-   phrase tapping continues to perform normal phrase playback
    independently.

------------------------------------------------------------------------

## 27. Variable Training Repetition

The original Training Mode contained a fixed two-playback sequence.

That sequence was generalized so that the repetition count is selected
for each phrase.

The behavior is:

``` text
Normal
→ playback 1
→ playback 2
→ Recall

Weak
→ playback 1
→ playback 2
→ playback 3
→ Recall
```

The player checks the current Weak state when it reaches each phrase.

This keeps the repetition decision close to playback and avoids
introducing a second copied difficulty-state model.

The status text distinguishes the third playback as a Weak repetition.

Manual desktop validation confirmed:

-   Normal phrases remain at two repetitions;
-   Weak phrases use three repetitions;
-   Recall follows the third Weak playback;
-   removing Weak status returns the phrase to two repetitions;
-   Stop Training continues to work;
-   tapping an English phrase during Training Mode continues to exit
    controlled training and start normal phrase playback;
-   switching lessons during Training Mode continues to stop the
    previous lesson.

The implementation was committed as:

``` text
0282021 feat: add weak phrase training
```

------------------------------------------------------------------------

## 28. Training Repeat Gap Evaluation

The original Continuous Phrase Training Mode used a one-second explicit
delay between repeated playbacks.

Practical listening showed that one second was acceptable for longer
phrases but slightly reduced the desired high-throughput rhythm for
shorter phrases.

A 0.5-second explicit repeat gap was therefore tested.

The shorter interval felt more natural and was initially adopted.

That adjustment was committed as:

``` text
c3a78f8 tune: shorten training repeat gap
```

The intended learning rhythm at that point was:

``` text
Normal
English
→ 0.5 seconds
→ English
→ 5-second Recall

Weak
English
→ 0.5 seconds
→ English
→ 0.5 seconds
→ English
→ 5-second Recall
```

Desktop playback felt natural with this timing.

------------------------------------------------------------------------

## 29. iPhone Training Seek Pre-roll

After the 0.5-second repeat-gap adjustment, iPhone testing exposed a
media playback issue.

Some repeated phrases began slightly after the true start of the English
audio, causing the beginning of the sentence to sound clipped.

This was consistent with an earlier iPhone phrase-seeking issue in the
normal player.

The existing normal phrase-tap behavior already used a small seek lead
to make iPhone playback begin naturally.

Training Mode, however, was still seeking directly to the exact phrase
segment start.

### Final timing strategy

Rather than keeping both:

``` text
0.5-second explicit wait
+
0.5-second seek pre-roll
```

which would make the training rhythm slower than intended, Training Mode
was changed to use:

``` text
explicit repeat gap: 0 ms
training seek pre-roll: 0.5 seconds
```

The player seeks to approximately:

``` text
segment.start - 0.5 seconds
```

before each controlled phrase playback.

The pre-roll therefore serves two purposes:

1.  it gives iPhone media playback enough lead-in to avoid clipping the
    first sound of the sentence;
2.  it naturally provides approximately the desired half-second interval
    before the repeated English phrase begins.

The implementation uses:

``` text
repeatGapMilliseconds = 0
trainingSeekLeadSeconds = 0.5
```

with the playback start clamped so that it cannot seek before zero.

This adjustment was committed as:

``` text
936698c fix: add training seek pre-roll for iPhone
```

### Validation

The final strategy was validated on desktop and iPhone.

Desktop playback retained the desired fast training rhythm.

On iPhone, phrases that had previously sounded clipped at the beginning
played naturally after the pre-roll adjustment.

Online and airplane-mode PWA playback were both validated successfully.

The final practical training rhythm is therefore approximately:

``` text
Normal
0.5-second pre-roll → English
→ 0 ms explicit wait
→ 0.5-second pre-roll → English
→ 5-second Recall

Weak
0.5-second pre-roll → English
→ 0 ms explicit wait
→ 0.5-second pre-roll → English
→ 0 ms explicit wait
→ 0.5-second pre-roll → English
→ 5-second Recall
```

The pre-roll is implementation tolerance as well as part of the
effective training rhythm.

It should not be replaced with a larger arbitrary delay unless future
target device testing demonstrates a need.

------------------------------------------------------------------------

## 30. Current State After Weak Phrase Training Slice

As of **2026-08-26**, the validated EAG state is:

``` text
Branch:                main
Remote branch:         origin/main
HEAD:                  936698c
Working tree:          clean

Training lessons:      6
Training Mode:         operational
Normal repetitions:    2
Weak repetitions:      3
Weak persistence:      localStorage
Recall period:         5 seconds
Explicit repeat gap:   0 ms
Training seek pre-roll: 0.5 seconds
Automatic advance:     operational
Phrase tap exit:       operational
Lesson switching:      operational
Desktop playback:      validated
iPhone playback:       validated
Online PWA playback:   validated
Airplane-mode playback: validated
```

The latest implementation commits are:

``` text
936698c fix: add training seek pre-roll for iPhone
c3a78f8 tune: shorten training repeat gap
0282021 feat: add weak phrase training
```

Weak Phrase Training v1 can now be regarded as complete.

The current learning behavior is:

``` text
preview English + Japanese
        ↓
mark known difficult phrases as Weak
        ↓
start Training Mode
        ↓
Normal phrase: 2 repetitions
Weak phrase:   3 repetitions
        ↓
5-second active recall
        ↓
automatic progression
        ↓
repeat large amounts of English over multiple rounds
```

The additional Weak repetition increases practice density only where it
is needed, while Normal phrases retain the faster two-repetition rhythm.

The next EAG Vertical Slice should again be selected from observed
learning needs rather than extending Weak Phrase Training automatically.

---

## 2026-08-26: Meaning → English Active Recall v1

### Background

After completing Continuous Phrase Training Mode and Weak Phrase Training v1, the next development step was selected through a Vertical Slice Selection Review.

The selection criterion was intentionally changed from:

- "What feature can be added to the app?"

to:

- "What is currently missing from EAG from the perspective of actual English acquisition?"

The existing Continuous Phrase Training flow was already effective for:

- listening to the English phrase
- shadowing from the first playback
- repeating the phrase
- recalling the phrase after hearing the correct English
- increasing repetition for weak phrases

However, the existing Recall phase still occurred after the learner had just heard the correct English phrase.

This meant that the training primarily exercised:

```text
English
→ English reproduction
```

rather than the retrieval path required in an actual delivery conversation:

```text
meaning / communicative intent
→ English
```

In a real delivery situation, the learner first has an intention such as:

```text
"Ask the customer to show the order screen."
```

and must then retrieve:

```text
"Could you show me your order screen, please?"
```

without hearing the correct English first.

For this reason, the next Vertical Slice was selected as:

```text
Meaning → English Active Recall v1
```

### Learning Design

The goal of Active Recall is not to replace Continuous Phrase Training.

The two modes have different roles.

Continuous Phrase Training:

```text
English
→ shadowing
→ repetition
→ immediate recall
```

Primary purpose:

- acquire the sound
- acquire the rhythm
- reinforce the phrase
- reproduce recently heard English

Active Recall:

```text
Japanese meaning cue
→ silent recall
→ English answer
```

Primary purpose:

- retrieve English from meaning or communicative intent
- create a deliberate "thinking" state before hearing the answer
- practice the direction required during actual conversation

The final v1 sequence for each phrase is:

```text
Japanese meaning cue
→ 5-second Recall
→ English answer
→ English repeat
```

For a Weak phrase:

```text
Japanese meaning cue
→ 5-second Recall
→ English answer
→ English repeat
→ English Weak Repeat
```

Therefore:

- Normal phrase: English × 2
- Weak phrase: English × 3
- Recall: 5 seconds for both Normal and Weak phrases

The 5-second Recall interval was retained after actual use because it provided enough time to actively search for and attempt the English phrase without making the training feel excessively slow.

### Japanese Meaning Cue Strategy

An initial design option was to generate dedicated Japanese cue audio through the existing OpenAI TTS build pipeline.

Before introducing additional generated audio artifacts, a smaller Vertical Slice was tested using the browser's built-in Web Speech API.

The existing canonical training script already contains:

```json
{
  "en": "...",
  "ja": "..."
}
```

Therefore the Japanese `ja` value can be passed directly to:

```text
SpeechSynthesisUtterance
```

with:

```text
lang = ja-JP
```

This provides the Japanese meaning cue without changing:

- `training-scripts/*.json`
- existing `lesson.mp3`
- existing `metadata.json`
- source-hash behavior
- the OpenAI TTS build pipeline

The English answer continues to use the existing generated OpenAI TTS `lesson.mp3`.

Conceptually:

```text
training script
├─ ja → browser speechSynthesis → Japanese meaning cue
└─ en → existing lesson.mp3     → English answer
```

This kept the Active Recall implementation small and preserved the existing validated English audio pipeline.

### Initial Web Speech Validation

Before integrating Active Recall into the player, browser speech synthesis was tested independently.

The test confirmed:

```text
SpeechSynthesisUtterance
→ Japanese speech
→ end event
```

The `end` event was important because Active Recall must wait until the Japanese cue has completely finished before starting the 5-second Recall period.

After successful validation, a cancellable `speakJapaneseCue()` helper was added.

The helper:

- creates a `SpeechSynthesisUtterance`
- sets `lang` to `ja-JP`
- resolves after the `end` event
- rejects on speech synthesis error
- exposes cancellation behavior through the existing training stop flow

### Active Recall Implementation

Added a separate:

```text
Start Active Recall
```

control alongside the existing:

```text
Start Training
```

The existing Continuous Phrase Training behavior was preserved rather than replaced.

Active Recall automatically progresses through all phrases in the selected lesson.

For each phrase:

1. Read the Japanese meaning cue.
2. Wait 5 seconds for silent Active Recall.
3. Play the existing English phrase segment.
4. Repeat the English phrase.
5. Add a third English playback when the phrase is marked Weak.
6. Continue automatically to the next phrase.

The existing phrase segmentation logic is reused.

The existing iPhone training playback behavior is also reused:

```text
repeatGapMilliseconds = 0
trainingSeekLeadSeconds = 0.5
```

Therefore the English answer playback retains the same pre-roll behavior previously validated for Continuous Phrase Training.

### Weak Phrase Integration

Active Recall reuses the existing Weak Phrase state.

Weak status continues to be stored by:

```text
lesson ID + phrase index
```

using the existing localStorage-backed Weak Phrase implementation.

No new learning-state format was introduced.

The playback behavior is:

```text
Normal:
Japanese cue
→ 5-second Recall
→ English × 2
```

```text
Weak:
Japanese cue
→ 5-second Recall
→ English × 3
```

Removing Weak status immediately returns the phrase to two English playbacks.

### Training Mode Coordination

Continuous Training and Active Recall are intentionally separate modes.

While Continuous Training is active:

- the Active Recall button is disabled

While Active Recall is active:

- the normal Training button is disabled

The existing shared training lifecycle is reused so that Active Recall can be stopped by the same user actions already supported by Continuous Training.

Active Recall stops correctly when:

- Stop Active Recall is pressed
- another lesson is selected
- an English phrase is tapped for normal phrase playback

Stopping Active Recall cancels:

- an active Japanese speech synthesis cue
- an active English phrase segment
- the current training run

The player then returns to its normal non-training state.

### Learning Evaluation

The first implementation deliberately tested the smallest useful flow before expanding to all phrases:

```text
Japanese meaning cue
→ 5-second Recall
→ English answer
```

Actual use confirmed that hearing the meaning before the answer naturally creates the desired mental state:

```text
"What was the English for this?"
```

This was judged to be a useful training load because the learner must actively search for the English phrase before receiving the answer.

The 5-second Recall interval also felt appropriate in actual use.

It was long enough to attempt retrieval while still preserving the high-throughput training philosophy of EAG.

The feature was then expanded to continuous progression across the full lesson.

Overall, Active Recall was judged highly useful in actual training.

### PC Validation

Verified on PC:

- Japanese meaning cue playback works
- speech synthesis completion can be detected
- 5-second Recall occurs after the Japanese cue
- English answer follows Recall
- all phrases progress automatically
- Normal phrases play English twice
- Weak phrases play English three times
- Active Recall can be stopped
- existing Continuous Training remains available

### iPhone PWA Validation

Verified on the installed iPhone PWA.

Online:

- Japanese meaning cue plays correctly
- Active Recall progresses correctly
- 5-second Recall works correctly
- English answer playback works correctly
- Continuous phrase progression works correctly

Airplane mode / offline:

- Japanese meaning cue still plays correctly
- English answer audio plays correctly
- Active Recall progresses correctly

This confirmed that, on the tested iPhone environment, browser speech synthesis can provide the Japanese meaning cue without requiring an online TTS request.

Therefore dedicated generated Japanese cue MP3 files are not currently required.

### Implementation Commit

Feature implementation:

```text
3dd0d4a feat: add meaning to English active recall
```

Files changed:

```text
web/src/main.ts
```

The implementation added:

- `Start Active Recall`
- Japanese Web Speech cue playback
- cancellable Japanese cue handling
- 5-second pre-answer Recall
- full-lesson automatic Active Recall progression
- Normal ×2 / Weak ×3 English answer playback
- coordination with existing Continuous Training
- shared stop behavior

### Current Training Architecture

EAG now provides two complementary continuous training modes.

#### Continuous Phrase Training

```text
English
→ English
→ 5-second Recall
```

Weak:

```text
English
→ English
→ English
→ 5-second Recall
```

Purpose:

```text
sound / rhythm / shadowing / immediate reproduction
```

#### Meaning → English Active Recall

```text
Japanese meaning
→ 5-second Recall
→ English
→ English
```

Weak:

```text
Japanese meaning
→ 5-second Recall
→ English
→ English
→ English
```

Purpose:

```text
meaning / communicative intent
→ English retrieval
```

Together, these modes train two different directions:

```text
English input
→ reproduction
```

and:

```text
meaning / intent
→ English production
```

### Development Decision

No additional Active Recall features are being added immediately.

Deferred possibilities include:

- generated Japanese cue audio
- speech recognition
- automatic answer evaluation
- spaced retrieval scheduling
- automatic Weak detection
- recall-time adjustment
- randomized phrase order
- context / phrase variation

The current priority remains:

```text
use the training system in real practice
→ observe actual learning friction
→ select the next Vertical Slice from evidence
```

rather than expanding Active Recall before sufficient real-world use.

### Result

Meaning → English Active Recall v1 is complete.

Validated environments now include:

- PC
- iPhone PWA online
- iPhone PWA airplane mode / offline

The feature adds a new retrieval pathway to EAG while preserving the existing Continuous Phrase Training and Weak Phrase Training behavior.

------------------------------------------------------------------------

## 2026-08-26: Basic Delivery 20-Phrase Learning Validation

### Background

After completing Meaning → English Active Recall v1, EAG still used five
phrases per training lesson.

The next experiment was intentionally focused on training volume rather
than adding another player feature.

The learning hypothesis was:

``` text
5 phrases
→ easy to become familiar with the sequence

20 phrases
→ less sequence-based anticipation
→ more actual phrase retrieval
```

The larger lesson was also intended to test the current EAG learning
philosophy:

``` text
do not perfect a very small set before moving on
→ expose the learner to more phrases
→ repeat them across multiple rounds
→ mark difficult phrases as Weak
→ gradually improve retrieval
```

Rather than expanding all six lessons immediately, only `basic-delivery`
was expanded first.

This preserved a small experimental scope while providing a realistic
test of longer Continuous Training and Active Recall sessions.

### Phrase Expansion

`basic-delivery` was expanded from:

``` text
5 phrases
```

to:

``` text
20 phrases
```

The original first five phrases were preserved in their existing order.

This was intentional because Weak Phrase state is currently stored
using:

``` text
lesson ID + phrase index
```

Changing the position of existing phrases could therefore cause
previously stored Weak state to refer to a different phrase.

Fifteen new phrases were appended instead.

The added phrases focus on general delivery communication such as:

-   announcing arrival
-   meeting at an entrance
-   confirming the location
-   identifying the customer
-   explaining the number of bags
-   identifying drinks or hot/cold items
-   handling items carefully
-   confirming that all items have been delivered
-   closing the interaction

Specialized phrases already covered by other lessons were intentionally
avoided.

These include:

-   cash payment
-   change handling
-   order verification
-   PIN verification
-   restaurant delay

### Variable Phrase Count Fix

The first 20-phrase build exposed a remaining fixed assumption in
`src/build-lesson.ts`.

The previous translation validation expected exactly:

``` text
6 translations
```

because the original MVP structure assumed:

``` text
1 scenario translation
+
5 phrase translations
=
6 translations
```

With 20 phrases, the prepared input correctly contained:

``` text
1 scenario translation
+
20 phrase translations
=
21 translations
```

The build therefore initially failed with:

``` text
Expected exactly 6 translations in input/translations.txt, but received 21.
```

The validation was changed from a fixed constant to:

``` text
phrases.length + 1
```

This allows lesson construction to support variable phrase counts while
preserving the same validation rule.

Examples:

``` text
5 phrases  → 6 translations
20 phrases → 21 translations
50 phrases → 51 translations
```

Implementation commit:

``` text
c04c875 fix: support variable training phrase counts
```

### Incremental Audio Build Validation

After the phrase-count fix, the training audio pipeline successfully
rebuilt the expanded lesson.

The build result was:

``` text
basic-delivery     → built
cash-payment       → skipped
change-handling    → skipped
order-verification → skipped
pin-verification   → skipped
restaurant-delay   → skipped
```

Final result:

``` text
1 built
5 skipped
```

This confirmed that the existing per-lesson source hash behavior
continues to work with larger lessons.

Only the changed `basic-delivery` lesson required TTS/audio
regeneration.

The generated metadata contained:

``` text
20 phrases
```

and the production Web build completed successfully.

### Learning Validation

The 20-phrase lesson was tested with:

1.  Continuous Training through all 20 phrases
2.  Active Recall through all 20 phrases
3.  Active Recall with several new phrases marked Weak

All three behaviors worked correctly.

### Sequence Memory

Compared with the original five-phrase lesson, sequence-based memory was
noticeably weaker.

With only five phrases, it was easier to predict the next phrase from
the fixed lesson order.

With 20 phrases, the Japanese meaning cue played a larger role in
triggering retrieval.

This better supports the intended Active Recall process:

``` text
meaning
→ search memory
→ attempt English
→ hear answer
```

Randomized phrase order may eventually provide further benefit by
reducing sequence prediction.

However, Random Order is not being implemented yet.

It is now recorded as a future Vertical Slice candidate based on actual
learning use rather than as a speculative feature.

### Five-Second Recall Evaluation

The existing:

``` text
5-second Recall
```

remained appropriate with the 20-phrase lesson.

No timing adjustment was required.

### Lesson Length Evaluation

A full 20-phrase round did not feel excessively long.

The Japanese meaning cues helped maintain interest and provided a clear
retrieval challenge for each phrase.

The lesson length therefore did not cause a noticeable loss of learning
motivation.

This suggests that lessons longer than 20 phrases may also be practical
in the future.

No larger lesson is being introduced yet.

### Weak Phrase Evaluation

Weak selection remained natural with the larger lesson.

The larger phrase set made differences between:

``` text
phrases that are retrieved easily
```

and:

``` text
phrases that require more practice
```

more apparent.

The existing behavior remained useful:

``` text
Normal → English × 2
Weak   → English × 3
```

No additional difficulty level was required.

### Implementation Commit

The 20-phrase training lesson was committed as:

``` text
1563aae feat: expand basic delivery training to 20 phrases
```

### Result

The first larger-scale EAG training experiment was successful.

The validated progression is now:

``` text
5-phrase functional validation
→ 20-phrase learning validation
```

The experiment supports the current EAG learning direction:

``` text
larger phrase exposure
→ repeated rounds
→ Active Recall
→ Weak marking
→ gradual acquisition
```

The immediate next step is not to expand every lesson automatically.

The 20-phrase `basic-delivery` lesson should first be used in regular
learning so that future changes can be selected from actual training
friction.

A future candidate identified during this validation is:

``` text
Random Order Training
```

because reducing fixed sequence prediction may further strengthen
meaning-to-English retrieval.

## 2026-08-28: iOS Background Continuous Training Investigation

### Background

Continuous Training worked correctly while the installed iPhone PWA
remained in the foreground.

However, when the user switched from EAG to the Uber Eats delivery
application, playback stopped.

This prevented the intended operational flow:

``` text
start Continuous Training
→ switch to the delivery application
→ continue training while riding or delivering
```

Although Continuous Training used a single `lesson.mp3`, its playback
was not actually uninterrupted.

For every phrase, JavaScript performed operations equivalent to:

``` text
seek to phrase start
→ audio.play()
→ monitor timeupdate
→ audio.pause()
→ wait using a Promise/timer
→ seek to the next playback position
→ audio.play()
```

Phrase progression therefore depended on foreground JavaScript
execution.

The initial hypothesis was:

``` text
iOS suspends or throttles the standalone PWA JavaScript
→ the next play() call is not executed
→ playback stops at a phrase boundary
```

### Single-Resource Continuous Training

The smallest architecture change was to generate a dedicated
Continuous Training audio resource for each lesson.

For Normal phrases, the generated resource contains:

``` text
phrase 1
1-second silence
phrase 1
5-second silence

phrase 2
1-second silence
phrase 2
5-second silence

...
```

Once playback begins, phrase progression no longer requires JavaScript
to stop, seek, wait, or restart the media element at every phrase
boundary.

The implementation added one `continuous-training.mp3` for each of the
six lessons:

``` text
basic-delivery
cash-payment
change-handling
order-verification
pin-verification
restaurant-delay
```

FFmpeg constructs each track using a filter graph and generated silence
sources.

No permanent standalone one-second or five-second silence assets are
required for the Continuous Training tracks.

The centralized audio settings are:

``` text
Normal repetitions    → 2
repetition interval   → 1 second
Recall interval       → 5 seconds
sample rate           → 24 kHz
codec                 → libmp3lame
loudness I            → -16
loudness LRA          → 7
true peak              → -1.5
```

The Continuous Training source hash includes the ordered training
script and the audio build settings that affect the resulting track.

This provides deterministic incremental generation.

After the initial build, a subsequent training-audio build reported:

``` text
0 built
6 skipped
```

All six lessons were correctly recognized as unchanged.

### PWA Cache and Range Requests

The generated Continuous Training assets were added to the generated
offline asset list.

The Service Worker cache was advanced to:

``` text
eag-training-v8
```

The new MP3 resources use the same cached Range Request handling as the
existing lesson audio.

This preserves offline and airplane-mode availability while allowing a
changed Continuous Training resource to replace an older cached version.

### Media Session Integration

Minimal feature-detected Media Session support was added for:

-   lesson title and scenario metadata
-   play handling
-   pause handling
-   playing and paused state

Media Session was treated as an operating-system integration mechanism,
not as a guarantee of background playback.

### Existing Behavior Preservation

Normal Continuous Training uses the uninterrupted audio resource when
the selected lesson contains no phrases marked Weak.

Weak Phrase Training intentionally retains the existing segment-driven
playback path so its dynamic three-repetition behavior is unchanged.

Meaning → English Active Recall also retains its existing JavaScript and
speech-synthesis sequence.

Normal phrase-tap playback continues to use `lesson.mp3` with:

``` text
seekLeadSeconds = 0.5
```

This kept the vertical slice limited to Normal Continuous Training.

### Automated Validation

The implementation passed:

``` text
npm test
npx tsc --noEmit
npm run build:training-audio
npm run web:build
git diff --check
```

The automated test result was:

``` text
3 tests passed
```

All six stored Continuous Training source hashes matched their
recalculated SHA-256 values.

Generated track durations included:

``` text
basic-delivery           → approximately 205.92 seconds
five-phrase lesson tracks → approximately 49.15–54.00 seconds
```

The implementation was committed as:

``` text
a3067c2 feat: support iOS background continuous training
```

### Installed Standalone PWA Validation

The deployed implementation was tested on the physical iPhone using the
installed standalone EAG PWA.

The test was:

``` text
start Normal Continuous Training
→ confirm continuous-training.mp3 is playing
→ switch to the delivery application
→ leave EAG in the background
```

The result was:

``` text
audio stops
```

This occurred even though playback was now one uninterrupted media
resource and no JavaScript phrase transition was required.

The original scheduling hypothesis was therefore disproved as the
primary explanation for the standalone PWA behavior.

### Safari Comparison Validation

The exact same deployed EAG was then tested directly in Safari.

The comparison test was:

``` text
Safari
→ start Continuous Training
→ switch to the delivery application
→ leave Safari in the background
```

The result was:

``` text
audio continues playing
```

The observed environment matrix was:

``` text
Safari background playback         → continues
standalone PWA background playback  → stops
Media Session metadata and controls → visible
```

Media Session controls being visible did not cause the standalone PWA
audio to continue.

This confirms that Media Session API presence does not guarantee
background media playback.

### Revised Diagnosis

The investigation changed the diagnosis from:

``` text
foreground JavaScript scheduling is the primary cause
```

to:

``` text
the tested iOS standalone PWA environment stops background media
even when EAG plays one uninterrupted HTML media resource
```

The strongest conclusion supported by the real-device comparison is
that the remaining limitation is associated with the tested iOS
standalone PWA / WebKit background-media behavior rather than EAG phrase
transition JavaScript.

This is an observed platform limitation under the tested configuration.
It is not a claim that every iOS version or standalone PWA can never
support background audio.

### Operational Decision

The accepted operational workaround is:

``` text
lesson preparation / phrase selection / Weak settings
→ PWA or Safari

delivery / riding Continuous Training
→ Safari

switch to Uber Eats / delivery application
→ Safari audio continues in the background
```

When background Continuous Training is required during delivery or
riding, EAG will be used directly in Safari.

The installed PWA remains available for the other EAG workflows.

No further standalone PWA background-audio work will be pursued in this
vertical slice.

### Why the Implementation Is Retained

Commit `a3067c2` is intentionally retained.

The implementation remains useful because it:

-   removes phrase-boundary JavaScript playback dependencies
-   works with Safari background playback
-   is better suited to background-friendly playback environments
-   reduces runtime scheduling complexity for Normal training
-   provides a useful base for possible Random Continuous Training
-   documents and preserves a validated architectural improvement

The implementation should therefore not be interpreted as abandoned or
failed code merely because it did not bypass the tested standalone PWA
limitation.

### Deferred Work

The following remain possible future vertical slices:

-   Weak Phrase continuous-track/background architecture
-   Active Recall background architecture
-   Random Continuous Training
-   dynamic Weak/Normal session composition
-   playback speed controls
-   richer lock-screen controls
-   native-wrapper or native-application investigation if standalone
    PWA background playback later becomes sufficiently important

None of these are being implemented as part of the current slice.

### Result

The investigation was successful even though the standalone PWA did not
continue playing in the background.

The completed progression was:

``` text
problem observed
→ JavaScript scheduling hypothesis
→ single-resource Continuous Training implementation
→ automated validation
→ standalone PWA test still stops
→ Safari comparison continues
→ Media Session presence does not change the result
→ platform-specific behavior isolated
→ Safari adopted for delivery and riding
→ implementation retained
→ vertical slice closed
```

The project now has a verified environment that supports the real
delivery use case and a clearer boundary between EAG architecture and
the tested standalone PWA platform behavior.

------------------------------------------------------------------------

## 2026-08-30: Ride Active Recall Shuffle

### Background

Meaning → English Active Recall previously processed only the currently
selected lesson.

The learner therefore had to return to EAG and select another lesson at
each lesson boundary. This was unsuitable for the intended riding
workflow:

``` text
start Active Recall before riding
→ switch to the delivery application
→ continue learning without touching the screen
```

Fixed lesson order also made the next topic and phrase easier to predict.
The next slice therefore focused on both riding usability and retrieval
quality:

``` text
one start action
→ all current lessons
→ phrase-level random order
→ no lesson switching while riding
```

The training library at the start and end of this slice was:

``` text
basic-delivery        20 phrases
cash-payment           5 phrases
change-handling        5 phrases
order-verification     5 phrases
pin-verification       5 phrases
restaurant-delay       5 phrases
```

This represents six lessons and 45 phrases. No new training phrases were
introduced in this slice.

### All-Lesson Active Recall Queue

Active Recall now flattens every current lesson into one session queue.

Each queue entry retains the identity and content needed for playback:

-   lesson ID
-   phrase index
-   English phrase
-   Japanese phrase

This distinction is important because the visible, manually selected
lesson can differ from the lesson supplying the current shuffled phrase.

Active Recall no longer stops at a lesson boundary. One session continues
until all 45 queued phrases have been processed or the learner stops it.

### Phrase-Level Fisher-Yates Shuffle

Lessons are not randomized as six ordered blocks. All 45 phrases are
flattened first and then shuffled individually across lesson boundaries.

A session can therefore progress in an order such as:

``` text
basic-delivery
→ pin-verification
→ cash-payment
→ restaurant-delay
→ basic-delivery
```

This makes the Japanese meaning cue the primary retrieval signal rather
than allowing the current lesson topic to reveal the likely answer.

The queue uses Fisher-Yates shuffle rather than repeatedly selecting an
independent random phrase. As a result, each session provides:

-   no duplicate entries
-   no missing entries
-   every current phrase exactly once

The shuffle helper is separated as pure session-preparation logic and
supports injected random-number generation for deterministic tests.

A fresh queue is created for every new Active Recall start. The shuffled
order itself is not persisted.

### Cross-Lesson Audio Playback

The implementation retains one stable `HTMLAudioElement` rather than
creating an audio element for every lesson or phrase.

Before playing each queue entry, Active Recall uses its lesson ID to select
the correct `lesson.mp3` and metadata. This allows consecutive entries from
different lessons to play the correct English answer while preserving the
existing segment-playback architecture.

The validated Active Recall sequence remains:

``` text
Japanese meaning cue
→ 5-second Recall
→ English answer
→ English repeat
```

For Weak phrases it remains:

``` text
Japanese meaning cue
→ 5-second Recall
→ English answer
→ English repeat
→ English Weak Repeat
```

The existing behavior was therefore preserved:

``` text
Normal → English × 2
Weak   → English × 3
Recall → 5 seconds
```

Japanese cues still use browser `speechSynthesis`. English answers still
use lesson metadata and segment playback with:

``` text
trainingSeekLeadSeconds = 0.5
```

### Weak Phrase Compatibility

Weak state continues to use the existing versioned storage:

``` text
eag.weakPhrases.v1
```

Active Recall now resolves Weak state from the queue entry's actual:

``` text
lesson ID + phrase index
```

It does not use the currently rendered lesson ID. Identical phrase indexes
in different lessons therefore remain independent, including when shuffled
phrases cross lesson boundaries on every transition.

### Stop and Cancellation Behavior

Stopping Active Recall now cancels the entire all-lesson session,
including:

-   Japanese speech synthesis
-   current English segment playback
-   pending Recall timer
-   remaining queued phrases

The existing run identity also prevents stale asynchronous work from
restarting playback after cancellation.

The same full-session stop occurs when the learner taps a normal English
phrase or switches lessons. After stop or completion, the audio source is
restored to the manually selected lesson.

### Selected Lesson Persistence

The last manually selected lesson is now stored using:

``` text
eag.selectedLesson.v1
```

The behavior is:

``` text
manual lesson selection → save lesson ID
Safari reload           → restore saved lesson
no saved value          → Basic Delivery
unknown saved ID        → Basic Delivery
```

Internal cross-lesson audio switching during Active Recall does not change
the saved lesson. The architecture therefore explicitly distinguishes:

``` text
manually selected lesson
≠
current shuffled Active Recall source lesson
```

### Active Recall Tap Target

The Active Recall button felt too short vertically on iPhone. Its actual
interactive area was increased without redesigning unrelated controls:

``` css
min-height: 60px;
padding-block: 14px;
```

The same element is used for Start and Stop, so the larger target is
preserved throughout the session.

### Automated Validation

The implementation passed:

``` text
npm test              → 7 / 7 passed
npx tsc --noEmit      → passed
npm run web:build     → passed
git diff --check      → passed
```

Focused tests verify that:

-   every input phrase is included exactly once
-   no queue entry is duplicated or lost
-   lesson identity remains attached to phrase content
-   shuffling does not mutate the input
-   the current real training library produces 45 unique queue entries
    across all six lessons

Generated lesson audio and lesson data were not changed.

### Implementation Commit

The implementation was committed as:

``` text
58de11e feat: add shuffled all-lesson active recall
```

Files changed:

``` text
web/src/main.ts
web/src/active-recall.ts
web/src/style.css
src/active-recall.test.ts
```

### iPhone and Safari Real-Device Validation

The deployed implementation was validated on a physical iPhone in Safari.
All seven validation categories passed.

#### Lesson restoration

-   the previously selected lesson was restored after Safari reload
-   default fallback behavior worked correctly

#### Active Recall button

-   the 60-pixel vertical target was easier to tap
-   the larger target remained available in the Stop state

#### All-lesson shuffled session

-   one Active Recall start progressed beyond Basic Delivery
-   phrases were mixed across lesson boundaries
-   playback was not ordered as lesson blocks

#### Cross-lesson audio correctness

-   each Japanese cue corresponded to the correct English answer
-   crossing lesson boundaries did not play stale or incorrect lesson audio

#### Weak behavior

-   Normal phrases played English twice
-   Weak phrases played English three times

#### Riding and background operation

The operational test was:

``` text
Safari
→ start Active Recall once
→ move Safari to the background
→ open Uber Eats / delivery application
```

Active Recall continued across lessons and progressed to subsequent phrases
after Uber Eats notifications. No lesson-boundary interaction was required.

#### Stop behavior

-   Stop completely terminated the all-lesson session
-   tapping a phrase exited Active Recall correctly
-   lesson switching did not allow a stale session to resume

### Development Decision

Ride Active Recall Shuffle is complete and becomes the validated baseline
for the current training library.

The resulting workflow is:

``` text
Start Active Recall once
→ build one all-lesson phrase queue
→ shuffle all 45 phrases
→ Japanese cue
→ 5-second Recall
→ English answer and repeat
→ continue across lessons automatically
→ no riding-time lesson selection
```

This improves both:

-   riding usability by removing lesson-boundary screen interaction
-   retrieval quality by reducing sequence and topic prediction

### Deferred Work

The remaining five lessons have not been expanded to 20 phrases.

Future candidates remain:

-   expand the five 5-phrase lessons to 20 phrases each
-   add 75 phrases in total
-   reach six lessons × 20 phrases = 120 phrases
-   continue evaluating Active Recall during real delivery work
-   select further improvements from riding-use evidence

The planned 75-phrase content expansion is not part of this completed
slice.

### Result

Ride Active Recall Shuffle is complete.

The validated progression is now:

``` text
single-lesson Active Recall
→ all six lessons in one session
→ phrase-level Fisher-Yates shuffle
→ 45 phrases exactly once
→ correct cross-lesson audio and Weak state
→ Safari background operation during delivery
→ one start action is sufficient for the full current training set
```

------------------------------------------------------------------------

## 2026-09-02: Active Recall Session Resume and iPhone Safari Validation

### Background

Ride Active Recall Shuffle made it possible to start one randomized
45-phrase session before riding and continue across all six lessons.

However, an interrupted session still lost its position. Starting Active
Recall again created a new shuffle and returned the learner to the start of
a different session.

The next vertical slice focused on one recovery behavior:

``` text
Active Recall stops partway through
→ preserve the shuffled session and current phrase
→ start Active Recall again
→ restart the same phrase from its Japanese cue
```

The feature does not attempt automatic OS-level playback recovery or exact
audio-position restoration. Its purpose is to preserve the learning session
when playback is interrupted.

### Persistent Active Recall Session

An unfinished session is stored using the versioned key:

``` text
eag.activeRecallSession.v1
```

The persisted state contains only:

-   schema version
-   shuffled queue identities
    -   lesson ID
    -   phrase index
-   current queue index
-   training-library signature

English and Japanese text are resolved from the current library rather than
being duplicated in storage.

Micro playback state is intentionally not persisted. This includes:

-   Japanese cue position
-   remaining Recall time
-   current English repetition
-   audio current time
-   current media URL

The session therefore remains small and has a clear recovery boundary at the
phrase level.

### Current-Phrase Restart Semantics

Before each Japanese cue begins, Active Recall saves that phrase's queue
index as `currentIndex`.

If playback stops during any of the following stages:

-   Japanese cue
-   five-second Recall
-   first English playback
-   second English playback
-   Weak third English playback

the next Active Recall start restores the same queue and restarts the same
phrase from its Japanese cue.

This deliberately favors repeating one phrase over accidentally skipping
one. Playback phase and partial progress within the phrase are not restored.

Resume does not reshuffle the saved queue. The original session order and
its one-pass properties are retained:

``` text
no missing phrase
no duplicate queue entry
every phrase exactly once in the saved queue
```

Stop, normal phrase tap, and lesson switching still cancel the current
runtime completely, including stale asynchronous continuation. They retain
the unfinished persisted session so that the next Active Recall start can
resume it.

Only normal completion of the final queued phrase removes the saved session.
The following start then creates a fresh Fisher-Yates shuffle beginning at
index zero.

### Training-Library Compatibility

Persisted sessions must not be restored against a different training
library.

A deterministic signature is derived from the canonical ordered list of:

-   lesson ID
-   phrase index
-   English text

The source is shortened using FNV-1a 32-bit and the phrase count is included
in the resulting signature.

A saved session is rejected when validation detects:

-   malformed JSON
-   unsupported version or schema
-   signature mismatch
-   invalid current index
-   unknown lesson ID
-   invalid phrase index
-   duplicate queue identity
-   missing queue identity

Invalid or stale state does not prevent training. Active Recall discards it
and creates a fresh in-memory shuffled session.

This provides a compatibility boundary for future training-library changes,
including the planned expansion beyond the current 45 phrases.

### Storage Failure Isolation

During iPhone investigation, persistent session storage was isolated behind
a safe session store.

The store protects access to:

-   the browser storage object itself
-   `getItem`
-   `setItem`
-   `removeItem`

If any operation throws, persistence is disabled for the remainder of that
page lifetime. Active Recall continues with a fresh in-memory queue.

The resulting failure boundary is:

``` text
storage unavailable
→ session resume unavailable for this page
→ Active Recall playback remains available
```

A storage failure is therefore not treated as an Active Recall playback
failure.

### Automated Validation

The final implementation passed:

``` text
npm test              → 19 / 19 passed
npx tsc --noEmit      → passed
npm run web:build     → passed
git diff --check      → passed
```

The focused test coverage includes:

-   fresh sessions start at index zero
-   all phrases are present exactly once
-   resume preserves the saved queue order
-   the current phrase is restarted rather than skipped
-   malformed JSON falls back safely
-   incorrect schema or version falls back safely
-   library-signature mismatch rejects stale state
-   unknown lessons and invalid phrase indexes are rejected
-   duplicate and missing identities are rejected
-   shuffle does not mutate its input
-   the real six-lesson, 45-phrase library resumes correctly
-   browser storage object access failures are isolated
-   `getItem`, `setItem`, and `removeItem` failures are isolated

### iPhone Safari Regression

After Session Resume was introduced, Active Recall continued to work in the
PC browser but stopped starting on the tested iPhone Safari environment.

Pressing Start produced no Japanese cue, English audio, or visible playback
progress.

Because the same iPhone had successfully run Ride Active Recall Shuffle
before the Resume change, the new persistence path was investigated first.
Storage failure handling was strengthened, but the real-device symptom
remained.

Temporary on-screen diagnostics were then added so the iPhone could report
the actual start-path stage without depending on a remote console.

The first diagnostic build confirmed:

``` text
latest diagnostic build loaded
→ saved session restored
→ storage read and write succeeded
→ lesson metadata became ready
→ lesson audio source switched
→ loadedmetadata fired
→ SpeechSynthesisUtterance was created
→ speechSynthesis.speak() was called and returned
```

However, after `speak()` returned:

-   the utterance `start` event did not occur
-   the utterance `end` event did not occur
-   the utterance `error` event did not occur

The visible build marker also confirmed that the latest JavaScript bundle
was executing. The observed failure was therefore not explained by an old
Service Worker-controlled application shell or stale deployed bundle.

This is recorded as an observation from the tested device and deployment,
not as a general claim about all Safari or WebKit environments.

### Playback Ordering Investigation

The start path was compared with the previously validated implementation in
commit `58de11e`.

That implementation used the following order:

``` text
button click
→ create shuffled queue
→ await lesson metadata
→ switch English audio source
→ audio.load()
→ await loadedmetadata
→ speechSynthesis.speak()
```

Session Resume added synchronous session loading, validation, and saving.
It did not add a new `await` boundary before the first Japanese cue.

Nevertheless, the English media did not need to be prepared before the
Japanese cue. Active Recall semantics already require Japanese speech first
and English playback only after Recall.

The execution order was therefore changed to:

``` text
restore session and resolve queue entry
→ save current phrase index
→ start Japanese cue
→ start Recall
→ prepare lesson metadata and English audio during Recall
→ wait for both:
   - minimum five-second Recall
   - English media preparation completion
→ play English answer
```

This places the first Japanese cue before unnecessary English media
preparation while using the five-second Recall interval to prepare the
correct cross-lesson audio.

Recall never becomes shorter than five seconds. If media preparation takes
longer, English playback waits for it and the Recall interval is extended by
the necessary amount.

No silent-audio unlock, dummy playback, `speechSynthesis.resume()` workaround,
or automatic interruption workaround was added.

### Second iPhone Diagnostic Validation

The cue-first ordering was deployed with a second temporary diagnostic
build.

The tested iPhone Safari then reported the complete sequence:

``` text
speechSynthesis.speak returned
→ Japanese cue onstart
→ Japanese cue ended
→ Recall started
→ English audio preparation started
→ audio loadedmetadata ready
→ Recall ended
→ English audio.play attempted
→ English audio.play resolved
```

Playback continued to the next phrase and crossed lesson boundaries in the
observed order:

``` text
pin-verification
→ order-verification
→ change-handling
```

The Japanese cue and English answer remained correct across these
transitions. Progression also continued while Uber Eats notifications were
displayed.

The real-device result supports the cue-first ordering as the effective fix
for this observed regression. It does not establish that every iPhone Safari
speech-synthesis failure has the same cause.

### Session Resume Real-Device Validation

The final target workflow was validated on iPhone Safari:

``` text
Start Active Recall
→ Japanese cue
→ Recall
→ English × 2
→ continue to the next phrase
→ Stop
→ Start Active Recall again
→ resume from the same phrase
```

The same-phrase restart began from the Japanese cue as designed.

Together with the cross-lesson observation, this confirmed the target usage
path:

``` text
unfinished shuffled session
→ explicit or environmental interruption
→ restart Active Recall
→ preserve queue order
→ restart the saved phrase
→ continue across lessons
```

### Implementation and Diagnostic Commits

The relevant commits were:

``` text
1ebdf8c feat: resume interrupted active recall sessions
ca3f739 debug: add active recall iOS diagnostics
06d2a18 debug: start active recall speech before audio prep
f5bbbd3 fix: start active recall cue before audio preparation
```

The debug commits record the temporary instrumentation and ordering
experiment used during real-device investigation.

The final code removes all temporary diagnostic elements:

-   on-screen diagnostic panel
-   diagnostic build marker
-   stage logs
-   global error and unhandled-rejection listeners
-   speech and audio diagnostic events
-   diagnostic CSS
-   diagnostic-only storage availability API

No diagnostic UI remains in the completed implementation.

### Preserved Behavior and Scope

The completed slice preserves:

-   all six current lessons and 45 phrases
-   phrase-level Fisher-Yates shuffle
-   one-pass queue identity
-   correct cross-lesson audio
-   Normal English ×2
-   Weak English ×3
-   Japanese meaning cue
-   minimum five-second Recall
-   `trainingSeekLeadSeconds = 0.5`
-   Weak Phrase persistence
-   manually selected lesson persistence
-   Stop, phrase tap, and lesson-switch cancellation
-   Safari background usage established in prior validation
-   Active Recall Session Resume
-   storage failure fallback

No training content, generated audio, Service Worker behavior, or Continuous
Training architecture was changed in this slice.

The planned 75-phrase expansion remains deferred. The training library is
still the validated six-lesson, 45-phrase set.

### Result

Active Recall Session Resume and its iPhone Safari regression investigation
are complete.

The validated progression is:

``` text
all-lesson shuffled Active Recall
→ persistent unfinished session
→ same-phrase restart from Japanese cue
→ storage and library compatibility protection
→ iPhone start regression observed
→ on-screen stage diagnostics
→ speak() returned without utterance events
→ Japanese cue moved before English media preparation
→ complete speech and audio event progression restored
→ cross-lesson and Uber Eats notification validation
→ temporary diagnostics removed
```
