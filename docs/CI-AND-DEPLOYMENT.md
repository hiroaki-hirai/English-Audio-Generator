# CI validation and manual publication (Phase 5B-2C-2B)

## Scope

CI validates code and records a candidate. It never deploys. The separate manual
Pages workflow authenticates/revalidates one candidate, but publication is currently
hard-blocked pending final publication audit and explicit owner approval. Legacy
asset retention and verified packaging are now implemented; see
[retention records and package verification](LEGACY-ASSET-RETENTION.md). No GitHub
settings, pushes, workflow disabling/enabling or deployments were performed here.

## Workflows and permissions

`.github/workflows/ci.yml` runs on push to any branch and on pull_request, with
`contents: read` only. It checks workflow syntax with actionlint 1.7.12, ensures
ffmpeg/ffprobe exist, then runs `npm ci`, `npm test`, `npm run typecheck`,
`npm run web:build`, `npm run verify:built-assets`, `npm run retention:verify`
and `npm run candidate:record`.
No continue-on-error/always bypass is used. Upload happens only after success.
There is no pull_request_target, workflow_run deployment or PR deployment permission.

`.github/workflows/deploy-pages.yml` is manual-only. Preparation requires
workflow_dispatch on main, a full commit SHA matching the dispatched main revision,
a CI run ID and exact `DEPLOY <sha>` confirmation. It uses contents/actions read.
The CI run must belong to this repository and head repository, originate from push
on main, have the expected workflow path/commit, and be completed successfully.

Artifact selection is by that run's exact SHA/run/attempt-derived name and unique
artifact ID. Expired artifacts, invalid expiry, wrong run/commit and ambiguity fail
closed. PR/fork runs cannot be promoted. Input values enter scripts through env,
not interpolated shell/program text. Checkout is fixed to the dispatched commit,
with credential persistence disabled; downloaded candidate data is never executed.

Only the final deploy job has pages/id-token write permissions. It depends on both
successful prepare and retention_gate jobs. The gate calls the trusted checked-out
`assertRetentionReady()` policy, which unconditionally throws. It cannot be opened
by inputs, repository variables, secrets or a CI success. No Pages upload/configure/
deploy step can run in this slice. Removing/replacing this gate requires the next
separately reviewed final audit and explicit approval, not a manual checkbox.

The github-pages environment name remains for future use, but no required reviewer
or plan-specific environment protection is assumed. Repository visibility, plan,
Pages settings and reviewer availability were not checked remotely. Manual dispatch,
exact commit confirmation and the closed code gate do not depend on those features.

## Candidate format and verification

CI uploads `web/dist` as `eag-candidate-<sha>-<runId>-<attempt>` with retention 14 days.
The artifact includes hidden files deliberately because `.vite/manifest.json` is
needed to independently recheck the app dependency graph. No checkout root is uploaded.
The candidate also includes `candidate-provenance.json` with:

- schemaVersion 1 and originating workflow path;
- repository, commitSha, runId, runAttempt, eventName and ref;
- releaseId, workerBuildId, basePath and assetCount;
- sorted full distribution inventory (path, byte size and SHA-256);
- distributionSha256 over `JSON.stringify(files)`.

Provenance excludes itself from its inventory to avoid self-reference. It is
created with exclusive write, never silently overwritten. It is not part of the
222 runtime assets and does not change the Worker or verified manifests. Hashes
alone do not prove CI origin: the GitHub run/artifact checks are also mandatory.

`verify:built-assets` re-derives manifests from the actual output and trusted source
lesson index, including Vite static/dynamic dependencies, HTML/CSS/icon references,
all 60 normal audio/metadata files and all 153 cues. It rebinds the Worker in memory,
compares its exact stamped bytes and both complete manifests, checks counts 20/153/
213/9/222, and verifies both legacy Active Recall signatures. It writes no build data.

`candidate:verify` also recomputes every distribution file and compares the complete
provenance record to independently supplied expected origin. Extra/missing/changed
files, symlinks, case collisions and origin changes fail. It does not trust a
candidate's self-declared SHA/run/release values as the expected values.

Candidate commands require CANDIDATE_REPOSITORY, CANDIDATE_SHA, CANDIDATE_RUN_ID,
CANDIDATE_RUN_ATTEMPT, CANDIDATE_EVENT and CANDIDATE_REF. The root defaults to Vite
output; verification supports `--root <downloaded-directory>`.

Manual preparation downloads only the authenticated artifact, runs npm ci and the
candidate verifier (no rebuild), creates/verifies a separate retained-asset package,
then uploads that package as the exact handoff within the manual run with one-day
retention. The deploy job would revalidate the package again before creating a
Pages artifact, but the unconditional final-audit gate still blocks it.
An unavailable/expired source artifact is a stop condition; do not guess a latest
artifact, download an arbitrary user-selected artifact, or silently rebuild it.
Long-term authoritative published release archives are explicitly deferred.

## Safe transition from the existing production workflow

The repository's currently deployed main still has the old automatic push workflow
until a separately authorized migration is completed. Local YAML edits alone do
not disable it on GitHub. Do not use a production main push as the first experiment.

| Option | Benefit | Limitation |
| --- | --- | --- |
| Validate on a separate branch, then approve merge | Test new CI without a main push | Does not independently disable existing production automation |
| Disable the old workflow on GitHub first | Removes the known old execution path | Requires authorized admin operation; check queued/in-progress runs too |
| Change Pages/environment protection first | Can add a separate publication barrier | Availability/plan/settings must be confirmed; do not assume reviewers exist |

Recommended sequence is option 2 followed by option 1:

