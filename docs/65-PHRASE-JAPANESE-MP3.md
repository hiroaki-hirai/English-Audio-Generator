# 通常65フレーズ Japanese MP3移行

2026-10-04。ローカル実装・生成・検証の記録。commit / pushは未実施。通常65フレーズのiPhone実機検証は未実施。

## 変更範囲

- web/src/main.ts: selectorをMP3 default / Speech Synthesis legacyにし、Japanese playへ通常/診断asset区分を渡すだけ。
- web/src/japanese-cue.ts: normal mp3 mode、asset区分によるpath選択、scope表示。既存mp3-diagnostic tokenは互換値として維持。
- 新しいweb/src/training-japanese-cue.ts: lesson IDと元phraseIndexによる通常URL解決。
- 新しいsrc/generate-training-japanese-cues.ts、src/training-japanese-assets.ts、src/verify-training-japanese-cues.ts: 生成・source hash・manifest・全件検証。
- src/japanese-cue.test.ts / src/training-controls.test.tsおよび新しいsrc/training-japanese-cues.test.ts / src/training-japanese-sw.test.ts: mode・actual初期画面・asset・queue・state・SWの検証。
- README.md、docs/JAPANESE-CUE-AB-TEST.md、本資料: defaultと通常/診断分離・検証手順。
- web/public/japanese-cue-manifest.jsonと65 MP3。

## 生成した構成

| Lesson | MP3数 |
| --- | ---: |
| basic-delivery | 20 |
| cash-payment | 5 |
| change-handling | 5 |
| order-verification | 5 |
| pin-verification | 5 |
| restaurant-delay | 5 |
| giving-directions | 20 |

通常assetはweb/public/lessons/<lesson-id>/japanese-cues/phrase-001.mp3形式。65本、合計3,168,768 bytes、合計発話音声duration 198.048秒（待機や英語を含まない）。同文4組もID別に新規生成し、deduplicateなし。

## Manifestと生成

各entryにphraseId、lessonId、phraseIndex、ja、path、config（model/voice/instruction/response format/normalization/sample rate/channels）、sourceHash、audioSha256、duration、formatを保持。
sourceHashはID/JA/path/configのSHA-256。audioSha256は実際のMP3 bytes。
model gpt-4o-mini-tts、voice cedar、MP3、日本語指示は診断と同一、追加loudness normalizationなし。
全生成音声はMP3 / 24,000 Hz / mono。SDK maxRetries:0。再実行はsource/file hashが一致するassetだけ再利用し、不明/古いfileを上書きしない。
TTSの再生成でbyte一致を保証するものではないため、manifestと生成成果物を保管する。

```sh
npx tsx src/generate-training-japanese-cues.ts
npx tsx src/verify-training-japanese-cues.ts
```

全件検証結果: files=65 / missing=0 / extra=0 / duplicateIds=0 / mismatches=0。
日本語ソース・path/config/source hash、音声hash、duration/formatを一致確認。全65本ffmpeg decode成功。source対応は生成入力・manifest照合で検証し、音声のASRによる全文照合は行っていない。

## Resolverと再生制御

cash-payment:3 → lessons/cash-payment/japanese-cues/phrase-004.mp3。
queueIndexやJA本文でなく元のlessonId/phraseIndexを使用。BASE_URLは従来と同じ。
runActiveRecallのJapanese play入力にassetScopeを追加し、通常はlesson、fresh3/20はdiagnosticを明示。
既存player呼出しでscope省略時は従来のdiagnostic pathを保持する。
MP3 defaultはselectorのselectedとgetJapaneseCueModeのdefaultで統一。Speech Synthesisを明示選択すれば既存関数を使う。失敗時の自動fallbackなし。

