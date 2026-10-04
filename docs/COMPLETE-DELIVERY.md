# Complete Delivery / 受け渡し総合

2026-10-05。実装・asset作成・ローカル検証の記録。未stage／未commit／未push。新LessonとしてのiPhone検証は未実施。

## 通常Lessonの構造

- ID `complete-delivery`、domain `delivery`、scenario `Complete Delivery`、scenarioJa `受け渡し総合`。
- `training-scripts/complete-delivery.json`が通常source。元診断の20 pairを句読点・順序ごと保持。
- identityは`complete-delivery:0`〜`:19`。既存の類似phraseや診断identityと共有しない。
- 通常runtimeは生成された`training-lessons.json`を使用し、診断sourceをこのLessonの依存元にしない。
- 現在8 Lessons / 85 phrases。診断fixtureの20件は通常件数に重複計上しない。

```text
web/public/lessons/complete-delivery/
  lesson.mp3
  metadata.json
  continuous-training.mp3
  source-hash.txt
  audio-provenance.json
  japanese-cues/phrase-001.mp3 ... phrase-020.mp3
```

## 音声の再利用と境界

Fresh 20-Cue診断でiPhone Safariのbackground成功報告があるscript/audioを昇格した。
診断`english/lesson.mp3`とJapanese20本はbyte一致コピー。TTS、コピー音声の再encode・normalizationなし。
元診断source/audio/metadataは変更しない。通常runtimeは通常lesson配下だけを参照する。

通常metadataはlessonId、通常phraseId、en/ja、start/end、startSample/endSample、sampleRate、decoded totalSamples/duration、lessonSha256を保持。
診断の測定済み境界をそのまま使用し、fixtureIdやdiagnostic pathは含めない。
English lessonは2回発話＋5秒間隔のブロック構成。decoded durationは311.832秒。
明示的endを扱う既存runtimeをそのまま利用し、MP3 containerのpaddingから境界を推測しない。

## Continuous Training

今回新しく作成した音声は`continuous-training.mp3`だけ。TTSは不要。
完成済み通常lessonを24kHz mono PCMへdecodeし、metadataのsample位置で各発話を抽出する。
各句を「English → 1秒無音 → 同じEnglish → 5秒Recall」で配置。40発話区間、decoded duration 236.832秒。
既存`continuousTrainingConfig`のcodec、sample rate、loudness設定を適用する。
コピーしたlesson/Japanese音声には処理を加えない。

初回import前には、output/に残る元英語20録音を診断生成時の並び・正規化処理で参照波形へ復元し、最終lessonの測定区間と相関0.98以上で照合。
元MP3 hashと各相関はprovenanceに保存する。通常Lessonの再構築・検証はoutput/の元録音を必要としない。

```sh
# 初回import専用。既存directoryがあれば拒否し、診断は上書きしない。
# 初回auditにだけ元のoutput/20-cue-background-test/phrase-*.mp3が必要。
npx tsx src/build-complete-delivery.ts

# 完成済み通常source/lesson/metadata/provenanceだけで再構築。
# output/complete-delivery-rebuilt/へ書き、公開assetは上書きしない。
npx tsx src/rebuild-complete-delivery-continuous.ts

# 読み取り専用検証（診断コピー元との比較も実施）。
npx tsx src/verify-complete-delivery.ts
npx tsx src/verify-training-japanese-cues.ts
```

MP3の再encode byte一致はffmpeg環境に依存するため、再構築では入力PCM hash、decoded sample数、波形・無音構造を根拠にする。
同じローカル環境での再構築hashも照合する。境界・入力PCM hashが変われば再構築は拒否する。

## Source hashとprovenance

`source-hash.txt`は既存`calculateTrainingAudioSourceHash()`を使用。canonical LFの通常script bytesとContinuous Training configを含む。
.gitattributesは新規complete-delivery.jsonだけLFを固定し、Gitの改行変換後もsource bytes/hashを保持する。
import/verifier/再構築と通常audio buildのcomplete-delivery処理は、CRLFでもLFへ正規化してからhashを計算する。他Lessonのhash計算は変更しない。
診断metadataのaudit hashはLFへ統一したUTF-8 textを使い、既存診断metadata自体は変更しない。
変更がなければ既存training audio buildはこのLessonのTTS再生成をskipする。
sourceを将来変更した場合は再利用の前提が崩れるため、新しい生成・検証方針を判断する。

