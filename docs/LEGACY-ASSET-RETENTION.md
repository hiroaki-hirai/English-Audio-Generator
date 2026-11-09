# Legacy asset retention and release packaging (Phase 5B-2C-2C)

## Publication remains blocked

The local release-gate implementation now makes `assertRetentionReady()` conditional
on explicit approval, live Actions authority, verified package identity and retrieved
fixed archive evidence. Missing records still block publication. There is no actual
APPROVED record here; the workflow remains Disabled and production stays BLOCKED.
Neither CI success nor package verification alone authorizes deployment. No remote
settings, archive uploads, Releases/tags or publication were changed by this work.

## Initial source and assurance

Site: https://hiroaki-hirai.github.io/English-Audio-Generator/

The owner identifies published commit
`811d93d1df635317981e9ef1b04661711ecbb10f`. The GitHub connector found successful
main push deployment run `37218163285` for that commit. Its artifact list was empty;
the repository release list was also empty on 2026-11-07. Accordingly, acquisition
used the live Pages HTML and its actual dependencies, not a reconstructed build.

The snapshot explicitly says `live-observation-not-independent-build-proof`.
Commit association is supported by the owner's statement and successful run;
byte identity with an independent original build cannot be proved. HTTP 200 alone
is not treated as proof: exact bytes, MIME, HTML references and the static graph
are checked. Any unavailable dependency stops acquisition without a substitute.

Observed 2026-11-07 11:35:47 UTC:

| Path | Status / Content-Type | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| assets/index-CC9-Lhxx.css | 200 / text/css; charset=utf-8 | 3666 | 3705f9759aa6974afb1892bc1e4e13f733e7e0dd66aa64d6bc837a3cdc93c802 |
| assets/index-CHF6roX8.js | 200 / application/javascript; charset=utf-8 | 42231 | fd7801ca2a7beebb4e75db78bdb506e3b915d7d4a4517696aba3d57b7caecef6 |

Total: 2 public resources, 45,897 bytes; no further static dependency was found.
HTML evidence is 921 bytes, SHA-256
`6df99756188ddfa0a66b8dd42b43ed907048cb33fdd44027328f9f8d042018e0`.
Each record also contains the full URL, source, individual timestamp, supplied
commit, verification method and dependencies. HTML is evidence only: it is never
copied over the new package's index.html.

## Storage and trust

`retained-assets/catalog.json` pins SHA-256 of immutable generation records.
`releases/<commit>/record.json` is schemaVersion 1 with site, commitSha, assurance,
acquisitionEvidence, html, roots and sorted assets. `evidence/index.html` and
`files/<public-relative-path>` preserve exact response bytes. `.gitattributes`
disables text conversion for the complete store.

| Storage option | Assessment |
| --- | --- |
| Git-managed snapshots | Chosen: small initial size, reviewable hashes and provenance, same trusted checkout as policy, available without expired artifacts |
| Actions artifact only | Unsuitable for long-term retention: expiry and deletion |
| Fixed full-package archive | Release assets plus persistent local copy are now supported; no production archive has been uploaded by this local implementation |

The existing retention store is Git-managed. Hashes detect accidental
or isolated tampering, not malicious replacement of both data and the trusted
catalog. Repository review and authenticated CI origin remain trust requirements.

Only same-site paths below assets/, images/, fonts/ and icons/ are allowed, with
an explicit static extension allowlist. Root HTML, Workers, manifests and audio
cannot be retained as replacement files. Unsafe/encoded paths, external URLs,
symlinks, case collisions, duplicates and unknown extra resource files are rejected.
JavaScript dependencies are parsed using Vite's existing Rolldown parser (no asset
execution or new dependency); imports, literal dynamic imports, import.meta.url
resources and Vite asset maps are followed. CSS url()/@import references are
followed. Data URLs/fragments need no file. Computed imports/URLs require manual
review instead of guessed filenames. Acquisition accepts only full nonopaque 200
responses with expected MIME. Redirects are refused. No arbitrary site option exists.

## Candidate to package

