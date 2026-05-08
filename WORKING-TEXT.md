# `enforcement_effectiveness` dimension family, working text v0.1

**Status:** v0.1 draft. Target publish 2026-05-15 per the [OWASP AIVSS #31](https://github.com/OWASP/www-project-artificial-intelligence-vulnerability-scoring-system/issues/31) cadence agreement.

**Scope:** the four dimensions in the family. Structural enforcement, empirical block-rate, time-to-enforce, `enforcement_locus`. Composition rules. Tier criteria with empirical-methodology requirements. `enforcement_locus` enum semantics with threat-model preconditions.

**Out of scope:** the broader AIVSS v1.0 rubric. This document is separable. Other dimension families live in their own working texts. Cross-axis composition with #32 (cryptographic-enforcement multiplier) is the only one we explicitly cite.

License: Apache-2.0.

---

## 0. Authorship and intent

Working draft co-authored by:

- @VeloGerber / AiEGIS, empirical block-rate receipts, time-to-enforce dimension, gateway-side threat-model surface
- @aeoess / APS by AEOESS, APS-side reciprocal race-test reproduction, structural-axis composition framing, `enforcement_locus` semantics
- OWASP AIVSS #32 contributors, commit-rights on structural-axis sections (TBD via #32 invitation thread)

Intent: ship a single citable artifact that AIVSS v1.0 reviewers and vendor scorecards can reference for the four dimensions in the family. Reviewers verify a vendor's tier claim by checking the receipt shape, the methodology citation, and (for `enforcement_locus = customer`) the precondition set in §5.3.

---

## 1. Dimension definitions

Each dimension below carries: a definition, the axis type, the receipt a vendor must produce to support a tier claim, and the failure mode the dimension is designed to surface.

### 1.1 Structural enforcement

**Definition.** A constraint is *structurally enforced* when the action boundary refuses to admit a non-conforming action regardless of what the agent process tells the boundary to do. The constraint either exists at the boundary as a cryptographic gate (the gate verifies a signature, a delegation envelope, a scope claim, or an equivalent cryptographic artifact before the action proceeds) or it exists only as an assertion inside the agent process. Structural enforcement is the binary distinction between the two.

**Axis type.** Binary. Cryptographic gate at the action boundary, or asserted-only.

**Multiplier semantics.** Per OWASP AIVSS #32 §3.2: a structurally enforced constraint carries a ×2.0 multiplier on the underlying score. An asserted-only constraint carries ×1.0. The multiplier captures that an asserted-only gate is a probabilistic mitigation. A cryptographic gate is a categorical one.

**Receipt requirement.** The vendor publishes a signed assertion that the gate is structurally enforced. The assertion identifies the action boundary, the cryptographic primitive in use (signature scheme, delegation envelope shape, scope-verification surface), and the policy under which the gate refuses non-conforming actions. The signature is over the assertion content, signed by a key bound to the vendor's published identity. A reviewer can verify the signature offline against the vendor's published public key.

**Failure mode the axis surfaces.** Asserted-only gates that look correct in normal operation but cannot survive the gate-process being the threat. Prompt injection, context drift, and malformed plans all reduce to "the agent process can be persuaded to skip its own gate." A cryptographic gate at the action boundary survives those attacks because the boundary does not consult the agent process for the gate decision. The structural axis is the floor the other three dimensions build on.

### 1.2 Empirical block-rate

**Definition.** The rate at which the gate actually blocks non-conforming actions across a measurement window. Block-rate is a property of how the gate performs, given the constraint set the gate enforces. A high block-rate without a structural floor (§1.1) describes a gate that catches what it sees and tells the truth about its own coverage.

**Axis type.** Continuous, expressed as a fraction in [0, 1] over a defined measurement window.

**Methodology.** Sliding-window count over a signed event log. For window N over time period T:

`block_rate(N, T) = count(events where verdict = block, t ∈ [T - N, T]) / count(events where verdict ∈ {block, allow}, t ∈ [T - N, T])`

The window N and the time period T are both required parameters of any cited rate. A claim of "block-rate 0.94" without N and T is unverifiable.

**Receipt requirement.** Signed events with verifiable timestamps. Each event in the window carries (a) the action under evaluation, (b) the verdict (block or allow), (c) the timestamp, and (d) a signature binding (a) through (c) to the gate's signing key. The rate is reproducible: any third party reading the log can recompute the rate over the same window and arrive at the same number. The gate's signing key is the same key used in §1.1's structural-enforcement assertion.

**Anti-pattern.** A vendor self-reports a block-rate without methodology citation. The number stays at the unknown tier regardless of the value claimed. The dimension distinguishes "the gate caught X% of attempts in a measured window" from "the vendor says the gate works." Without the receipt and the window definition, the second collapses into the first only by the reviewer's good faith.

### 1.3 Time-to-enforce

**Definition.** The time between a policy decision committing (a delegation revoking, a scope narrowing, a constraint registering) and the gate refusing the next non-conforming action. Time-to-enforce measures the closing speed of the enforcement window. A slow gate guarantees a non-zero number of accepts after the policy decision committed.

**Axis type.** Tiered with rail-tied thresholds.

**The structural threshold.** Time-to-enforce strictly less than the next-user-action time. Anything slower guarantees at least one ACCEPT leaks. The threshold is tied to the rail's user-perceptible action distribution. Fixed millisecond cutoffs do not survive cross-rail portability: payments rails sit around 200-500ms windows, content rails sit at multi-second batch boundaries, audit pipelines sit at minute-scale windows. The same scoring scheme applies across rails with different floors.

**Tier definitions.**

- **high**: P99 < min(typical-user-action), with ≈200ms as the payments and agent-toolkit floor
- **medium**: P99 < typical-task-batch-end, ≈5s
- **low**: P99 ≥ task-batch-end OR no empirical methodology cited
- **unknown**: vendor self-claim without methodology

**Receipt requirement.** Percentile measurement across N runs (4 workers × 500 qps × 3 seconds × 3 runs is the reference shape; vendors free to scale up). Signed run logs covering each individual request. Methodology shape disclosed in machine-readable form: workers, qps, duration, run count, what triggers the policy decision, how the gate measures time-to-enforce. The receipt is reproducible by a third party who runs the same shape against the vendor's published interface.

**Methodology portability.** The high tier requires the same methodology shape to reproduce across at least two independent substrates. A single-substrate measurement leaves it open whether the headline numbers come from the gate's behavior or from the substrate the gate runs on. Two substrates with identical headline numbers establish that the dimension measures the methodology; the substrate drops out of the result. The reference implementations cited in §3 satisfy this requirement.

### 1.4 Enforcement locus

**Definition.** Where the enforcement boundary lives. Enforcement_locus identifies who runs the gate, captured as an enum value attached to every decision the gate produces.

**Axis type.** Enum: `{customer, vendor, hybrid}`.

**Per-value threat-model.**

- `customer`: the enforcement boundary lives in the customer's infrastructure. The vendor sees outputs only after the customer's gate has run. Vendor-trust dependency is at its lowest, since the gate decision does not pass through the vendor's substrate. The high-tier claim under this value carries the precondition set defined in §5.3.
- `vendor`: the enforcement boundary lives in the vendor's infrastructure. The customer sends inputs to the vendor and trusts the vendor's gate to refuse non-conforming actions. The customer's audit trail right is the load-bearing protection. A high-tier vendor claim must publish a receipt that the customer can verify offline against the vendor's published key.
- `hybrid`: the gate is split. Some enforcement classes run at the customer boundary, others at the vendor boundary. The split is itself a documented contract that names which classes run where.

**Receipt requirement.** The `enforcement_locus` value appears in every decision receipt the gate produces. For `enforcement_locus = customer` claims, the precondition set in §5.3 must be verifiable against published artifacts (signed configuration attestations, rotation logs, IAM policy snapshots, rate-limiter configurations).

**Why this is its own dimension and not inside the others.** A vendor-trust dependency has different threat-model arithmetic than the gate's cryptographic strength or its block-rate. A vendor-locus high-tier claim and a customer-locus high-tier claim with identical block-rate and time-to-enforce numbers carry different residual risk: the vendor-locus posture compounds vendor-side compromise into customer-side outcome; the customer-locus posture does not, given the §5.3 preconditions hold.

---

## 2. Tier criteria with empirical-methodology requirements

Each tier in each dimension requires both a receipt and a methodology citation. A vendor assertion without a methodology stays at the unknown tier regardless of the number claimed. The unknown tier is not a placeholder for "we have not measured yet"; it is the tier the dimension assigns when the evidence the rubric requires has not been published.

### 2.1 Cross-cutting tier table

| Dimension | high | medium | low | unknown |
|---|---|---|---|---|
| Structural enforcement | cryptographic gate at the action boundary, signed assertion published | (binary axis: no medium tier) | asserted-only, signed admission published | no signed assertion either way |
| Empirical block-rate | block_rate ≥ 0.95 over window N, signed events, methodology citation | block_rate ≥ 0.80, signed events, methodology citation | block_rate < 0.80 OR signed events without methodology citation | no signed event log |
| Time-to-enforce | P99 < min(typical-user-action), reproducing across two independent substrates, signed run logs | P99 < typical-task-batch-end (~5s), signed run logs | P99 ≥ task-batch-end OR no empirical methodology cited | vendor self-claim without methodology |
| Enforcement locus | `customer` with §5.3 preconditions verified, OR `vendor` with audit-trail-right contract published, OR `hybrid` with per-class declaration | (enum axis: no medium tier in the rubric sense; the hybrid value lands here when partial preconditions are verified) | enum value present in receipts, no precondition verification | `enforcement_locus` value not present in receipts |

The structural-enforcement and enforcement-locus rows are not continuous. The tier label captures the verification evidence the vendor has published. For empirical block-rate and time-to-enforce, the rate or the percentile is the measurement; the tier captures both the value and the methodology behind it.

### 2.2 Core requirement, in one sentence

A tier claim requires both a signed receipt and a published methodology citation. Vendor assertion without methodology stays at unknown regardless of the number claimed.

### 2.3 Worked example

A vendor claims `time-to-enforce` P99 < 100ms. Two cases:

**Case A.** The vendor publishes the number with no methodology, no run logs, and no scriptable reproduction. The dimension assigns the unknown tier. The number is not part of the vendor's tier; it is part of the vendor's marketing.

**Case B.** The vendor publishes a methodology citation pointing at audit-pack-signing v0.5 §12 (4 workers × 500 qps × 3 seconds × 3 runs, revocation fires at run midpoint, time measured from revocation commit to last ACCEPT for the revoked delegation, sha `c5f62c9fce6e08b5`), publishes signed run logs covering 18,000 requests, and exposes a `RevocationStorage`-shaped or equivalent interface that a reviewer can run the methodology against. The dimension assigns the high tier.

The tier difference between the two cases comes from the methodology citation and the receipt. The number is identical in both. The rubric distinguishes the verifiable claim from the unverifiable one.

---

## 3. Reference implementations as portability evidence

Two reference implementations run the same race-test methodology shape and produce identical headline numbers across independent substrates:

| Implementation | Substrate | Backend | Source |
|---|---|---|---|
| audit-pack-signing v0.5 §12 | SQLite WAL multi-process | network-backed | sha `c5f62c9fce6e08b5` |
| APS race-test runner | in-process Map | `RevocationStorage` interface | [aeoess/agent-passport-system@20de7e9](https://github.com/aeoess/agent-passport-system/blob/main/tests/race-test-revocation.ts) |

### 3.1 Methodology shape

4 workers × 500 qps × 3 seconds × 3 runs = 18,000 requests per implementation. Revocation fires at the midpoint of each run (1500ms in). The metric is the time between revocation commit and the last ACCEPT the gate emits for the revoked delegation. The headline numbers reported are P50, P95, P99, and MAX of that distribution across all 18,000 requests.

**Run commands.**

- APS race-test runner: `npx tsx tests/race-test-revocation.ts` from a clean checkout of `agent-passport-system` at commit `20de7e9` or later.
- audit-pack-signing v0.5 race-test: per VeloGerber's #31 May 6 post, the SQLite WAL race-test fixture runs against any captured.db conforming to the v0.5 §12 schema. Spec and reference fixture published with sha `c5f62c9fce6e08b5`.

### 3.2 What this proves

Methodology portability across two independent substrates is the load-bearing claim. The in-process Map substrate (APS race-test runner) and the SQLite WAL multi-process substrate (audit-pack-signing v0.5) are different along every dimension: process model, persistence layer, concurrency primitive, network exposure. The headline numbers reproduce across both: P50/P95/P99/MAX = 0.00ms, zero ACCEPTs after revocation commit, across 18,000 requests per implementation.

Numbers reproducing across two substrates means the dimension measures the methodology. The substrate is incidental to the result. A single-substrate result is open to the objection that the headline numbers are an artifact of the chosen backend. Two substrates with identical numbers close that objection.

### 3.3 Reproduction kit

Reviewers can re-run from a clean checkout in under five minutes.

**APS race-test runner.**
```
git clone https://github.com/aeoess/agent-passport-system
cd agent-passport-system
npm install
npx tsx tests/race-test-revocation.ts
```
Output writes to stdout with per-run breakdown and aggregate percentiles. The Day 80 baseline (signed) is at `tests/race-test-revocation-results-2026-05-07.txt` for byte-comparison.

**audit-pack-signing v0.5 §12 race-test.** VeloGerber's fixture is published with the v0.5 spec; reviewers run it against any SQLite WAL store conforming to the §12 schema. Cite the spec sha (`c5f62c9fce6e08b5`) and the run-shape parameters in any tier claim that uses this implementation as the methodology citation.

The implementation may layer additional analytics on top of the dimension. Cross-tenant aggregates, drift detection, lineage visualization, and decision-equivalence services are out of scope for the working text.

(TBD v0.2: third-substrate reproduction, Nobulex first per the [#31 substrate-ordering recommendation](https://github.com/OWASP/www-project-artificial-intelligence-vulnerability-scoring-system/issues/31).)

---

## 4. Composition rules

The four dimensions compose into a single enforcement-effectiveness score. The rules below capture the load-bearing structure: which axis dominates, what the false-security configuration looks like, and how `enforcement_locus` qualifies the other three.

### 4.1 Structural axis dominates

A composite score with structural-low and any other axes high stays at asserted-only at the composite level. The cryptographic gate is the precondition for any time-to-enforce or block-rate claim being meaningful. An asserted-only gate with high block-rate over a measured window has a coverage claim. Coverage does not promote to enforcement without a structural floor. The next config drift restores the original threat surface, regardless of how high the latency or block-rate numbers were on the day of measurement.

In rubric terms: structural-enforcement = asserted-only collapses the composite score to the asserted-only floor, with no upgrade path until the structural axis crosses to cryptographic-gate.

### 4.2 Three-axis composition with #32 §3.2 multiplier

The composite reads: `structural × empirical block-rate × time-to-enforce`, with the structural axis carrying the #32 §3.2 cryptographic-enforcement multiplier (×1.0 or ×2.0). The other two axes enter as continuous values that scale the composite within the band the structural multiplier sets.

The 2×2×2 cube has eight cells. Two axes (block-rate and time-to-enforce) at high with structural at asserted-only is the cell §4.3 catches. Structural at cryptographic-gate with both other axes at low is the "we have a floor and we know we have coverage gaps" cell, which is honestly worse than the false-security cell on numbers but better on threat-model. The dominant cell is structural × measured-effective × fast: structural floor, high block-rate, time-to-enforce inside the user-action distribution.

### 4.3 The false-security quadrant

The configuration reviewers should specifically catch: high block-rate, low latency, asserted-only.

This configuration looks safer than asserted-only with high latency. The block-rate is high; the latency is low; the numbers are flattering. The long-tail failure mode (gate-process is the threat) is identical to any asserted-only gate. Prompt injection, context drift, malformed plans: all collapse the gate the same way. The high block-rate captures coverage in normal operation. The low latency means the coverage is fast in normal operation. Neither captures what happens when the agent process is the adversary.

A v1.0 reviewer assigning the composite tier should treat high-block-rate + low-latency + asserted-only as a partial posture. Lower latency on an asserted-only gate is a refinement at the surface. The structural floor still does not exist. Latency is a refinement only above the structural floor.

### 4.4 Enforcement_locus is independent

The 3-axis score is per-locus. A vendor-locus high tier and a customer-locus high tier are different threat-model arithmetic even when the structural, block-rate, and time-to-enforce numbers match. Vendor-locus compounds vendor-side compromise into customer-side outcome. Customer-locus does not, given the §5.3 preconditions hold. The locus value qualifies the composite tier. It does not rank one posture above another.

Concretely: a vendor publishing `enforcement_locus = customer` with high tier on the other three axes carries a residual risk profile that depends on the §5.3 precondition set holding. A vendor publishing `enforcement_locus = vendor` with the same headline numbers carries a residual risk profile that depends on the customer's audit-trail right being honored end-to-end. Neither posture is universally superior; both are panel-ready when the receipts and preconditions are verifiable.

---

## 5. `enforcement_locus` enum semantics with threat-model preconditions

### 5.1 Enum values and when each applies

- **`customer`**: enforcement boundary lives in the customer's infrastructure; vendor sees outputs only after the customer's gate has run. Applies when the customer runs the gate as a process or service inside their own trust boundary, and the vendor has no read or write access to the gate's decision state. Common shapes: customer-deployed enforcement layer at a network edge, customer-controlled SaaS-in-customer-account deployment, customer-side proxy with vendor-supplied policy bundles.
- **`vendor`**: enforcement boundary lives in the vendor's infrastructure; customer sends inputs to the vendor and trusts the vendor's gate. Applies when the customer's request reaches the vendor before the gate decision is taken. Common shapes: SaaS-hosted scoring, network-side prompt rewriting, vendor-hosted policy evaluation, managed-gateway products. The customer's audit-trail right is the load-bearing protection.
- **`hybrid`**: composition. Customer enforces some axes, vendor enforces others; both must declare which classes run where. Applies when the gate decision requires steps in both trust boundaries (e.g., customer-side scope evaluation feeding a vendor-side cryptographic gate). The split is itself a documented contract.

### 5.2 Threat-model deltas per value

**`customer`.** Vendor-trust dependency is minimized because the gate decision does not transit the vendor's substrate. The threat model centers on the customer's own infrastructure: the gate process integrity, the substrate hosting the gate, the network path from the agent to the gate, the policy bundle the gate uses. A high-tier `customer` claim implicitly asserts that the vendor cannot read or alter customer-side enforcement state. The §5.3 preconditions make that assertion verifiable.

**`vendor`.** The customer accepts the vendor's gate as part of the trust boundary. Vendor-side compromise propagates to customer-side outcome. The protective surface is the audit-trail right: the customer can verify offline that the vendor's gate refused or admitted each action, signed by a key the customer trusts. A high-tier `vendor` claim requires (a) the gate's signing key to be customer-verifiable, (b) the audit log to be customer-readable in real time or near real time, and (c) a published incident-disclosure contract that pins the vendor's obligations when gate behavior deviates from the published policy.

**`hybrid`.** Threat model decomposes by enforcement class. Each class declares its locus, and the threat-model delta for that class follows the corresponding `customer` or `vendor` semantics above. The dimension's tier on a hybrid claim is the minimum across classes: a hybrid posture with one customer-locus class at high tier and one vendor-locus class at low tier composites at the low-tier value across the hybrid claim.

### 5.3 Preconditions for `enforcement_locus = customer` claims

A vendor claiming `enforcement_locus = customer` is implicitly asserting that the vendor cannot read or alter customer-side enforcement state. Making that assertion explicit as a precondition keeps the dimension structurally clean (the dimension does not grow a fifth axis) while giving panel reviewers concrete checks. Reviewers verify the preconditions; they do not take the locus value on trust.

The high tier of any `enforcement_locus = customer` claim asserts:

1. **Multi-tenant isolation.** Per-customer process or namespace boundary, with operator-A bearer unable to read operator-B's enforcement state across any vendor-side endpoint that exposes operator data. Verification path: signed configuration attestation OR penetration-test result covering cross-tenant reads on the vendor's registry, anomaly, audit, and metering surfaces.

2. **HMAC rotation discipline.** Webhook-signing or auth secrets rotate on a documented cadence with a two-secret window (PRIMARY and PREVIOUS), accept-either during rollover, validity overlap window published. Verification path: rotation log entries with a signed attestation that the rotation cadence has been honored over the past N rotations.

3. **Service-account allowlist.** Vendor-internal service accounts authorized to write the enforcement decision log are documented and bound to a published IP allowlist (loopback-default with explicit CIDR override, fail-closed on configuration error). Verification path: IAM policy snapshot plus signed attestation covering the service-account roster and the allowlist contents.

4. **Per-source-IP rate limiting.** Cap on enforcement-decision write requests per source IP (sliding-window counter, deque-bounded per-IP buckets, periodic GC of empty buckets). Verification path: rate-limiter configuration snapshot plus a sample of receipts from the receipt-stream demonstrating the limit holds under load.

Each precondition has a one-line verification path describing what a reviewer would ask for to confirm the customer-locus claim. Reviewers verify the precondition set against the vendor's published artifacts. The locus value is not honored on trust.

These preconditions surfaced through OWASP AIVSS #31 as the verification-path framing for vendor `enforcement_locus = customer` claims. Each precondition is testable, signed, and reproducible by a reviewer reading the vendor's receipt stream.

### 5.4 Preconditions for `enforcement_locus = vendor` claims

(TBD v0.1 follow-up: parallel preconditions for vendor-side enforcement, focused on the customer's audit-trail right. Likely shape: customer-verifiable signing key, customer-readable audit log with bounded staleness, published incident-disclosure contract.)

### 5.5 Preconditions for `enforcement_locus = hybrid` claims

(TBD v0.1 follow-up: each enforcement class declares its locus and inherits the corresponding precondition set. Composite tier is the minimum across classes.)

---

## 6. Receipt shapes

(TBD v0.1 follow-up: canonical receipt shape for each tier in each dimension. Reviewers verify a vendor's claim by validating the receipt shape, the signature, and the methodology citation.)

---

## 7. Cross-implementation methodology

(TBD v0.1 follow-up: protocol for adding a third or fourth implementation. The `RevocationStorage` interface in the APS SDK and the SQLite WAL store in audit-pack-signing v0.5 are the two reference backends. Any third-substrate implementation must conform to a documented adapter shape and produce a results table with the same headline columns.)

---

## Open questions for v0.1 review

1. Do we want the receipt shape to be canonicalized via JCS (RFC 8785), or do we leave canonicalization scheme as a per-implementation choice?
2. Is the structural-axis multiplier always ×2.0, or does the AIVSS v1.0 rubric allow it to vary per-dimension-family?
3. For `enforcement_locus = hybrid`, is there a required minimum precondition coverage, or is the per-class declaration sufficient?
4. The empirical block-rate tier thresholds in §2.1 (high ≥ 0.95, medium ≥ 0.80) are placeholder values. Confirm with #32 RMF authors before v0.2.

---

## References

- [OWASP AIVSS #31, Runtime Enforcement Effectiveness as a Scoring Dimension](https://github.com/OWASP/www-project-artificial-intelligence-vulnerability-scoring-system/issues/31)
- OWASP AIVSS #32 §3.2, cryptographic-enforcement multiplier
- audit-pack-signing v0.5 §12, revocation cache coherency, race-test fixture sha `c5f62c9fce6e08b5`
- [APS race-test runner](https://github.com/aeoess/agent-passport-system/blob/main/tests/race-test-revocation.ts), in-process Map substrate
- [APS race-test results, Day 80 baseline](https://github.com/aeoess/agent-passport-system/blob/main/tests/race-test-revocation-results-2026-05-07.txt)
