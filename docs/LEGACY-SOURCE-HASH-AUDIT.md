# Legacy Source Hash investigation (Phase 5B-2C-4)

## Decision and evidence boundary

All seven legacy mismatches are reproducible historical domain-only edits (class A),
not newly discovered audio-content changes (class C) or publication failures (class B).
Keep the MP3s, metadata, JSON and saved hashes unchanged. Production remains HOLD
for the separate GitHub migration, final approval and device validation.

At c1c819d630a62e79324aa6c66f7ad0cd540f5a2f, each of the seven scripts gained one
line: domain delivery (six) or everyday (Giving Directions). Exact HEAD LF bytes
are the previous Git blob plus that line; phrase strings/order/spacing did not change.
Their lesson.mp3, continuous-training.mp3 and metadata.json Git blobs are unchanged
between their last saved-hash commit and HEAD (21/21). This rules out a new script/audio
mismatch caused by the domain edit. It is not a fresh spoken-word/ASR audit.

The saved hashes reproduce with the same config and algorithm: historical CRLF
script bytes for six lessons, historical LF bytes for Giving Directions. Git stores
LF blobs, not the original generator working tree. Matching the CRLF reconstruction
is evidence of the exact preimage; it does not independently prove which machine,
OS or checkout settings originally ran the generator.

## Exact calculation

SHA256(UTF8(JSON.stringify(config)) + byte 0A + script bytes). SHA output is lowercase
hex. Scripts are raw bytes: no parsing, sorting, BOM removal, whitespace or newline
normalization by the general function. The separator is always LF, including when
the script itself is CRLF. The saved hash file is read with trim().

Current config serialization, in insertion order, is:

```json
{"repeatCount":2,"repetitionIntervalSeconds":1,"recallIntervalSeconds":5,"sampleRate":24000,"codec":"libmp3lame","loudnessNormalization":{"integratedLoudness":-16,"loudnessRange":7,"truePeak":-1.5}}
```

No config value or property-order change exists after its introduction at a3067c2.
All 20 working-tree scripts are UTF-8 without BOM, use two-space formatting and end
with a newline. Seven legacy scripts are CRLF here; Complete Delivery and ETCL12
are LF. HEAD blobs of the old scripts are LF. JSON property order and every whitespace
byte affect the hash. No reserialization is used in the reproduction.
The seven current top-level property orders are id, domain, scenario, scenarioJa,
phrases; their historical blobs have the same order with domain absent. Phrase
objects retain en then ja. The final newline is CRLF for the seven current Windows
files and LF in their Git blobs. All historical blobs used here also lack a UTF-8
BOM and end with LF; CRLF reconstruction preserves the final newline and spacing.

Complete Delivery is the explicit pre-existing exception to raw byte calculation:
build-training-audio calls canonicalCompleteDeliverySource(), replacing CRLF with
LF in memory. ETCL uses original raw JSON, including its original everyday domain;
the index-only etcl classification is never fed into source-hash calculation.

## Git history

| Commit | Change |
| --- | --- |
| 234ac67 | Introduced incremental hashing: SHA256(raw JSON bytes) |
| 1d08a713b27eb2e4ee0814c912cc67c0f6f8b194 | Changed to SHA256("2" + LF + raw JSON), audioBuildVersion 2 |
| a3067c22e4ff3ccf3d9f6f87d866a5533346136d | Introduced current config+LF+bytes algorithm and config, saved six legacy hashes |
| 7b74720f4ef8fc6082331e98e3eabc600294aabe | Added Giving Directions and its saved hash with the same config/algorithm |
| c1c819d630a62e79324aa6c66f7ad0cd540f5a2f | Added domain lines to all seven scripts without updating stored hashes |
| 811d93d1df635317981e9ef1b04661711ecbb10f | Added Complete Delivery with canonical LF source handling |

The current algorithm was used for all seven saved values; the earlier raw/version-2
algorithms are historical context, not alternative formulas chosen to force a match.

## Seven-case reproduction table

Current means this Windows working tree's exact CRLF bytes; HEAD means the exact
LF Git blob at 811d93d1. Every saved value below matches its recorded historical
script bytes under the current, historically present config.

