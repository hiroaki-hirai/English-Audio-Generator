# Japanese cue MP3 diagnostic A/B test

This is an experiment, not a production replacement for Speech Synthesis.
Speech Synthesis remains the default on page load. The selector applies to
the next Active Recall start and is not persisted or applied mid-run.

## Assets and generation

Three Japanese cues are provided for the first three phrases of Basic Delivery:

| Phrase ID (zero-based) | File under `web/public/diagnostics/japanese-cues/basic-delivery/` | Japanese text |
| --- | --- | --- |
| `basic-delivery:0` | `phrase-001.mp3` | お世話になっております。Uber Eatsです。 |
| `basic-delivery:1` | `phrase-002.mp3` | お待たせしました。 |
| `basic-delivery:2` | `phrase-003.mp3` | まずはご注文の品をどうぞ。 |

The generation script reuses the existing OpenAI SDK, model
`gpt-4o-mini-tts` and voice `cedar`, with Japanese reading instructions.
It reads `ja` directly from `training-scripts/<lesson-id>.json`, skips existing
files, and does not overwrite English audio or the lesson build inputs.
Generation uses the existing `.env` / `OPENAI_API_KEY` configuration and incurs
API usage. No new dependency is required.

```sh
npx tsx src/generate-japanese-cues.ts basic-delivery 3
npm run web:build
```

Paths use the original lesson phrase index plus one, padded to three digits,
not the shuffled queue index. For a later targeted experiment, the same command
accepts another lesson ID and a count from the beginning of that lesson.
Changed source text requires deliberate regeneration of the corresponding file;
existing files are not automatically refreshed.

## Playback and interpretation

Both branches await the Japanese cue before the existing Recall interval and
English playback. A uses the unchanged Speech Synthesis function. B uses one
reused, dedicated audio element and resolves normally only on `ended`.
Explicit Stop cancels the cue and relies on the existing run-ID/active guard.
Errors reject into the existing Active Recall error handling. There is no
retry, watchdog, unlock playback, automatic resume, or speech fallback.

The dedicated element avoids changes to the English player and Media Session
guard. Its autoplay/background behavior is itself a possible limitation:
`NotAllowedError` at the initial request means this B run did not establish a
successful MP3 comparison. It does not prove the original speech hypothesis.
The existing `audio owner`/`audio paused` fields still refer to English audio;
use the Japanese MP3 fields to inspect B. Old speech/MP3 records can remain from
the previous run; consult the displayed current/last-run cue mode and phrase ID.

The Service Worker and its precache asset list are unchanged. Use an online test;
the three files are copied into the normal web build but are not added to the
offline audio precache.

## iPhone procedure

1. Serve the changed build at an iPhone-accessible test URL. Check that the
   selector and the three MP3 URLs load. This work does not deploy the build.
2. Keep the normal Safari session containing the original checkpoint intact.
   Use a fresh private browsing session for each A/B run so both start from
   the same queue position. Verify `action: fresh`, position `1/65` and
   `basic-delivery:0`; if the private session has existing EAG state, it is not
   a fresh test. Do not use Global Shuffle for this three-file sample.
3. A: leave **Speech Synthesis** selected and tap **Start Sequential Category
   Order**. Move the delivery app to the foreground at a recorded, repeatable
   point (for example, during the first English answer, before cue 2).
4. Record whether Japanese cue 2 → English answer 2 → Japanese cue 3 → English
   answer 3 are heard while Safari remains in the background. After a stop,
   return to Safari and capture the diagnostics before pressing any controls.
5. B: start from another fresh private session, select **MP3 diagnostic**, and
   repeat the same Ordered Category start and app-switch timing. Observe the
   same phrase sequence. Capture MP3 request/play/ended/error, visibility,
   phrase/index, runtime, checkpoint and the existing English audio fields.
6. Only the first three cues exist. Cue 4 is intentionally not generated; an
   error there is the sample boundary, not evidence of a background failure.
   The queue still has all 65 phrases; it is never shortened or skipped.
7. Repeat with app switching during cue 1 if investigating interruption during
   speech itself. Record that timing separately from the before-cue-2 test.

`play started` is recorded from `playing`, not from fulfillment of `play()`.
Each MP3 event includes visibility and `performance.now()` milliseconds.
No-error/no-ended silence is also useful evidence; screenshot without restarting.
If B completes several background Japanese/English transitions while A stalls
after onstart, that supports (but does not establish) a Speech Synthesis-specific
lifecycle hypothesis. Three phrases do not establish long-running reliability.
