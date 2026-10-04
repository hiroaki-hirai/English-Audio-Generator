# 20-Cue diagnostic fixture

This fixture tests whether the same playback path that succeeded for three cues continues through 20 cues in iPhone Safari background. It is an experiment, not a playback improvement.

## 1. Changed files

- `README.md`: entry point to this report.
- `web/src/main.ts`: separate 20-Cue button, fixture routing, memory store selection, explicit diagnostic segment boundaries, 20-Cue completion and diagnostic display.
- `web/src/japanese-cue.ts`: diagnostic asset identity/path routing only.
- `web/src/audio-transition-diagnostic.ts`: history capacity 100 → 4,000 events; retained count in header.
- `src/audio-transition-diagnostic.test.ts`: enlarged history capacity coverage.
- New `web/src/diagnostic-cues.json`: exact confirmed Japanese/English text in Cue 1–20 order.
- New `web/src/diagnostic-fixture.ts`: diagnostic identity and asset paths.
- New `web/src/twenty-cue-diagnostic.ts`: per-start memory-only store.
- New `src/generate-diagnostic-fixture.ts`: isolated audio generation and assembly.
- New `src/verify-diagnostic-audio.ts`: verification of final MP3 boundaries and Japanese decoding.
- New `src/twenty-cue-diagnostic.test.ts`: fixed order, storage isolation, normal resume and published asset verification.
- New `docs/20-CUE-DIAGNOSTIC.md`: this report.

## 2. Added audio

Public root: `web/public/diagnostics/20-cue-background-test/`.

- `english/lesson.mp3`: one English lesson, 311.832 seconds.
- `japanese/phrase-001.mp3` through `japanese/phrase-020.mp3`: 20 separate Japanese cues.
- `metadata.json`: 20 exact phrase identities, texts, start/end seconds, sample offsets and final waveform verification values.

Temporary per-phrase English MP3s and assembly inputs are under ignored `output/20-cue-background-test/`; they are not public assets or part of the Git changes.

## 3. Japanese MP3 mapping

Paths below are relative to the public root above. Text is passed verbatim to TTS.

| Cue | Japanese MP3 | Japanese text |
| --- | --- | --- |
| 1 | `japanese/phrase-001.mp3` | Uber Eats の配達です。ご注文の商品をお持ちしました。 |
| 2 | `japanese/phrase-002.mp3` | 承知しました。大変お待たせ致しました。 |
| 3 | `japanese/phrase-003.mp3` | まず本人確認をさせてください。 |
| 4 | `japanese/phrase-004.mp3` | Uber Eats のアプリの画面を見せていただけますか？ |
| 5 | `japanese/phrase-005.mp3` | 私の顔のアイコンか注文番号はありますか？ |
| 6 | `japanese/phrase-006.mp3` | 確認できました。ありがとうございます。 |
| 7 | `japanese/phrase-007.mp3` | では、先に会計をさせてください。 |
| 8 | `japanese/phrase-008.mp3` | 合計で2,350円になります。 |
| 9 | `japanese/phrase-009.mp3` | こちらに入れていただけますか？ |
| 10 | `japanese/phrase-010.mp3` | 5,000円、お預かりします。 |
| 11 | `japanese/phrase-011.mp3` | 2,650円のお釣りです。 |
| 12 | `japanese/phrase-012.mp3` | まず2,000円。次に500円。そして50円。 |
| 13 | `japanese/phrase-013.mp3` | これで合計2,650円です。 |
| 14 | `japanese/phrase-014.mp3` | 間違いは無いでしょうか？ |
| 15 | `japanese/phrase-015.mp3` | では、こちらがご注文の品です。 |
| 16 | `japanese/phrase-016.mp3` | 重たいので気をつけてください。 |
| 17 | `japanese/phrase-017.mp3` | 大丈夫でしょうか？ |
| 18 | `japanese/phrase-018.mp3` | 最後に暗証番号を教えていただけますでしょうか？ |
| 19 | `japanese/phrase-019.mp3` | パスが通りました。 |
| 20 | `japanese/phrase-020.mp3` | ありがとうございます。またのご利用をお待ちしております。 |

## 4. English metadata

All rows refer to the same `english/lesson.mp3`. Phrase IDs are zero-based; Cue numbers are one-based. Start/end are seconds, and describe the first English utterance in each block (the segment used by Active Recall).

