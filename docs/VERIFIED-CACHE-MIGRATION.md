# Verified cache migration (Phase 5B-2B-2)

## Release identity and build order

The source `web/public/sw.js` is a template. Its `WORKER_BUILD_ID` placeholder is
replaced only in `web/dist/sw.js`, after Vite completes and before the final JSON
manifests are written. `workerBuildId` hashes the canonical asset collections with
that declaration normalized to its placeholder. Both manifests carry this ID.
Their shared `releaseId` then hashes the collections with the final stamped Worker
size/SHA-256. See [manifest schema](VERIFIED-ASSET-MANIFESTS.md).

This avoids a circular self-hash. Any asset/template change changes the installed
Worker identity, so a stale Worker cannot silently install a new release's pair
of manifests. Installation verifies both identities, the Worker body/declaration,
and all explicit HTML resource dependencies. These are integrity checks, not a
signature or protection against a compromised same-origin publisher.

Run the complete `npm run web:build` pipeline. Publishing the raw public Worker,
or a failed/partially generated build, is unsupported. Re-running the post-build
generator on the same output remains deterministic.

## Manifest acquisition and validation

During install, request both verified JSON files directly using same-origin GET,
`cache: no-store`, `credentials: same-origin`, and `redirect: error`. Do not obtain
them from any Cache Storage entry. Only HTTP 200 non-opaque responses are accepted.

Validate schema version, kind, exact registration base, lowercase SHA-256 IDs,
matching build/release IDs, positive safe-integer byte sizes, sorted safe paths,
exact base-prefixed URLs, and case-insensitive uniqueness across both collections.
Reject manifest/marker self references and invalid audio paths. Recompute the
release identity from canonical records. Required app entries include HTML, Worker,
legacy asset array and webmanifest. Missing HTML dependencies also fail install.

## Cache generations

Names are `eag-verified-${encodeURIComponent(registrationScope.pathname)}-${releaseId}`.
Cache Storage itself is origin-scoped. `eag-training-v8` is a read-only migration
source. Only this registration's new prefix is considered for other generations;
unrelated caches are neither queried for responses nor deleted.

The completion record lives at the synthetic URL
`<scope>/__eag_verified_complete__` inside a generation. It contains version 1,
`firstInstall` compatibility metadata, and both verified manifests. The historical
boolean remains readable but is never used to control clients. It is written last, after all required
bodies and Worker/HTML checks pass. The synthetic URL is not a network asset and
is excluded from manifests.

Missing/invalid markers identify incomplete generations, which are excluded from
normal fetch and from other generations' migration sources. A marker is never
sufficient by itself: activation and each Worker-process restart revalidate all
required cached bodies and identities before selecting the current generation.
That full validation is memoized for the Worker lifetime; file-level runtime cache
writes also verify known assets before replacing them.

## Install algorithm

1. Validate the downloaded manifest pair before writing a generation.
2. If this exact generation is already fully verified and complete, reuse it
   without changing its contents or marker.
3. Otherwise open its staging cache and remove a stale marker, if any.
4. For each asset, verify any existing staging response. This enables retry after
   termination, quota failure or interrupted download.
5. Search v8 and recognized prior completed generation candidates. Accept only
   HTTP 200, non-opaque full responses without Content-Range/Range-dependent Vary,
   whose complete body size and SHA-256 match the new manifest.
6. Fetch only missing/invalid files using a non-Range, no-store, no-redirect GET.
   Reject 206, 404, opaque, incorrect size/hash, or incomplete response bodies.
7. Store only verified responses. Revalidate the complete generation, Worker build
   binding and HTML dependencies, then write the completion record.

Failure rejects install. No skipWaiting is called, old caches are never modified,
and no new generation is exposed to normal fetch through install's in-memory state.
Failed staging data remains for a verified retry. A marker-write failure also
leaves the generation incomplete.

## Activation and fetch