| Lesson | Saved SHA-256 | Current raw SHA-256 | HEAD SHA-256 |
| --- | --- | --- | --- |
| basic-delivery | 5323da87641dcce04a2c54cc2531262afd1f07ce2873c5af18796ecd6d92fea3 | 48dd34c464ed2162f11163a30f81a69c1bf303843c25e513d33637f15b9141e6 | 3b4ffdf0eabaeb2fc110d81013ec4e5d534261a0b927f3e516dc87f261e2ff15 |
| cash-payment | 936868d046b0d4feba3a5960d099f744c7c232c3252942387433233ff4bd6ec2 | 84dd9fa8de17e3146452ab7df66b0f871fdd414d36696524877664d8164c814e | 5417cb414f94edf089c2d9314b8e6ab3d82c33c4377265bddb9b77a1d01f141c |
| change-handling | 63796c231617e4c1292380550605bd455bafd875a3195be40f697df3bf60e171 | 4aae33ee5de3553b8dfb12ba1e6f75f71674e4ff35302aa1fbe9807efa12ecb6 | da14c48e7a89074cd15c510357be81ff3e87d10a6f24f2c42cec37ff3500f15c |
| giving-directions | 35deacd84c8eb4425f3f4265c4693c2ac2eb7ca296151f60df48fc31f43c12ee | 1293e133b07426fa5340ef59e4379795594d6e5965ccae53c9acd48c7fd98618 | ee0a0b53baf14512782ffe6dab55f690f899d01d5664a5516515b2d96a3fbbb5 |
| order-verification | 92b9b0b864b32b7d6ceb0f478d82cf67f8fae8ddce08cd1857e9be8319ce4a98 | 60115cc887dbf138c71dd615d4dbb52074c82799e5aaa9f9645d34a88624a7a2 | 70c3e9b4e70e4bf27be707f735c471470ff6aacb974a39fe3d25cad12c646615 |
| pin-verification | a6be3bb75ddc952e6156f32b62bea70ca00f346b6d845110d5d4e421b4005803 | c7d0c1b70f7fd9a6ddb39a9770fcbf961d67e88530f3bad5e9f5ff6bb4af37d1 | e7147f8595ac3bd841f3152ac2c36b80fcf9690d50586794cbd94771a398ab1d |
| restaurant-delay | 91342a9dbbe340204d48f8ff6d2338ba462c6949fb5767f8743b4f461a36a368 | 9edd02f4c93761b492b37557677408b1d56ca97edc1af20b4d8b2c3d542cfda8 | f592579b4a18ba51b691ec0993b9818781d42426a8e215ad1e741ddaec5e7ff0 |

| Lesson | HEAD JSON Git blob SHA-1 | Historical JSON Git blob SHA-1 | Last saved-hash commit | Reproducing EOL |
| --- | --- | --- | --- | --- |
| basic-delivery | b5c6daa40948a298f900c7de6309a08bb4cd7141 | b35203e500e66aea57ec24abef2b8aa7117d793d | a3067c22e4ff3ccf3d9f6f87d866a5533346136d | CRLF |
| cash-payment | 030f88c0ab0089fd2225828978d4eb1966804172 | f1139276426969433f561b06cf8dafe987e22c30 | a3067c22e4ff3ccf3d9f6f87d866a5533346136d | CRLF |
| change-handling | eade92ad51e2a87615f3430c46df2fc5a9f821d7 | b502eee45a5b00d0077c761f4f0ae45222e12aa0 | a3067c22e4ff3ccf3d9f6f87d866a5533346136d | CRLF |
| giving-directions | 8eff0fb334ed69263c8e1fd5e69114ede267e20b | 6da0aff6439dbfd42c888de49487c5ad22636d59 | 7b74720f4ef8fc6082331e98e3eabc600294aabe | LF |
| order-verification | e4e8b9d451f354cb9aae469d56e25c80e25bb265 | 45821e20431bb346d4a9f11d87fba1e46d342267 | a3067c22e4ff3ccf3d9f6f87d866a5533346136d | CRLF |
| pin-verification | e41717fd8e0f973122f63a13af47ede5a712c790 | 0222c004d28b76dca5b550232289d635db06502e | a3067c22e4ff3ccf3d9f6f87d866a5533346136d | CRLF |
| restaurant-delay | 08c716c6677812f16e2179a89d199524f681b0c1 | 86cf978f1577b7b36c32eee253b7b24b98383b25 | a3067c22e4ff3ccf3d9f6f87d866a5533346136d | CRLF |