| Cue | Phrase ID | English text | Start | End |
| --- | --- | --- | ---: | ---: |
| 1 | `20-cue-background-test:0` | Hi! I'm with Uber Eats. I have your order. | 0.000 | 3.648 |
| 2 | `20-cue-background-test:1` | Okay. Sorry to keep you waiting. | 17.296 | 19.600 |
| 3 | `20-cue-background-test:2` | Let me just confirm it's your order first. | 31.904 | 35.504 |
| 4 | `20-cue-background-test:3` | Could you show me your Uber Eats app, please? | 49.104 | 52.608 |
| 5 | `20-cue-background-test:4` | Can you see my profile picture or the order number? | 66.112 | 69.016 |
| 6 | `20-cue-background-test:5` | Yep, the numbers match. Thank you. | 81.920 | 84.320 |
| 7 | `20-cue-background-test:6` | All right. Let's take care of the payment first. | 96.720 | 99.576 |
| 8 | `20-cue-background-test:7` | Your total is 2,350 yen. | 112.432 | 115.840 |
| 9 | `20-cue-background-test:8` | Could you put it here, please? | 129.248 | 131.864 |
| 10 | `20-cue-background-test:9` | That's 5,000 yen. Thank you. | 144.480 | 146.928 |
| 11 | `20-cue-background-test:10` | And your change is 2,650 yen. | 159.376 | 162.928 |
| 12 | `20-cue-background-test:11` | First, 2,000 yen. Then, 500 yen. And 50 yen. | 176.480 | 181.928 |
| 13 | `20-cue-background-test:12` | That's 2,650 yen altogether. | 197.376 | 201.144 |
| 14 | `20-cue-background-test:13` | Does that look right? | 214.912 | 216.520 |
| 15 | `20-cue-background-test:14` | All right. Here's your order. | 228.128 | 230.336 |
| 16 | `20-cue-background-test:15` | It's pretty heavy, so please be careful. | 242.544 | 245.304 |
| 17 | `20-cue-background-test:16` | Have you got it? | 258.064 | 259.912 |
| 18 | `20-cue-background-test:17` | Lastly, could I get your PIN, please? | 271.760 | 274.328 |
| 19 | `20-cue-background-test:18` | That worked. | 286.896 | 288.096 |
| 20 | `20-cue-background-test:19` | Thank you very much. Enjoy your meal, and have a good one! | 299.296 | 303.064 |

## 5. Generation and measured boundaries

Generation command: `npx tsx src/generate-diagnostic-fixture.ts`.

The existing OpenAI SDK, `.env` / `OPENAI_API_KEY`, `gpt-4o-mini-tts` and `cedar` generate 20 Japanese MP3s and 20 temporary English source MP3s. No dependency was added. Each confirmed text is supplied without substitution.

FFmpeg decodes English sources to mono 24,000 Hz signed 16-bit PCM, counting actual samples. The existing lesson block structure is retained: English utterance → 5-second silence → same English utterance, followed by 5-second silence between blocks. This keeps the original 0.5-second seek lead in silence before each later block. The second physical utterance is retained to match the existing lesson structure; runtime repeats continue to seek to the first utterance as before.

The concatenated PCM is normalized with `loudnorm=I=-16:LRA=7:TP=-1.5`, encoded using `libmp3lame`, and decoded again. Final decoded sample count: **7,483,968**, at **24,000 Hz**, duration **311.832 seconds**. Every first-utterance window in the actual final MP3 is compared to the correspondingly normalized source waveform. Correlations range from **0.983190** to **0.997613**, all above 0.98. Thus the boundaries are measured and verified, not inferred from text length. `startSample` / `endSample` are the authoritative integer boundaries; seconds are those values divided by 24,000.

Final lesson SHA-256: `cf5c9d839f06513a4f8a28e8ed3a6a403bc6bd09c7cfe104033cb16553de59df`.

The generator skips existing per-phrase assets and refuses to overwrite an existing final lesson or metadata. It never writes into the original three-cue directory or normal lesson directories. Generation was followed by standalone `verifyDiagnosticAudio()` validation; future generation invokes the verifier automatically.

## 6. Playback control path comparison

**No substantive change to the playback control path.** `playSegment()` is byte-for-byte identical to HEAD. Japanese completion still resolves only on the existing dedicated audio element's `ended` event. The same Recall delay, English metadata/load preparation, 0.5-second seek lead, play call, timeupdate-based segment finish, repetition count and repeat gap remain in use.

`Japanese MP3 → ended → existing Recall delay → English lesson seek → play → segment finish → existing repeat → next Japanese MP3`.

Changes are limited to choosing the independent fixture and its asset URLs, forcing MP3 mode for this new button, reading measured diagnostic `end` values instead of deriving them from the normal lesson layout, stopping after Cue 20, and extending observations. Normal metadata without `end` still uses the original calculation. Two runtime English repetitions remain, as in the successful three-cue path.

No retry, unlock, fallback, dummy/muted audio, WebAudio, watchdog or other workaround was added. Existing three-cue test remains available and unchanged in its session/asset behavior.

## 7. Normal lessons unchanged