No installation calls `skipWaiting()` or `clients.claim()`, including initial
registration. Existing clients continue using their current Worker until the
browser's normal lifecycle allows activation. A first uncontrolled page stays
uncontrolled; after activation, the next normal navigation into scope uses the
Worker. Installing assets alone does not switch an already-open first page to
offline interception. No automatic reload is introduced.

Phase 5B-2C-2A removes the old `if (generation.firstInstall) clients.claim()` branch.
A generation originally installed first can retain `firstInstall: true` after
A-to-B-to-A recovery. That historical marker must not represent the current
registration lifecycle. Existing markers, their version and all cached bodies
remain unchanged and readable.

We compared remembering an initial-registration decision during install with
removing forced claim. During install/waiting, `registration.active` may identify
the previous Worker (or be absent), but before activate is dispatched it is changed
to the new activating Worker. An install-time in-memory decision also requires
safe handling of process restart and changing registration state. Because the app
has no dependency on immediate first-page control, removing claim entirely is the
smaller conservative choice. Ambiguous lifecycle state never forces client control.
See the [Service Worker activation algorithm](https://www.w3.org/TR/service-workers/#activation-algorithm)
and [claim behavior](https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim).

The current implementation deletes no cache generations. This retains the immediate
previous healthy generation, v8, unrelated caches and retryable incomplete data.
Incomplete cleanup candidates are identifiable by the owned prefix and missing/
invalid completion record. Automated pruning is deferred: safely proving an old
generation is unused is preferable to freeing space by deleting it during an
update. Repeated releases/failures therefore accumulate storage; a later bounded
retention/cleanup slice is needed. Never delete old generations to make an install
fit a quota.

Normal fetch uses the named, fully verified generation matching the running
Worker's build ID. There is no global `caches.match()`. If no such generation is
available, fetch is network-only and never reads staging or unrelated caches.

English lesson/continuous audio and the legacy asset array retain cache-first
behavior. Metadata and Japanese cues retain network-first behavior. Only complete
200 responses can be stored; known manifest assets must match before replacement.
A runtime cache-save failure does not invalidate a usable online response.

The deliberate app-shell exception pins manifest-listed HTML/JS/CSS/icons and
other app dependencies to the running release. Base-directory navigation maps to
its `index.html`, including query-bearing navigation. This avoids serving new HTML
that references a different release's chunks while another Worker is waiting.

## Unified offline audio ranges (Phase 5B-2B-3)

Only exact URLs listed in the current completed generation's audio manifest qualify,
and only `lesson.mp3`, `continuous-training.mp3` and numbered Japanese Cue MP3 paths.
External, out-of-scope and unrelated MP3 requests are not handled by the new range
route. Metadata and app-shell routes are unchanged.

For a Range GET, revalidate the cached HTTP 200 full body against its manifest size
and SHA-256 before slicing. Valid single byte ranges are served locally without a
network call for all three audio types, whether online or offline:

- `bytes=0-`: all bytes, status 206;
- `bytes=100-499`: inclusive interval;
- `bytes=100-`: offset through EOF;
- `bytes=-500`: final 500 bytes, or the whole file when the suffix exceeds its size.

Explicit end positions beyond EOF are clamped. Integer parsing uses BigInt before
clamping to the actual buffer size, avoiding numeric rounding for large headers.
A 206 contains Content-Range, Content-Length, Accept-Ranges and the cached
Content-Type (audio/mpeg fallback). Zero suffix, start past EOF, reversed ranges,
malformed single ranges and empty bodies return 416 with `bytes */{totalSize}`,
Content-Length 0, Accept-Ranges and Content-Type. Empty files cannot pass generation
verification, but the range parser also handles them safely in isolation.

Comma-separated `bytes=` ranges are unsupported locally. Forward the original
request online and preserve the server's response. On a network exception, return
503 with a textual explanation, `X-EAG-Range-Unsupported: multiple` and
`Cache-Control: no-store`. Do not pretend this is an unsatisfiable single range or
return a partial/full cache body as if it were a multipart response.

Missing, corrupted, partial or unreadable cached bodies are never sliced. Forward
such a request to the network; if that also fails, the request fails. No response
obtained through the dedicated Range route is written to Cache Storage, including
200 responses from servers that ignore Range. In particular, 206 is never converted
to 200, persisted, or allowed to overwrite a verified complete body.

Non-Range English/continuous GETs remain cache-first; Japanese Cue and metadata
GETs remain network-first with cache fallback. Runtime cache-save errors remain
isolated from usable online responses. Install, marker validation, activation,
Worker identity and generation selection are unchanged in this slice.

The VM tests cover byte-exact intervals and suffixes (including a multi-byte UTF-8
fixture), all response headers, EOF/clamping, malformed/empty cases, online/offline
multipart behavior, 206 non-storage, cache non-destruction, invalid/staging cache
exclusion, non-audio isolation and ordinary GET regressions. Device playback and
Safari's real request/lifecycle behavior still require separately authorized tests.

## Publishing constraints (no deployment performed)

The GitHub main branch still has the old workflow that uploads only a new dist.
The local manual workflow now verifies candidates and merges retained hashed
resources; its final-audit publication gate remains unconditionally closed. See
[retention and packaging](LEGACY-ASSET-RETENTION.md) and
[safe workflow migration](CI-AND-DEPLOYMENT.md). Local changes do not disable the
old workflow on GitHub; do not push main before the approved disabling procedure.

Before any separately authorized release:

1. Run the complete build, tests and byte-level manifest checks. Keep one immutable
   release artifact; do not publish assets and manifests from different builds.
2. Include old hashed JS/CSS required by still-running releases in the published
   artifact, or use immutable versioned hosting that retains those URLs. Copying
   retained old chunks into a release artifact is a separate publishing task;
   do not change current HTML or regenerate manifests from a mixed build.
3. Ensure the artifact contains both verified manifests and the stamped Worker,
   and verify HTTP 200, MIME/Range behavior and cache headers on the actual host.
4. Allow old pages to close naturally; verify update completion and offline startup
   on iPhone Safari and the Home Screen app before treating rollout as verified.

The new Worker pins its own complete app shell, but cannot retrofit that behavior
into an already-active v8 Worker. It also cannot recover old un-cached resources
removed by hosting, or protect against browser-origin eviction. Never promise
complete old-page protection without retaining old server assets. No deployment
has been performed. Generator-only historical Source Hash exceptions do not alter
these runtime checks; see [investigation and policy](LEGACY-SOURCE-HASH-AUDIT.md).

## Verification coverage

The VM harness runs the actual Worker source after the production binding helper
stamps it. Synthetic records use the real 20-lesson identities/counts: 213 audio
records and 9 app records. It verifies fresh install, v8 migration, reuse of 85 old
cues, ETCL 36+68 downloads, all 153 cues, invalid manifest fields, mismatched release/
build, SHA/size mismatch, 404/206/opaque, interrupted/quota-limited writes, failed
marker save, retry, same-release idempotence, marker-only rejection, source cache
immutability, unrelated-cache retention, named-generation fetch, prior-page shell
pinning, changed-body-only migration and Range regression behavior.

Existing tests protect Active Recall's queue identities, current position, Weak
state, storage keys and signatures. There is no localStorage access in the Worker.
VM tests do not simulate the browser's lifecycle scheduler or iOS process eviction;
actual device/update/deployment validation remains necessary.


## Lifecycle recovery regression (Phase 5B-2C-2A)

The real Worker VM test first installed A, saved a legacy true marker, installed
and activated B, then reused complete A. Before the fix the final assertion failed:
claim count 1 instead of 0. After the fix, A is reused with only two manifest
requests, no cached asset/marker writes, no generation deletion and no claim/skip.

Additional tests model waiting/activating registration values, a still-open old
page, failed initial install, retry, changed registration state and process restart.
Initial, update and recovery activation all make zero claim and skipWaiting calls.
The VM models event ordering and observable state, not the browser's navigation
controller assignment; that default behavior and iPhone Safari still need device
validation. The publication-retention and workflow issues remain separate work.