Common cause: domain addition, with additional working-tree/HEAD EOL differences.
Common publication impact: none on playback or verified asset integrity. Recommended
handling: retain assets/saved hashes and accept only the fixed historical audit cases.
All seven causes are established at this level; original generation-machine details
remain unknown. No guessed config combinations or changed input files were used.

## Full 20-lesson results

| Lesson | Saved SHA-256 | Exact current calculation | Policy result |
| --- | --- | --- | --- |
| basic-delivery | 5323da87641dcce04a2c54cc2531262afd1f07ce2873c5af18796ecd6d92fea3 | 48dd34c464ed2162f11163a30f81a69c1bf303843c25e513d33637f15b9141e6 | PINNED HISTORICAL CASE |
| cash-payment | 936868d046b0d4feba3a5960d099f744c7c232c3252942387433233ff4bd6ec2 | 84dd9fa8de17e3146452ab7df66b0f871fdd414d36696524877664d8164c814e | PINNED HISTORICAL CASE |
| change-handling | 63796c231617e4c1292380550605bd455bafd875a3195be40f697df3bf60e171 | 4aae33ee5de3553b8dfb12ba1e6f75f71674e4ff35302aa1fbe9807efa12ecb6 | PINNED HISTORICAL CASE |
| complete-delivery | b8de512ba98233f2914f4bbb80c6b54c3a3c94b5b7f24dbfd3f9cfaff90b54ac | b8de512ba98233f2914f4bbb80c6b54c3a3c94b5b7f24dbfd3f9cfaff90b54ac | MATCH |
| etcl-01-talking-about-my-job | 50e0b3e74c7af18f6dc015141e740ab4f336f37b6e02f605c6e693b4ef124b83 | 50e0b3e74c7af18f6dc015141e740ab4f336f37b6e02f605c6e693b4ef124b83 | MATCH |
| etcl-02-daily-routine | 11b86445b9b11fff42b08543d92c9a24afafe2f4e4fb3c1021ce33744bac447a | 11b86445b9b11fff42b08543d92c9a24afafe2f4e4fb3c1021ce33744bac447a | MATCH |
| etcl-03-recent-events | 35ef544a4913dfdefff0212f289a10f9325fcab659f5febf3b634e2d737bb4a2 | 35ef544a4913dfdefff0212f289a10f9325fcab659f5febf3b634e2d737bb4a2 | MATCH |
| etcl-04-current-situation | 60bbc486abf0b759ff8dae160f9fa4bf3324aeb69dd2321fe5f213442a8f6360 | 60bbc486abf0b759ff8dae160f9fa4bf3324aeb69dd2321fe5f213442a8f6360 | MATCH |
| etcl-05-reasons-and-decisions | 9e4cd4dd4f7d9ecaa65ece79f4a4ed0f6d926935cab9554d45192836ec9d1728 | 9e4cd4dd4f7d9ecaa65ece79f4a4ed0f6d926935cab9554d45192836ec9d1728 | MATCH |
| etcl-06-preferences-and-priorities | cf8487dac1f8a2d5faa299cd3e742b6627d528de4f6a70ebe9be90d8b67c587f | cf8487dac1f8a2d5faa299cd3e742b6627d528de4f6a70ebe9be90d8b67c587f | MATCH |
| etcl-07-asking-questions | 679ce8577dd8064ceb150ddd34bf3e341b19115494f999fd6bc28dacc8b066ef | 679ce8577dd8064ceb150ddd34bf3e341b19115494f999fd6bc28dacc8b066ef | MATCH |
| etcl-08-responding-naturally | e6e68e1e3158baad1bb2a65f0639d68d88f0f7e85133ef898d4b3acdfa375b05 | e6e68e1e3158baad1bb2a65f0639d68d88f0f7e85133ef898d4b3acdfa375b05 | MATCH |
| etcl-09-past-experiences | 09d3626e301b3bd66d932fe527bae55bdc530c0ee7f832f35721bd512b23531f | 09d3626e301b3bd66d932fe527bae55bdc530c0ee7f832f35721bd512b23531f | MATCH |
| etcl-10-explaining-problems | f6f41ce459c7b97d75eabc3845360c45137af8325270b1c9f2f0b73c4c5acf98 | f6f41ce459c7b97d75eabc3845360c45137af8325270b1c9f2f0b73c4c5acf98 | MATCH |
| etcl-11-plans-and-possibilities | 27daf84628b79ae2e060f367519781dce14456f834857303ab64747c6b66a200 | 27daf84628b79ae2e060f367519781dce14456f834857303ab64747c6b66a200 | MATCH |
| etcl-12-expressing-opinions | 6d89986109963b0b093f9e23b0cd8f4a03feda20613b1d0a218f374ae61430a5 | 6d89986109963b0b093f9e23b0cd8f4a03feda20613b1d0a218f374ae61430a5 | MATCH |
| giving-directions | 35deacd84c8eb4425f3f4265c4693c2ac2eb7ca296151f60df48fc31f43c12ee | 1293e133b07426fa5340ef59e4379795594d6e5965ccae53c9acd48c7fd98618 | PINNED HISTORICAL CASE |
| order-verification | 92b9b0b864b32b7d6ceb0f478d82cf67f8fae8ddce08cd1857e9be8319ce4a98 | 60115cc887dbf138c71dd615d4dbb52074c82799e5aaa9f9645d34a88624a7a2 | PINNED HISTORICAL CASE |
| pin-verification | a6be3bb75ddc952e6156f32b62bea70ca00f346b6d845110d5d4e421b4005803 | c7d0c1b70f7fd9a6ddb39a9770fcbf961d67e88530f3bad5e9f5ff6bb4af37d1 | PINNED HISTORICAL CASE |
| restaurant-delay | 91342a9dbbe340204d48f8ff6d2338ba462c6949fb5767f8743b4f461a36a368 | 9edd02f4c93761b492b37557677408b1d56ca97edc1af20b4d8b2c3d542cfda8 | PINNED HISTORICAL CASE |