1. Authenticate the successful main push CI run and exact nonexpired artifact via
   GitHub API policy, then download only its immutable artifact ID.
2. `candidate:verify` rechecks independent expected repository/SHA/run/attempt/ref,
   complete inventory, all 222 runtime entries, Worker build ID and releaseId.
3. `package:create -- --input <candidate> --output <fresh-directory>` verifies the
   trusted retention catalog, record hashes, bytes and dependency closure.
4. Preflight all collisions before creating output. An identical path/size/SHA is
   accepted as IDENTICAL. Different bytes or case spelling stop the operation.
5. Copy candidate bytes unchanged and add only missing retained resources with
   exclusive creation. No overwrite, rebuild, old-root replacement or deletion.
6. Write `retained-assets.json` (registry digest, generations, full retained
   provenance, IDENTICAL/ADDED disposition, nextPublication graph).
7. Write `publish-package.json` (original candidate record/digest, retention digest,
   sorted full package inventory and deterministic packageId). The package record
   excludes itself from its inventory; provenance is included explicitly.
8. `package:verify -- --root <package>` rechecks the original candidate subset,
   trusted retention store, complete merged inventory and unchanged 222 manifests
   and Worker. It rejects missing/extra/modified files and wrong origin.

Origin environment variables are the same six CANDIDATE_* variables documented in
[CI and deployment](CI-AND-DEPLOYMENT.md). Never infer expected origin from the
candidate itself. Local tests use a clearly artificial origin; they do not establish
that a real GitHub CI artifact has been obtained or authorized for deployment.

The current CSS is IDENTICAL, so only the old JS adds bytes: 42,231. The local
integration fixture verifies a 276-file package, including provenance/package
records. Runtime manifests remain 213 audio + 9 app entries. No old root file is
merged and release/build IDs are unchanged. Package metadata is outside the
runtime manifest; no recursive hashing or Worker self-reference is introduced.

The manual release workflow prepares/verifies this package without rebuilding,
archives it in dedicated GitHub Release assets, retrieves it and package-verifies
it before a conditional gate can pass. Its archive/proof/checksum handoff has 90-day
Actions retention, but durable custody uses Release assets plus a persistent local
copy. The deploy job repeats live authorization and remote retrieval/verification.
The absence of real approval currently prevents reaching these operations.

## Fixed archive and local custody

`pages-release-package.cjs` uses a deterministic JSON data archive with sorted
path/size/SHA256/base64 entries. This avoids OS-specific tar timestamps and archive
link/path traversal behavior, without adding a dependency. A bounded decoder rejects
unknown fields, unsafe/reserved paths, symlinks, duplicates/case collisions, invalid
base64, size/hash mismatches and excessive input. It validates entries before writing,
extracts only into a new directory and never executes archived code.

All 276 package files are preserved, including runtime manifests, provenance,
retention ledger and `publish-package.json`. `package.eag.json.sha256` is an independent
transport checksum, not permission to publish. The package manifest has a separate
approved raw SHA and package ID; the full existing package verifier is still required.
The archive envelope additionally binds repository/source SHA/main CI run/attempt
and the fixed original artifact ID. Recovery matches this immutable source record
against its approval and live original CI, even when the CI artifact has expired.

Release preparation, which alone receives contents-write permission, creates a new
prerelease archive Release/tag per workflow run/attempt. It never overwrites or deletes
assets. Saving both assets, retrieving them by ID, matching the approved/checksum SHA
and verifying the unpacked package must all succeed before Pages upload. Each deploy
job repeats retrieval from GitHub Releases rather than trusting only the handoff proof.
Missing/deleted/changed archives fail closed. Releases are not assumed administratively
immutable: independent hashes and fixed asset IDs detect replacement.

Before approving a release, the operator uses the local helper to save a persistent
archive copy, reread it, match its hash and verify the extracted package. The resulting
local-copy receipt precedes approval and is bound into the approval JSON by canonical
SHA256. This is an operator-attested local backup; Actions cannot remotely prove the
user's disk still exists. The 90-day workflow artifact is another copy, not the durable
backup policy. Keep the Release asset IDs, independent SHA, approved package snapshot,
source main CI run/artifact metadata, approval record and deployment receipt with the
persistent local archive. Exclude profiles, TLS material, `.env` and raw diagnostic
workspaces: only the verified package file set belongs in the archive.

