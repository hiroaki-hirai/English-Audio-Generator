# CI validation and explicitly approved publication

## Current boundary

This is a local implementation, not release authorization. The production workflow
remains Disabled. No real APPROVED record exists in this repository. The committed
`approval.template.json` is DRAFT, expired and contains placeholders; it is rejected.
No production archive, Release, tag, Pages deployment or repository setting has
been created or changed. The production publication gate remains **BLOCKED**.

The previous unconditional `assertRetentionReady()` exception is replaced with a
conditional, fail-closed policy. Calling it without approval and verified evidence
still throws `DEPLOYMENT BLOCKED`. Package integrity alone does not grant approval:
the existing package verifier deliberately still returns `publicationAllowed:false`.

## Validation remains separate

`.github/workflows/ci.yml` is unchanged. Push/PR CI has `contents:read`, no Pages or
OIDC write permission, and never deploys. It validates workflows, tests, types,
build output and retention, then records candidate provenance. Candidate artifacts
are named `eag-candidate-<sha>-<runId>-<attempt>` and retained for 14 days.

The candidate verifier authenticates independently supplied repository, SHA, run,
attempt, event and ref; recomputes all distribution entries; rebinds the Worker;
checks both runtime manifests, 222 assets and the two legacy Active Recall signatures
`fnv1a32:85:32bf4dac` / `fnv1a32:85:a7bb76ae`. The package verifier also checks the
retention registry, old resource closure, collision rules and exact package inventory.
Publication never rebuilds a downloaded candidate or executes its assets.

## L-2 identity and commit changes

`.github/release/etcl12-l2-baseline.json` records the existing PASS evidence and the
12 lessons / 68 phrases / 92 MP3 identity. It is a validation baseline, **not approval**.
Its SHA is SHA256 of `JSON.stringify(parsedBaseline)`, independent of checkout EOL.

The existing CI candidate has 273 files including provenance. The retained publish
package has 276 files; the runtime manifests contain 213 audio + 9 app assets. The
gate checks these existing package bytes without rerunning audio or L-2 tests.

`payloadSha256` hashes the sorted path/size/SHA256 inventory of every package file
except these three origin-bearing records:

- `candidate-provenance.json`;
- `retained-assets.json`;
- `publish-package.json` (the release/package manifest).

Changing gate code or docs changes the commit and main CI provenance legitimately.
All other package bytes must remain equal to the L-2 baseline, including both raw
runtime manifests, SW, HTML/JS/CSS, metadata, MP3 and retained old assets. The three
excluded records are not unchecked: the full package verifier validates their origin,
graphs and contents, and approval pins the final package ID, raw package-manifest
SHA and retention-manifest SHA. The archive SHA covers all 276 files including them.
Do not reuse a validation-branch provenance record as a main record.

## Approval record and Actions authority

The closed JSON schema and DRAFT template are under `.github/release/`. No new
schema library is required. The runtime validator implements the schema's small
keyword set and rejects unknown fields, missing fields and unsupported keywords.

The authorized operator supplies an actual record as the `approval_json` dispatch
input; records are not committed with their own future commit SHA (which would be
self-referential). Its `executionSha` fixes the reviewed main workflow revision;
`targetSha`, CI run/attempt and artifact ID fix the package source. Approval includes
an approver, UTC approval/expiry dates, baseline SHA, exact package snapshot, archive
SHA, and a separately verified persistent local-copy receipt and its canonical SHA.

JSON alone is insufficient. Prepare and deploy both retrieve live GitHub metadata:

- event must be `workflow_dispatch`, ref main, workflow path this repository's
  `deploy-pages.yml@refs/heads/main`, workflow SHA the dispatched SHA;
- dispatched SHA must still equal live main and `executionSha`;
- the triggering actor (including reruns) must be the named approver, and both
  permission checks must return write/maintain/admin;
- original CI must be this repository's successful main **push** run of `ci.yml`,
  with exact source SHA, run ID and attempt;
- release mode additionally authenticates the exact live, unexpired artifact ID,
  expected name, run and SHA; PR/fork/failed/ambiguous/expired inputs are rejected.

An approval record has no secrets. Do not put tokens, certificates, profile data or
logs in it. The persistent local receipt is a fact attested by the dispatching user;
Actions cannot inspect the user's disk. The helper produces it only after writing,
rereading, hashing and verifying the local package. It does not guarantee future
disk availability; the operator must retain the copy.

## Manual release path

`deploy-pages.yml` has only `workflow_dispatch` and a single `pages` concurrency
group with no cancellation. Inputs are passed as environment data, never executable
interpolation. No continue-on-error/always deployment bypass exists.

1. `release_prepare` authenticates approval and source artifact, downloads only its
   immutable ID, then runs existing candidate/package verification and packaging.