## Reproduction and bounded test policy

The audit-only src/legacy-source-hash.test.ts pins each of the seven IDs, saved
SHA-256 values, HEAD source Git blob and historical source Git blob. In memory it
normalizes working-tree CRLF to LF, verifies the exact HEAD blob identity, removes
only the documented domain line, verifies the historical blob identity, restores
the recorded LF/CRLF representation, and recalculates the original saved hash.
No input file is changed. It runs without Git history in CI's shallow checkout.

Any changed phrase, property, whitespace or saved hash rejects the historical
exception. New IDs get no exemption. All other 13 lessons must match the current
algorithm (with existing Complete Delivery canonicalization). Config changes also
invalidate the historical reproduction. This policy does not change generation,
Worker behavior, manifests, workflows or publication gates.

Reproduce the test with:

```text
node --import tsx --test src/legacy-source-hash.test.ts
```

Independent history investigation (read-only) uses git show <commit>:<path>,
git rev-parse <commit>:<path> and git log -- <path>. Read historical JSON as Buffer,
not JSON.stringify(JSON.parse(bytes)). Calculate both Git LF and CRLF checkout
representations in memory; compare phrases and exact domain-only diff separately.

## Effects by execution path

| Path | Effect |
| --- | --- |
| web:build | Does not run audio generation or compare legacy saved hashes; unchanged assets are copied and independently hashed |
| CI | Existing checks succeed; new test requires exact fixed historical evidence or a matching current hash, never generic mismatch acceptance |
| Verified manifests | Exclude source-hash.txt from the 222 runtime entries; verify actual MP3/metadata sizes and SHA-256 |
| Worker install/migration | Verify manifest assets, not generator source hashes; unaffected |
| Normal playback/Active Recall | Do not read source-hash.txt; phrases, timing, library signatures and storage keys unchanged |
| Future build:training | Compares current bytes/config with stored hashes; the seven would be regenerated, potentially invoking paid TTS and replacing assets. Windows/Linux EOL differences matter. Do not run it for publication |

Do not rewrite saved hashes just to make comparisons green: that would conceal
historical provenance and alter regeneration decisions. A future intentional audio
regeneration needs separate authorization and source/config/asset auditing.