1. With separate explicit authorization, an administrator disables the current
   automatic Pages workflow and verifies no queued/in-progress publication can
   complete. Do not assume disabling cancels an already-running deployment.
2. Verify the current published release is preserved. Do not change Pages URL,
   origin, scope or client site data as part of this operation.
3. With authorization, create/push a validation branch containing the complete
   required source/audio changes and these workflow changes. Validate push/PR CI,
   artifacts, permissions and rejection cases remotely; do not dispatch production.
4. Review/approve migration to main. Confirm main now contains only the new CI and
   manual publication workflow, with the unconditional retention gate intact.
5. Re-enable only the intended workflows as appropriate, checking workflow identity
   and state; the replaced deploy workflow may inherit its disabled state.
6. Keep publication blocked pending final audit and explicit approval, including
   remote CI/provenance and retention-package verification. Any environment protection
   is an additional verified control, not a substitute for these steps.

Do not perform any of these remote operations in this slice. The GitHub-only
behavior (event dispatch, repository API metadata, fork permissions, artifact expiry,
environment rules and deployment blocking) remains to be tested during that
separately authorized branch migration.

## Scoped LF checkout policy

Build identities hash the actual distribution bytes. CRLF and LF therefore produce
different releaseId and Worker build ID values even when the text is equivalent.
Git attributes fix LF at checkout for the following narrowly scoped inputs:

- `web/index.html`, the HTML build entry;
- JavaScript, JSON, TXT and webmanifest files under `web/public`, copied into the
  distribution, including metadata, saved hash text and audio provenance;
- the twelve individually listed, audited ETCL training scripts, whose current
  Source Hash values depend on their LF bytes.

At this revision the new rules cover 59 tracked files: one HTML entry, 46 public
text files and twelve ETCL inputs. The existing LF rule for the Complete Delivery
training script remains separate. Generated lesson indexes, audio asset lists and
verified manifests already serialize with LF; the build and hash algorithms are
unchanged. Do not add ignored build output to Git to enforce this policy.

`text eol=lf` takes precedence over Windows `core.autocrlf=true` for these paths.
Git blobs and working-tree bytes are different concepts: these tracked blobs
already use LF, while a Windows checkout may contain CRLF. Adding attributes does
not rewrite an existing working tree. Do not force-refresh the current checkout or
run a repository-wide renormalization; validate with a new isolated checkout.

Preserve all existing MP3, PNG, lesson-input and saved-hash Git blobs. Saved hash
values must remain identical; the line terminator of a public hash text file may
become LF in a new checkout. Do not regenerate audio, lessons or Source Hash files.
The seven historical source exceptions (basic-delivery, cash-payment,
change-handling, giving-directions, order-verification, pin-verification and
restaurant-delay) receive no new input attributes. Their pinned audit cases and
hash calculation remain unchanged. Binary files are outside the text patterns;
`retained-assets/** -text` continues to preserve observed bytes and integrity
records exactly, including retained HTML, CSS, JavaScript and JSON.

### Clean-checkout validation

Use isolated Windows and Ubuntu checkouts of the same revision and the same
attribute rules, lockfile, Node and npm versions. On Windows explicitly test with
`core.autocrlf=true`. Before the policy is committed, a checkout of HEAD alone does
not include it: copy the proposed complete attributes to the isolated repository's
`.git/info/attributes` before its initial checkout, and copy the proposed
`.gitattributes` and this document into that checkout afterwards. This local
override is a test fixture only, never an authenticated CI artifact or a commit.
After a separately approved commit, repeat using ordinary clean checkouts without
the override to verify the committed policy itself.

1. Check `git check-attr text eol` for all 59 new targets and the existing Complete
   Delivery rule. Confirm LF bytes, binary exclusions, unchanged retained bytes and
   no new attributes on the seven historical source inputs.
2. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run web:build`,
   `npm run verify:built-assets` and `npm run retention:verify`. Never substitute
   `build:training`, an audio builder or TTS. Check workflow syntax with actionlint.
3. Require at least 149 passing tests, 222 verified runtime assets, seven pinned
   historical Source Hash cases and thirteen current matches. Preserve Active
   Recall signatures `fnv1a32:85:32bf4dac` and `fnv1a32:85:a7bb76ae`.
4. Compare complete output inventories by relative path, size and SHA-256 across
   both operating systems. Both verified manifests, the bound Worker, releaseId and
   Worker build ID must match. Validate run-specific candidate provenance separately
   because its run ID and other origin fields legitimately differ. Repeated builds
   in each isolated environment must also match; a prior build ID is evidence, not
   an assumed expected value for a new build.
5. Confirm protected Git blobs, including all retained resources, are unchanged.
   Only the two approved policy/document files may differ from the source revision.
   Keep the unconditional publication gate blocked. Remote CI validation, pushes
   and publication each remain subject to their separate approval boundaries.

An unavailable Ubuntu environment is an explicit unverified result, not a claim
of cross-platform reproducibility. Do not promote a local fixture to a CI artifact.

## Local verification and next boundary

Tests use a real isolated Vite build and corrupt/remove files to prove rejection,
check cross-commit/run/attempt provenance, failed/cancelled/PR workflow runs and
expired/wrong/ambiguous artifacts, and assert trigger/permission/gate separation.
Actionlint validates the YAML and GitHub expression schema; local runs do not
execute GitHub Actions jobs or mutate account settings.

Retained hashed asset packaging is now implemented and locally tested. It keeps
a single authenticated candidate unchanged, adds verified old resources, and
revalidates the complete merged inventory. Git snapshots preserve old resources
without artifact expiry. No gate bypass or full published-release archive is
implemented. Final audit and explicit approval must precede any gate change.
