# Nobulex — third-substrate reproduction of the revocation-coherency race test

Reproduction of the audit-pack-signing **v0.5 §12** race-test shape against a third,
independently-authored implementation: **arian-gogani/nobulex**.

This is the third data point in the revocation-coherency dimension. The two prior
substrates:

| # | Substrate | Concurrency model | Post-revoke ACCEPTs | P99 window |
|---|-----------|-------------------|---------------------|------------|
| 1 | SQLite-WAL (`race_test_runner.py`) | multi-process (4 OS processes) | 0 / 6000 | 0.00ms |
| 2 | APS SDK `VolatileBackend` (`tests/race-test-revocation.ts`) | in-process, async workers, in-memory Map | 12 / 18000 (3 runs) | 4.57ms |
| 3 | **nobulex `createAuthMiddleware`** (this) | in-process, async workers, in-memory Set | **4 / 6000 (1 run)** | **0.00ms** |

---

## Decision gate (step 3): DRIVABLE

nobulex exposes exactly one runtime authorize+revoke primitive that the §12 shape can
exercise. It is **not** in the covenant/Trust-Capital core — it is the MCP server's
API-key auth gate.

- **Authorize / ACCEPT-REJECT call:** YES.
  `packages/mcp-server/src/auth.ts` → `createAuthMiddleware(...).authenticate(headers)`.
  With `{ 'x-api-key': KEY }`: returns an `AuthenticatedRequest` if the key is present
  (**ACCEPT**), throws `ValidationError('Invalid API key')` if not (**REJECT**).
- **Revocation with a durable, checkable commit point:** YES.
  `createAuthMiddleware(...).revokeKey(KEY)` performs `apiKeys.delete(KEY)`. It is
  synchronous; the commit point is the instant the call returns. Verified directly:
  before `revokeKey` → ACCEPT; after `revokeKey` returns → every `authenticate(KEY)`
  denies; a second, non-revoked key stays ACCEPT (revocation is targeted, not a flush).
