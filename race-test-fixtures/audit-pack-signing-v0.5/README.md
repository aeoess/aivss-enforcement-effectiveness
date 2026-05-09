# Audit-Pack-Signing v0.5 §12 — Race-Test Fixture

Reference fixture for the empirical contract in
`spec.md §3` (cross-worker revocation cache coherency under SQLite WAL +
DB generation counter mechanism).

This fixture is the citation target referenced as sha
`c5f62c9fce6e08b55dab6dfbc8caa0196af61db1eddd0046b43dfa21c9261f28`
(short form: `c5f62c9fce6e08b5`) in the AIVSS enforcement-effectiveness
working text.

## Files

- `spec.md` — canonical spec amendment (sha matches above)
- `race_test_runner.py` — pure-stdlib portable race test runner
- `README.md` — this file

## What the fixture proves

The four-axis tier table in `WORKING-TEXT.md §1.1–1.4` requires reproducible
empirical receipts. For the **time-to-enforce** dimension (revocation
propagation across worker processes), the spec bound is **P99 < 50ms intra-host**.

The runner exercises the mechanism described in `spec.md §2`:
- 4 worker processes, 500 qps each (2000 qps total)
- SQLite WAL-mode database with `revocation_meta(id, generation)` row
- Revoke fires at t=1.5s; bumps generation in same transaction as INSERT
- Each worker reads generation counter on every check; cache invalidation on bump

## Reproducing

```sh
python3 race_test_runner.py
# Exits 0 with 'PASS: spec-compliant' on lab-bench.
# Reports per-request decision + latency to allow custom analysis.
```

## Lab-bench measurement

On the canonical AiEGIS implementation:
- 0/6000 ACCEPTs after revoke commit
- P99 security window: 0.00ms (50,000× headroom over the 50ms spec bound)
- Reproduction runs land at the same number across retries

## Adapting to other implementations

The runner is implementation-agnostic. To measure a different revocation-cache
implementation against this contract, wrap your verify-path inside the
`worker_loop()` function and report ACCEPT/REJECT per request.

## License

Apache-2.0 (matches parent repo).