`audio-provenance.json`は生成/audit記録であり、runtime metadataではない。
通常source hash、診断metadata hash、21コピーのsource/destination/original/copied SHA-256、reuse reason、元英語auditを保持。
Continuousについて通常lessonとmetadataの由来、config、input PCM hash、40区間のsample位置と元PCM hash、完成音声hashを保持。

Japanese manifestは既存65 entryを保持し20 entry追加。新ID/pathによるsourceHashと、コピー音声のaudioSha256/duration/formatを記録。
通常resolverは元lessonId/phraseIndexからphrase-001〜020へ解決し、変更なし。
生成・検証の件数はsourceから導出し、8 Lessons / 85 phrasesは独立したlibraryテストで保証する。

## Queue / Resume / Weak

Globalは85句をshuffle。Category Shuffleは8 Lessonと各Lesson内をshuffle。
Category Orderは以下の順で、complete-delivery内は20句固定順序。

```text
basic-delivery → cash-payment → change-handling → complete-delivery
→ order-verification → pin-verification → restaurant-delay → giving-directions
```

通常Active Recallは全Lesson対象であり、complete-deliveryだけの専用Recall modeは追加しない。
Start Trainingは選択Lessonを再生し、Weakがなければcontinuous、Weak指定時は従来のsegment経路を使う。

旧65句saved sessionはlibrary-signature-mismatchでfresh85句queue、index 0、既存方針によるround初期化となる。
新85句sessionは通常Resume。migration、保存schema、signature algorithmは変更しない。
既存Weak設定は保持し、新LessonのWeak keyは独立。通常RecallではJapanese1回／English2回、WeakではEnglish3回。

## Playback / Diagnostics / Service Worker

変更なし：playSegment、Japanese player/resolver、Japanese ended、English seek/play、Media Session、Active Recall runtime、queue architecture、legacy speech。
新しいretry/unlock/fallbackは追加しない。
3-Cue/20-Cue診断のsource/assets/metadata、memory-only、Cue1開始・3/20件終了を維持。
通常Lessonは85句で次roundへ進む。transition historyの4,000件上限は維持。

sw.js/cache strategyは変更なし。training-audio-assets.jsは21→24 paths。
新Lessonのlesson.mp3、continuous-training.mp3、metadata.jsonを含む。
Japanese85本はoffline precacheへ追加しない。未取得Japaneseのoffline再生を保証しない。

## 検証とiPhone確認

自動検証は20 pair一致、コピーhash、20 measured boundaries/decoded duration、Japanese85本manifest/mapping/hash/decode、Continuous40区間の相関0.98以上と無音内部、8/85 unique identitiesを対象にする。
実main.tsをbundleする最小DOMで新Lesson選択、Start/Stop、MP3 default、Weak、3 Recall modeの新LessonResume、3/20診断終了、85句Weak roundの履歴保持を検証する。
ローカルbuildのHTTP/Range確認は配信互換性の確認であり、iPhone実機成功の代替ではない。

iPhoneでは新Lessonの表示、Start TrainingとWeak Training、通常Recallの新Lesson遷移/background、3 queue mode、旧sessionの一度fresh化、新session Resume、3/20診断の独立性を確認する。


## ローカル検証結果

- npm test: 91 passed / 0 failed（LF/CRLFのcanonical source hash回帰テストを含む）。
- npm run web:build: 8 Lessons / 24 assets、build成功。JS index-CHF6roX8.js。
- npx tsc --noEmit / git diff --check: passed。
- Japanese verifier: files 85 / missing 0 / extra 0 / duplicateIds 0 / mismatches 0。
- Complete Delivery verifier: copied assets 21、20 metadata entries、Continuous 40区間、最小相関0.988671。
- 元英語素材audit最小相関0.983190。English/Japanese21コピーはbyte/hash一致。
- 完成済み通常assetからのContinuous再構築は同じローカル環境でhash一致。
- build済みJSの最小DOM: 新Lesson表示、Start handler6件、MP3 default、通常TrainingとJapanese ended後のEnglish開始を確認。
- preview: Japanese85 MP3はHTTP 200・manifest hash一致、通常asset24 pathはHTTP 200。新Lessonのlesson/continuous/Japanese MP3でRange 206・指定bytes一致。
- HEAD比較: 既存65 manifest entry、既存教材/音声、diagnostic source/assets/metadata、main runtime、player/resolver、Media Session、queue/Resume、sw.jsに変更なし。
