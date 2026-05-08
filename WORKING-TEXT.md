# `enforcement_effectiveness` dimension family — working text v0.1-skeleton

**Status:** v0.1-skeleton (this scaffold). v0.1 lands within 5 working days of repo open (target 2026-05-15) per the [OWASP AIVSS #31](https://github.com/OWASP/www-project-artificial-intelligence-vulnerability-scoring-system/issues/31) cadence agreement.

**Scope:** the four dimensions in the family — structural enforcement × empirical block-rate × time-to-enforce × `enforcement_locus`. Composition rules. Tier criteria with empirical-methodology requirements. `enforcement_locus` enum semantics + threat-model preconditions.

**Out of scope:** the broader AIVSS v1.0 rubric. This document is separable. Other dimension families live in their own working texts; cross-axis composition with #32 (cryptographic-enforcement multiplier) is the only one we explicitly anchor to.

---

## 0. Authorship + intent

Working draft co-authored by:

- @VeloGerber / AiEGIS — empirical block-rate receipts, time-to-enforce dimension, gateway-side threat-model surface
- @aeoess / APS by AEOESS — APS-side reciprocal race-test reproduction, structural-axis composition framing, `enforcement_locus` semantics
- OWASP AIVSS #32 contributors — commit-rights on structural-axis sections (TBD via #32 invitation thread)

Intent: ship a single citable artifact that AIVSS v1.0 reviewers + vendor scorecards can reference for the four dimensions in the family.

---

## 1. Dimension definitions

(v0.1 expands each row with definition prose, accepted measurement methodology, and the receipt-shape any vendor-side claim must produce.)

### 1.1 Structural enforcement

(TBD v0.1: anchor to AIVSS #32 §3.2; binary; ×1.0 / ×2.0 multiplier; receipt requirement = signed assertion that the gate is structurally enforced rather than asserted-only.)

### 1.2 Empirical block-rate

(TBD v0.1: continuous; RMF-style receipts citing the rate at which the gate actually blocked vs allowed across measurement window N; methodology = sliding-window count over signed event log.)

### 1.3 Time-to-enforce

(TBD v0.1: tiered with rail-anchored thresholds; high = P99 < min(typical-user-action), with ≈200ms as the payments / agent-toolkit floor; medium = P99 < typical-task-batch-end, ≈5s; low = P99 ≥ task-batch-end OR no empirical methodology cited; unknown = vendor self-claim without methodology.)

### 1.4 Enforcement locus

(TBD v0.1: enum {customer, vendor, hybrid}; threat-model deltas per value; preconditions on each value — see §5.)

---

## 2. Tier criteria with empirical-methodology requirements

(TBD v0.1: per-dimension tier criteria; each tier requires a receipt shape and a methodology citation. Receipts must be signed and reproducible.)

---

## 3. Reference implementations as portability evidence

Two reference implementations run the same race-test methodology shape and produce identical headline numbers across independent substrates:

| Implementation | Substrate | Backend | Source |
|---|---|---|---|
| audit-pack-signing v0.5 §12 | SQLite WAL multi-process | network-backed | sha `c5f62c9fce6e08b5` |
| APS race-test runner | in-process Map | `RevocationStorage` interface | [aeoess/agent-passport-system@20de7e9](https://github.com/aeoess/agent-passport-system/blob/main/tests/race-test-revocation.ts) |

Methodology shape: 4 workers × 500 qps × 3 seconds × 3 runs = 18,000 requests; revocation fires at run midpoint; measure time from revocation commit to last ACCEPT for the revoked delegation.

Both report P50/P95/P99/MAX = 0.00ms with zero ACCEPTs after revocation commit. Substrate independence: the same methodology produces the same answer across in-process Map and SQLite WAL multi-process backends. Methodology portability is empirically established rather than asserted.

(TBD v0.2: third-substrate reproduction, Nobulex first per the [#31 substrate-ordering recommendation](https://github.com/OWASP/www-project-artificial-intelligence-vulnerability-scoring-system/issues/31).)

---

## 4. Composition rules

The structural axis dominates the composition. A low-latency assertion is still asserted-only (the false-security quadrant, expanded along the latency axis). A high-block-rate gate at the audit layer is still post-action (no structural floor). Only the all-three-high posture (structural × measured-effective × fast) survives the long-tail config-drift case.

(TBD v0.1: explicit configurations + counter-examples; truth-table mapping of the eight cells in the 2×2×2 cube; v1.0 panel-ready.)

The fourth dimension (`enforcement_locus`) is orthogonal — it doesn't rank; it qualifies. A vendor-hosted enforcement at high tier on the other three axes carries different threat arithmetic than a customer-cloud-only enforcement at the same tier (see §5).

---

## 5. `enforcement_locus` enum semantics + threat-model preconditions

### 5.1 Values

- **`customer`** — enforcement boundary lives in the customer's infrastructure; vendor sees outputs only after the customer's gate has run.
- **`vendor`** — enforcement boundary lives in the vendor's infrastructure; customer sends inputs to the vendor and trusts the vendor's gate.
- **`hybrid`** — split: some enforcement classes at the customer boundary, others at the vendor boundary; the split is itself a documented contract.

### 5.2 Threat-model deltas per value

(TBD v0.1: per-value threat-model. The `customer` value carries the lowest vendor-trust dependency; the `vendor` value carries the full vendor-trust burden; `hybrid` is a per-class composition.)

### 5.3 Preconditions for `enforcement_locus = customer` claims

A vendor claiming `enforcement_locus = customer` is *implicitly* asserting that the vendor cannot read or alter customer-cloud enforcement state. Making this explicit as a precondition keeps the dimension structurally clean (the dimension itself doesn't grow a fifth axis) while giving panel reviewers a concrete check.

The high tier of any `enforcement_locus = customer` claim implicitly asserts:

1. **Multi-tenant isolation** — operator-A bearer cannot read operator-B's enforcement state across any vendor-side endpoint that exposes operator data (registry / anomaly / audit / metering). Verifiable via cross-tenant probe receipts.
2. **HMAC rotation discipline** — webhook-signing or auth secrets rotate with a documented two-secret window (PRIMARY + PREVIOUS), accept-either during rollover, ~24h validity overlap. Verifiable via the rotation log.
3. **Service-account allowlist** — any vendor-internal service account that touches customer-cloud state is on a documented IP allowlist (loopback-default with explicit CIDR override, fail-closed on config error). Verifiable via the allowlist file + change log.
4. **Per-source-IP rate limiting** on customer-facing ingest endpoints (sliding-window counter, deque-bounded per-IP buckets, periodic GC). Verifiable via the rate-limit config + sample bucket dump.

(VeloGerber / AiEGIS surfaced these on 2026-05-08 via OWASP AIVSS #31 after closing a P0 multi-tenant info-leak on `/registry/operators` + `/registry/anomaly/alerts` — pre-customer state, zero actual leak event, fixed atomically with 25 receipts. The incident-handling discipline itself is a positive trust signal: the receipts make the precondition verifiable.)

### 5.4 Preconditions for `enforcement_locus = vendor` claims

(TBD v0.1: parallel preconditions for vendor-side enforcement, focused on the customer's audit-trail right.)

### 5.5 Preconditions for `enforcement_locus = hybrid` claims

(TBD v0.1: each enforcement class declares its locus + the corresponding precondition set inherits.)

---

## 6. Receipt shapes

(TBD v0.1: canonical receipt shape for each tier in each dimension. Reviewers verify a vendor's claim by validating the receipt shape + signature + methodology citation.)

---

## 7. Cross-implementation methodology

(TBD v0.1: protocol for adding a third / fourth implementation. The `RevocationStorage` interface in the APS SDK and the SQLite WAL store in audit-pack-signing v0.5 are the two reference backends; any third-substrate implementation must conform to a documented adapter shape and produce a results table with the same headline columns.)

---

## Open questions for v0.1 review

1. Do we want the receipt shape to be canonicalized via JCS (RFC 8785), or do we leave canonicalization scheme as a per-implementation choice?
2. Is the structural-axis multiplier always ×2.0, or does the AIVSS v1.0 rubric allow it to vary per-dimension-family?
3. For `enforcement_locus = hybrid`, is there a required minimum precondition coverage, or is the per-class declaration sufficient?

---

## References

- [OWASP AIVSS #31 — Discussion: Runtime Enforcement Effectiveness as a Scoring Dimension](https://github.com/OWASP/www-project-artificial-intelligence-vulnerability-scoring-system/issues/31)
- OWASP AIVSS #32 §3.2 — cryptographic-enforcement multiplier
- audit-pack-signing v0.5 §12 — revocation cache coherency, race-test fixture sha `c5f62c9fce6e08b5`
- [APS race-test runner](https://github.com/aeoess/agent-passport-system/blob/main/tests/race-test-revocation.ts) — in-process Map substrate
- [APS race-test results — Day 80 baseline](https://github.com/aeoess/agent-passport-system/blob/main/tests/race-test-revocation-results-2026-05-07.txt)