The existing `retention:capture` helper captures HTML evidence and JS/CSS/static
dependency closure only. It is not a complete old-site backup and must not be
described as one. The preserved old-v8 fixture also has historical observation
limits. Any prepublication full production snapshot needs its own complete file
inventory/HTTP evidence and preservation; it is not silently manufactured here.

## Recovery after the verified Worker is deployed

Recovery is a separate manual action and approval, with pinned existing archive and
checksum asset IDs and exact `RECOVER <targetSha> <archiveSha256>` confirmation.
The recovery preparation job is read-only to repository contents and never uploads,
rebuilds or chooses a latest asset. It reauthenticates the original successful main
push CI run; an expired original Actions artifact does not prevent recovery from the
separately approved fixed archive. Release mode still rejects expired CI artifacts.

Recovery must match the currently committed L-2 payload baseline and retained graph.
It is useful for redistributing a known package after delivery problems, not for
repairing a bug inherent in that same package. A behavioral correction needs a new
reviewed forward release. An old UI or a future incompatible generation needs its
own compatibility review/baseline; no arbitrary historical replay is permitted.

Do not deploy the old-v8 Worker from commit
`811d93d1df635317981e9ef1b04661711ecbb10f` as an automatic rollback: its install uses
skipWaiting and activate deletes other cache generations and claims clients. Keep the
verified Worker lifecycle and old hashed resources instead. Do not clear learning
progress/cache, unregister the SW or require PWA reinstallation as routine recovery.
Pages returns to an approved consistent package as a whole; clients close naturally.
See [the operational approval and workflow sequence](CI-AND-DEPLOYMENT.md).

## Future accumulation

`retained-assets.json.nextPublication` enumerates the new root graph with commit,
release/build IDs and hashes, but is marked `PENDING_NOT_PUBLISHED`. A candidate
must never be recorded as a successful release merely because packaging succeeded.

After a separately approved successful deployment and HTTP verification:

1. Capture the fixed live site into a fresh store:
   `npm run retention:capture -- --commit <published-sha> --output <fresh-store>`.
   Confirm operator-supplied commit association against the actual deployment.
   Compare its resources with the verified package and retain publication evidence.
2. Merge without overwriting either source:
   `npm run retention:merge -- --output <fresh-merged-store> retained-assets <fresh-store>`.
3. Review all generations/hashes, including previous snapshots, then separately
   authorize replacing the registry with that verified superset in Git. The merge
   command never replaces it automatically. New record locations are deterministic
   `snapshots/<record-sha>/...`; exact records/evidence/bytes are preserved.
4. Repeat for each release, never automatically deleting older resources. New
   package creation verifies every retained generation and reports cumulative size.
   A changed retention registry/payload also needs an explicitly reviewed release
   baseline; do not edit the approval record to bypass the old baseline.

Same path with changed bytes is always a stop condition. Storage grows by unique
public resources plus generation evidence/records (snapshots may duplicate identical
bytes). No generation expiry or automatic cleanup is implemented. Full-package
archive support is described above; actual storage, operator custody and publication
still need explicit authorization. The Git snapshot registry independently removes
dependence on Actions artifact retention for the retained legacy static files.

## Validation boundary

Tests cover dependency extraction, unsafe/external references, missing/404/206/MIME
failures, record/file tampering, identical/different collisions, deterministic merge
and packaging, accumulated generations, provenance mismatch, unchanged 222 entries
and build IDs. The added gate/archive tests use synthetic approval/API/data only;
existing audio, Chrome and L-2 trials are not repeated. Local validation does not
execute GitHub jobs, save actual release archives, deploy Pages or test iPhone Safari.
Real API permissions/storage and final main artifact checks remain an explicitly
authorized operational boundary. Keep the old workflow Disabled during migration.