Japanese MP3 → ended → Recall 5秒（English metadata/loadを並行準備）→ 既存English seek/play → segment finish → 英語反復 → 次のJapanese。
playSegment / speakJapaneseCue / runTrainingの関数本文はHEADと完全一致。変更したのは日本語mode選択とasset URL解決、scope表示だけ。ended/play/seek/finishの制御は変えていない。
68の保護対象tracked files（既存英語教材・metadata・diagnostic assets・queue/session・Media Session・Service Worker等）はHEADと一致。

## Stateと診断の分離

Japaneseは1回、Englishはnormal2回/Weak3回。Weak key/schema、saved queue/currentIndex/round state/librarySignatureは未変更。
Resumeは保存されたphrase identityのMP3冒頭から再開。Japaneseの途中位置は保存せず、新しい永続stateは追加しない。
3 queue modeすべて同じnormal resolverを使用。
fresh3/20は引き続きmemory-onlyで既存診断assetを使用し、3/20件で終了する。通常65は既存どおり次roundへ進む。
selectorは次startに適用し、modeの新しい永続保存は行わない。20-CueはMP3固定。

## Service Worker / offline

Service Workerおよびprecache一覧は未変更。Japanese個別MP3は専用lesson.mp3/continuous-training.mp3分類に一致せず、一般network-first経路を通る。
実際のsw.jsをVMで実行するテストで、cached responseがあってもonline Japaneseはnetworkから取得し、200をcache保存、206 Rangeをそのまま返すことを確認。
今回65本をprecacheしないため、未取得cueのoffline再生やJapaneseのoffline Range対応は保証しない。online background検証を先行する。

## Audio transition diagnostics

既存observerを維持し、Japanese request/endedとEnglish seek/play-call/play/playing/play-resolvedを同じ履歴で確認できる。
4,000 events上限は変更なし。全65句Weak（英語195回）のactual初期画面/最小DOMテストで開始イベントからcue64まで保持、次round開始も確認。
最小DOMのイベント量を検証したもので、実機の追加event数は未計測。上限は有限のまま、複数roundを無制限保存しない。次の明示startでreset。

## 自動・ローカル検証

- npm test: 82 passed, 0 failed。
- asset verifier: 65 files、missing/extra/duplicate/mismatch 0、全decode成功。
- npm run web:build: passed。
- npx tsc --noEmit / git diff --check: passed。
- 最小DOM: 5 recall buttons / 6 Start handlers / MP3 selected、実際のmain.tsをbundleして実行。
- normal Japanese ended前のEnglish待機、通常2回/Weak3回、Resumeのqueue/round/Weak保持、legacy speech、normal Training、3/20 diagnostic分離を検証。
- 実際のbuild済みindex-C8WsBhrv.jsを最小DOMで実行: Active Recall5個、Start handler6件、MP3 selected、初期化errorなし。
- build previewで全65 MP3 URLのHTTP 200・audio Content-Type・manifest SHA-256一致を確認。Japanese Range要求もHTTP 206。

## iPhone online実機試験

1. レビュー後にdeployする（今回は未commit/未push）。iPhone Safariで最新版とMP3 selectedを確認。
2. 各normal Startを押し、asset scope=lesson、phrase ID/URLが通常lesson配下であることを確認。既存saved positionは消去しない。
3. 20-Cueで成功したのと同じタイミングで他アプリをforegroundにし、Japanese ended→English seek/playの遷移を観察。
4. Sequential Category Orderで65件、各教材境界、次round開始を確認。Global Shuffle / Category Shuffleも検証。
5. Weak phraseのJapanese1回/English3回を確認。
6. Japanese途中とEnglish途中でStopし、Resumeが同じphraseのJapanese先頭から始まり、saved queue/round/Weakが維持されることを確認。
7. 3-Cue A/Bと20-Cueも別asset/memory-onlyで確認。legacy Speech Synthesisは明示選択で確認。
8. stall/error時は再startせずAudio transition sequenceを取得する。MP3失敗でSpeechへ切り替わらないことを確認。

20-Cue成功からの実質的変更は、通常65件のasset resolverとdefault modeへの一般化のみ。Japanese ended後のEnglish playback controlに変更なし。