Compared tracked blobs against HEAD: 43 protected files, zero changes. These include all seven scripts / 65 phrases, `training-lessons.json`, normal lesson MP3s / metadata / continuous tracks / hashes, original three Japanese MP3s, `active-recall.ts`, the three-cue session module, Service Worker and normal precache list. Diagnostic fixture is not added to the ordinary lesson list or offline precache. Use an online test.

## 8. Resume semantics unchanged

Each new diagnostic start creates a separate memory-only store, starts at Cue 1, and returns after Cue 20's English repetitions; no next round starts. Normal saved session/round state is neither loaded nor written by this path. Normal start buttons keep their existing stores and resume handling. Tests preserve normal saved index 43 before and after all 20 diagnostic checkpoints and store clearing. The existing three-cue memory isolation test also passes.

## 9. Audio transition sequence retention

The existing observer remains in use: performance timestamp, visibility, activation, audio state, owner, queue index, element identity, previous playback and play request ID. Capacity increases from 100 to **4,000 events**, in memory; the header displays the actual retained count. History resets at an explicit next Active Recall start, not at cue transitions or completion. Completion, stop and failure leave the current history available for capture until the next start. Bounded retention and observer failure isolation are tested. No 20-Cue browser run event count is claimed: local browser automation was unavailable. In a normal 20-Cue run, the existing non-timeupdate event recording is well within this capacity.

## 10–14. Initial fixture local checks (historical)

- `npm test`: 70 passed, 0 failed. Includes all 65-phrase/Resume/3-Cue regressions, ordered memory-only 20-Cue session, final English checksum and decoded sample count, exact fixture metadata, and all 20 Japanese MP3 decoding checks.
- `npm run web:build`: passed; normal index remains seven lessons / 65 phrases / 21 precache audio paths.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed (exit 0).
- `git status --short --untracked-files=all`: 5 modified files and 29 new files (7 source/documentation files + 21 MP3s + metadata), all within the diagnostic scope. No commit or push performed.

Built Vite preview also served all 22 diagnostic URLs (21 MP3s + metadata) with HTTP 200 and byte-identical local contents. English MP3 byte-range request returned HTTP 206. This checks resource delivery, not Safari autoplay/background behavior.

## iPhone verification

1. Open the built app online and tap **Start Fresh 20-Cue MP3 Diagnostic** (the selector is ignored for this button; it always uses MP3).
2. Confirm memory-only storage, queue length 20, position 1/20, fixture phrase `20-cue-background-test:0` and running status.
3. Switch to the delivery app at the same point used in the successful three-cue test. Keep Safari in the background and observe Cue 1–20 in order.
4. After completion or a stall, return and capture the full Audio transition sequence before starting another session. Expected completion: `Diagnostic test completed — 20 cues`, without Cue 21 or another round.

The in-app Browser connection was unavailable during local validation, so no local browser playback run was completed. The subsequent user-reported real-device result is recorded below; it is distinct from the automated checks.

## Real-device result reported on 2026-10-04

The user confirmed successful testing on **iPhone Safari**, after deploying
`d5a4a4f20d02b34de02e682233ff3396661af9bc` (training controls initialization fix).
All Start buttons worked normally. **Start Fresh 20-Cue MP3 Diagnostic** started
at Cue 1 and completed **Cue 1 through Cue 20**, with each Japanese MP3 followed
by its English lesson segment. During playback, another app was brought into
the foreground; Safari remained in the background and playback continued,
including subsequent Japanese MP3 → English segment transitions and completion.

The playback control path that succeeded for three cues was retained without
substantive changes. No retry, unlock, dummy/muted audio, WebAudio, automatic
fallback or autoplay workaround was used. The session remained memory-only.

This run confirms that pre-generated Japanese MP3 cues can support 20 consecutive
Japanese → English transitions in iPhone Safari, including continued transitions
after Safari moves into the background. It makes MP3 a strong migration candidate
for normal 65-phrase Active Recall. It does not establish that all 20 transitions
occurred in the background, or validate all normal shuffle, weak-phrase and Resume
paths. Device/iOS version, exact app-switch cue and full transition logs were not
provided. Normal Active Recall remains unchanged; 65-cue migration is design-only.

### Training controls regression and correction

The 20-Cue button increased `.active-recall-button` elements from four to five.
The shared `length !== 4` check then threw `Training controls were not found.`
after rendering, before Start click handlers were registered. Thus all Start
buttons were visible but inactive. Commit
`d5a4a4f20d02b34de02e682233ff3396661af9bc` changed the check to `length !== 5`
and added initialization regression tests. The real rendered page is bundled
in memory and evaluated with a minimal DOM: five Active Recall buttons and all
six Start handlers must exist. The old four-button guard reproduces the exception
and zero Start registrations. The user subsequently confirmed that every Start
button worked on iPhone Safari. No playback control change was needed.

The fix's local checks passed: 72 tests, production build, configured TypeScript
check and diff check. Real-device success is user-reported evidence, not a local
browser test performed by the assistant.
