# Multi-tenant isolation precondition — receipt-driven fixture

Reference fixture supporting §5.3 of the AIVSS enforcement-effectiveness working text. Documents the **customer-locus precondition** for time-to-enforce empirical claims: an enforcement guarantee on a multi-tenant platform is only well-defined if cross-tenant isolation is itself receipt-backed.

This fixture is operator-redacted, fingerprint-only, and sha-pinned to a CHANGELOG entry on the canonical AiEGIS registry.

## What this fixture proves

The race-test fixture at `audit-pack-signing-v0.5/` measures revocation propagation **within a single operator's bounded set of workers** (P99 < 50ms intra-host). That measurement is only meaningful if cross-operator state cannot leak between bounded sets. The customer-locus precondition (§5.3) is:

> For an enforcement claim to bind on operator A, no API surface may disclose operator B's state to caller-A without an explicit admin-role gate.

This fixture documents how that precondition was empirically established on the AiEGIS substrate via a deep-dive review that surfaced two cross-tenant info-disclosure defects, both closed atomically with regression coverage.

## CHANGELOG entry (canonical)

Repository: `aegis-registry` (canonical AiEGIS source). Source-code visibility today is **supervised-access for §5.3 reviewers** under coordinated-disclosure terms; `hello@aiegis.ie` brokers reviewer access. We expect to upgrade to public-source visibility in a future cadence; this fixture stands either way.

The CHANGELOG entry being cited (verbatim, from `CHANGELOG.md` in canonical):

> ## 2026-05-08 — Multi-tenant info-leak closure (Bug #1 + #2)
>
> ### Security
>
> Closed two cross-tenant info-disclosure bugs found in the 2026-05-08 deep-dive review.
>
> - **`/registry/operators`** — endpoint previously enumerated all registered operators with agent counts. Now returns only the authenticated operator's own row.
> - **`/registry/anomaly/alerts`** — endpoint previously surfaced threshold alerts across all operators to any authenticated caller. Now returns only the authenticated operator's alerts.

## Patch fingerprints (sha-256, mirror-verified)

Full 64-character hex digests. A reviewer with the canonical source can `shasum -a 256` each file and byte-match these values.

```
src/anomaly_baseline.py            208a4eaa3fa3c5b7f8b6693a9a89e638349c3379f058d0d3ba9cacf254f71fed
src/registry_api.py                365c8bff6b7ad5e6b22e26034938821e91c43d6c55c0490a57d768cc47b99709
tests/test_anomaly_alerts.py       dd2a49fa03405c36c94f1149a5aa69edf9f20d07346c028b663499a1167e8be3
tests/test_multi_tenant_scope.py   40be26eee5ba9a971f021c52ef6833d77a2599a217a69aa55c42345e1ce02615
```

Canonical bug report: `docs/RAV_BUG_REPORT_2026_05_08.md` — sha-256 `b93764b3cd30a79ab75b0610db4a831a0d21c6d5327b942141295950868ea2c2`.

## Operator redaction policy

- No operator IDs appear in this fixture.
- No specific tenant data, agent counts, alert thresholds, or threat-model artifacts are reproduced.
- The disclosure surface is the bug class (cross-tenant API enumeration / cross-tenant alert disclosure), not the affected tenants.
- Reviewers wanting deeper detail can request supervised access to the canonical bug report under coordinated-disclosure terms.

## Acceptance shape

For a §5.3 reviewer auditing the customer-locus precondition on the AiEGIS substrate, the verification path under supervised-access is:

1. Request reviewer access to canonical `aegis-registry` via `hello@aiegis.ie` referencing the AIVSS enforcement-effectiveness §5.3 review.
2. Receive a read-only checkout pinned to the post-fix sha. Verify the CHANGELOG entry quoted above is present byte-for-byte.
3. `shasum -a 256` each of the 4 patched files; byte-match against the fingerprints above.
4. Run `pytest tests/test_multi_tenant_scope.py` → expect 4 passing regressions covering scope-to-self plus anti-leak assertions.
5. Optionally re-run the parent race-test fixture at `audit-pack-signing-v0.5/` → its P99 < 50ms result holds within the customer-locus precondition's well-definedness scope, which this fixture documents.

If steps 2–4 hold, the time-to-enforce measurement on this substrate is precondition-clean for §5.3 purposes. When canonical source-visibility upgrades to public, steps 1–3 collapse to a `git clone` + the same `shasum -a 256` and `pytest` commands; the fingerprint-pin remains the load-bearing primitive.

## Composition

This fixture is the customer-locus precondition layer; the parent `audit-pack-signing-v0.5/` fixture is the time-to-enforce measurement layer. Both must hold for an enforcement claim on a multi-tenant substrate to be receipt-backed. Other substrates are invited to publish their own equivalents under the same acceptance shape — see the v0.2 cross-vendor reproduction roadmap.

## License

Apache-2.0 (matches parent repo).