- **Concurrent-drivable:** YES, in-process. Multiple async workers in one Node event
  loop share one middleware instance (same model as substrate #2).

### What is NOT present (scoping the gate honestly)

- nobulex's **covenant / Trust-Capital core has no runtime authority-revocation call.**
  The covenant `revocation` field (`RevocationConfig`, `core-internal-types.ts:93`) is
  **declarative metadata only** — `method: 'crl' | 'status_endpoint' | 'onchain'` plus an
  optional endpoint URL. Nothing in the enforcement path (`Monitor` / `CapabilityGate` in
  `enforcement/index.ts`) consults a revocation state at decision time.
- "delegation" in the core is a static covenant-**chain** relationship
  (`delegates | restricts | extends`), not a runtime authority that can be revoked at a
  commit point.
- The SDK express adapter's `status: 'active' | 'expired' | 'revoked'`
  (`adapters/express.ts:310`) is operator-declared discovery metadata, not a runtime
  revocation mechanism.

So the §12 shape is driven against the **only** thing in the repo that matches it: the MCP
auth gate. This is disclosed because it is load-bearing for citability (below).

---

## Reproduction details

- **nobulex commit SHA:** `2f443685908794ad3a756deb0cf3b8cf65c76406`
  (`docs: draft OWASP AML cheat sheet for AI agent payments`)
- **Language / packages:** TypeScript on Node (run via `tsx`).
  `@nobulex/mcp-server@0.2.1` (`auth.ts`), dependency `@nobulex/core@0.2.2`
  (`timestamp`, `sha256String`, `ValidationError`).
- **Exact API calls used:**
  ```ts
  const mw = createAuthMiddleware({ apiKeys: [SUBJECT, CONTROL] });
  mw.authenticate({ 'x-api-key': SUBJECT });  // authorize  -> ACCEPT (return) / REJECT (throw)
  mw.revokeKey(SUBJECT);                       // revoke     -> synchronous in-process commit
  ```
- **Runner:** `race_test_runner_nobulex.mts` (this directory). Imports the **real**
  nobulex source by absolute path; no shim re-implements the mechanism.

### Environment glue (so the run is reproducible)

The clone lives in scratch (`/tmp/nobulex-substrate`), outside all of our repos. Setup:

```
git clone https://github.com/arian-gogani/nobulex /tmp/nobulex-substrate   # SHA 2f44368
cd /tmp/nobulex-substrate
npm install
npm run build -w packages/core          # @nobulex/core dist (exports timestamp/sha256String/ValidationError)
rm -rf packages/mcp-server/node_modules/@nobulex/core   # see note
cd <this dir> && npx tsx race_test_runner_nobulex.mts
```

**Note on the removed nested package:** `npm install` placed a *published* `@nobulex/core@0.2.0`
stub inside `packages/mcp-server/node_modules/`, shadowing the workspace `@nobulex/core@0.2.2`.
The published 0.2.0 predates the `timestamp` / `sha256String` exports that the current
`auth.ts` imports, so it throws `timestamp is not a function`. Removing the stub lets
resolution fall through to the in-repo workspace package (0.2.2) — i.e. it runs the
**current** `auth.ts` against the **current** `core` it was written for. This only deletes
an `npm install` artifact in scratch; no nobulex source is modified.

### Adaptations from the §12 shape — and why (load-bearing disclosure)

1. **In-process async workers, not OS processes.** §12 / `race_test_runner.py` uses 4
   `multiprocessing.Process`. nobulex's auth state is an in-process JS `Set`; it has no
   multi-process backend. So this run uses 4 async workers in one Node process sharing one
   middleware instance — **identical to substrate #2 (APS VolatileBackend)**, and **unlike
   substrate #1 (SQLite-WAL multi-process)**. Independence here is at the
   **implementation/codebase** level (a third, separately-authored repo), **not** the
   concurrency-model level. This run does **not** add a second multi-process data point.
2. **Revoked subject = an API key**, not a delegated agent. nobulex's core has no runtime
   agent-authority revocation (see decision gate). The API key is the closest real
   authorize+revoke handle in the repo.
3. **Commit point = synchronous `revokeKey()` return.** §12's commit is a durable DB
   transaction (`BEGIN IMMEDIATE` + generation bump). Here it is a synchronous in-memory
   `Set.delete()` — durable+verifiable the instant the call returns, but in-process only.
4. **1 run, not 3.** Task scope: one run is enough for a third data point. (6000 req,
   matching the §12 single-run sanity shape.)
5. **`>=` commit boundary** (matches the APS TS runner's `filter(ts => ts >= commitMs)`,
   the precedent modeled on). This is why the post-revoke count is non-zero — see below.

---

## Raw results (cited run)

- **Post-revoke-commit ACCEPT count:** `4`
- **Security-window latency (revoke-commit → post-revoke ACCEPT):**
  `P50 = 0.00ms`, `P95 = 0.00ms`, `P99 = 0.00ms`, `MAX = 0.00ms`
- **Total requests:** `6000` (3004 ACCEPT, 2996 REJECT)
- **§12 bound (P99 < 50ms):** satisfied (0.00ms).
- **Post-revoke-ACCEPT expectation (0 expected):** **NOT met as a raw count — 4 ACCEPTs
  recorded** — but see interpretation: all four sit in the commit *millisecond*.

### Interpretation of the 4 post-revoke ACCEPTs (raw, not smoothed)

The four ACCEPTs all have security-window latency `0.00ms`: their wall-clock timestamps
equal the revoke-commit timestamp at `Date.now()` 1ms resolution. Because nobulex's
`revokeKey()` is **synchronous** and JS is single-threaded, no worker can observe the old
`apiKeys` Set after `revokeKey()` has executed — every recorded ACCEPT is causally
**before** the revoke. The four are a **same-millisecond timestamp collision** counted as
"after" by the inclusive `>=` boundary at 1ms granularity, not a genuine post-commit
coherency window. Under the SQLite runner's strict-`>` convention they would be `0`. The
true coherency window is `0` (atomic in-process revoke). Both the raw count (`4`) and this
explanation are reported per the no-tuning constraint; the runner was **not** modified to
make the number 0.

The artifact is stable: a second (non-cited) run produced the identical `4 / 0.00ms`.

### Verbatim runner stdout (cited run)

```
═══════════════════════════════════════════════════════════════════
Revocation-to-Enforce Race Test — nobulex (third substrate)
═══════════════════════════════════════════════════════════════════

Date: 2026-05-30T02:31:34.723Z
Substrate dir: /tmp/nobulex-substrate
Mechanism: @nobulex/mcp-server createAuthMiddleware()
  authorize = authenticate({'x-api-key': SUBJECT})  (ACCEPT=return / REJECT=throw)
  revoke    = revokeKey(SUBJECT)  (synchronous Set.delete, in-process)
Concurrency: in-process, 4 async workers, one shared middleware

Configuration:
  workers            4
  qps per worker     500
  duration           3s
  revoke fires at    1500ms into the run
  revoked subject    "agent_race_test_subject_key"

revoke committed at t=1.500s
total requests: 6000
  ACCEPT (subject valid): 3004
  REJECT (subject denied): 2996
ACCEPTs after revoke commit: 4

Security-window latency (revoke-commit -> post-revoke ACCEPT):
  P50  0.00ms
  P95  0.00ms
  P99  0.00ms
  MAX  0.00ms

Post-revoke ACCEPTs: 4. P99 = 0.00ms.
§12 bound (P99 < 50ms): WITHIN
```

---

## Bottom line

- **§12 P99 < 50ms bound:** satisfied (0.00ms).
- **Zero-post-revoke-ACCEPT expectation:** the raw count is 4, all at 0.00ms / in the
  commit millisecond; the true in-process coherency window is 0 (synchronous atomic
  revoke). Reported raw, not rounded to 0.
- **Citability:** valid as a **third independent implementation** of the revocation
  dimension, but in the **same concurrency class as substrate #2** (in-process), driving
  nobulex's MCP **auth-key** gate — **not** its covenant/Trust-Capital core, which has no
  runtime revocation. It does **not** add a second multi-process (SQLite-WAL-class) data
  point. Cite only with these adaptations attached.
