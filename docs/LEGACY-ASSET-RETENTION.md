# Legacy asset retention and release packaging (Phase 5B-2C-2C)

## Publication remains blocked

This slice creates and verifies packages, not releases. `assertRetentionReady()`
still throws unconditionally. Neither a successful CI run nor a valid package
authorizes deployment. Final audit, explicit owner approval and a separately
reviewed gate change are required. No remote settings or publication are changed.

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
| Independent release/archive storage | Useful for larger future releases, but requires separate availability, access and integrity policy; not created here |

These files are currently untracked because staging/commit is forbidden in this
slice. Future authorized commits must include the store. Hashes detect accidental
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

The manual workflow prepares/verifies this merged package without rebuilding,
uploads it as the one-day handoff, and the final job would verify it again.
The intervening unconditional publication gate still prevents that job running.

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

Same path with changed bytes is always a stop condition. Storage grows by unique
public resources plus generation evidence/records (snapshots may duplicate identical
bytes). No generation expiry or automatic cleanup is implemented. Long-term full
published-package archives remain a separate operational decision; the Git snapshot
registry already removes dependence on Actions artifact retention for legacy files.

## Validation boundary

Tests cover dependency extraction, unsafe/external references, missing/404/206/MIME
failures, record/file tampering, identical/different collisions, deterministic merge
and packaging, accumulated generations, provenance mismatch, unchanged 222 entries
and build IDs, and the hard gate. Existing Active Recall and actual Worker VM tests
run unchanged. Local validation does not execute GitHub jobs, deploy Pages or test
iPhone Safari. Final publication audit must verify those separately and follow the
safe old-workflow disabling/branch-CI migration procedure before any production push.