2. It verifies the final package against approval and the L-2 baseline, creates a
   deterministic data-only archive and checks its preapproved SHA.
3. Only this job has `contents:write`: it creates a dedicated prerelease archive
   Release/tag `eag-archive-<workflowRun>-<attempt>`, without replacing existing assets.
   It uploads `package.eag.json` and independent `package.eag.json.sha256` assets.
4. Both assets are downloaded again by ID, hashed, safely decoded into a fresh
   directory and package-verified. Missing/failed storage or retrieval blocks deploy.
5. The exact archive/proof/checksum handoff is preserved as
   `eag-release-handoff-<workflowRun>-<attempt>` for 90 days, for local custody too.
6. `release_deploy` requires successful release preparation. In a fresh job it
   reauthenticates live API authority, downloads the remote archive again, repeats
   package/gate checks, and only then uploads `output/publish` to Pages.

Only the two mutually exclusive deploy jobs have Pages/OIDC write permission and
use the `github-pages` environment. No environment reviewer protection is assumed.
The environment can add protection but is not a replacement for the code gate.
Release confirmation must equal `DEPLOY <targetSha>` exactly.

## Separately approved recovery path

Recovery uses `action:recover`, a new approval for the current execution SHA, the
original target SHA/run/attempt, existing archive/checksum asset IDs, and exact
`RECOVER <targetSha> <archiveSha256>` confirmation. Release approval cannot be reused.

`recovery_prepare` has contents/actions **read only**, cannot create a Release, does
not rebuild and does not download a CI candidate. Original successful main CI is
still authenticated, but its Actions artifact may have expired: the independently
approved fixed archive replaces that transport dependency. The approved original
artifact ID remains in the audit record. The baseline and package-byte requirements
are identical to release; arbitrary/old-v8 archives are not accepted.

`recovery_deploy` depends only on successful recovery preparation and repeats live
authorization, remote retrieval and full package verification before Pages upload.
Current baseline restricts recovery to this verified ETCL12 payload. It does not
promise rollback to an untested old UI or safe replay across future incompatible
releases. New payloads or retention generations need an explicitly reviewed baseline.

## Future authorized operation sequence (not executed)

1. Keep the old automatic Pages workflow Disabled while reviewing/committing this
   implementation and moving the complete validation branch to main. Check queued
   publication runs as disabling does not itself cancel them.
2. Obtain a successful **main push** CI artifact. Download that fixed ID; provide
   independently checked `CANDIDATE_*` origin values and create a fresh package with
   existing `package:create`. Do not rebuild it.
3. Use the archive helper below and make a persistent local copy. Inspect the full
   snapshot, L-2 byte identity and receipt; separately authorize an APPROVED record.
4. Only with explicit permission, re-enable the replaced manual workflow after
   confirming its main definition has no push/PR/workflow_run deployment trigger.
5. Dispatch release on that exact main SHA with approved JSON and exact confirmation.
   Archive storage/retrieval must succeed before any Pages deployment.
6. Preserve Release IDs, asset IDs, archive SHA, package snapshot, approval and deploy
   result outside short-lived Actions artifacts. Check deployment and iPhone Safari.

The helper uses existing dependencies only:

```text
node .github/scripts/pages-release-package.cjs archive <verified-package> <fresh-archive-directory> <expected-main-origin.json>
node .github/scripts/pages-release-package.cjs local-copy <package.eag.json> <fresh-persistent-backup-directory> <expected-main-origin.json>
```

The origin JSON has repository, commitSha, runId, runAttempt, eventName=`push`,
ref=`refs/heads/main`, and the integer artifactId. The immutable archive envelope
binds all seven fields, so recovery still checks the original artifact ID after
Actions expiry. Supply them from authenticated CI metadata, not by trusting
self-declared package fields. Archive output gives the full approval snapshot and
archive SHA; local-copy output gives the receipt and SHA256(JSON.stringify(receipt)).
Neither helper creates approval, uploads, or deploys. Both use fresh exclusive outputs.

## Checkout and validation constraints

Existing `.gitattributes` preserves distributed public text and the audited twelve
ETCL inputs as LF; retained resources remain `-text`. Do not renormalize old lesson
inputs, regenerate MP3 or change source-hash values. The seven historical source
exceptions remain unchanged. No new dependency, production asset or Service Worker
change is needed for this gate.

Local synthetic policy/archive/API-adapter tests, typecheck and actionlint establish
implementation behavior only. They do not prove actual GitHub token permissions,
Release storage/download behavior, workflow dispatch, Pages deployment or Safari.
Those are the next separately authorized operational boundary. Existing candidate,
audio and L-2 successes are not rerun merely for gate/document changes.
