# aivss-enforcement-effectiveness

Working text for the **`enforcement_effectiveness` dimension family** in OWASP AIVSS v1.0.

## Scope

This repository is a focused working document on a single dimension family within OWASP AIVSS v1.0. It is **separable from the broader AIVSS v1.0 rubric**: the four rows defined here become the dimension family's spine; reviewers and vendors can adopt them independently of how AIVSS structures other axes.

**Four dimensions:**

| Dimension | Type | Source |
|---|---|---|
| Structural enforcement | binary (×1.0 / ×2.0 multiplier) | OWASP AIVSS #32 §3.2 |
| Empirical block-rate | continuous (RMF-style receipts) | OWASP AIVSS #32 §3.2 + RMF receipts |
| Time-to-enforce | tiered (rail-anchored thresholds) | [OWASP AIVSS #31](https://github.com/OWASP/www-project-artificial-intelligence-vulnerability-scoring-system/issues/31) |
| Enforcement locus | enum (customer / vendor / hybrid) | OWASP AIVSS #31 |

The composition rule is captured in [WORKING-TEXT.md](./WORKING-TEXT.md) §4: structural axis dominates; a low-latency assertion is still asserted-only (false-security quadrant), and a high-block-rate gate at the audit layer is still post-action. Only the all-three-high posture survives the long-tail config-drift case.

## Who's writing this

- **@VeloGerber / AiEGIS** — empirical block-rate receipts, time-to-enforce dimension, gateway-side threat-model surface
- **@aeoess / APS by AEOESS** — APS-side reciprocal race-test reproduction (in-process Map substrate vs SQLite WAL multi-process), structural-axis composition framing, `enforcement_locus` enum semantics
- **OWASP AIVSS #32 contributors** — invited; commit-rights on structural-axis sections

If you contributed to AIVSS #31 or #32 and want to be added, open an issue or PR.

## Cadence

| Version | Target | Contents |
|---|---|---|
| v0.1 | within 5 working days of repo open (target 2026-05-15) | Definitions, tier criteria, two reference implementations cited as portability evidence, composition rules, `enforcement_locus` semantics + threat-model preconditions |
| v0.2 | within 14 working days of v0.1 publish | + Nobulex third-implementation reproduction (substrate diversity beyond in-process Map / SQLite WAL) |
| v0.3 (optional) | gated on Nobulex landing clean + panel feedback | + AgentID fourth-implementation reproduction |

asqav and Mycelium parked as candidates for v0.4+ if v1.0 reviewers want a fifth substrate before the panel.

## Reference implementations cited as portability evidence

Both implementations run the same race-test methodology shape (4 workers × 500 qps × 3 seconds × 3 runs = 18,000 requests; revocation fires at run midpoint; measure time from revocation commit to last ACCEPT for the revoked delegation). Both produce P50/P95/P99/MAX = 0.00ms across all percentiles with zero ACCEPTs after revocation commit.

| Implementation | Substrate | Backend | Source |
|---|---|---|---|
| audit-pack-signing v0.5 §12 | SQLite WAL (multi-process) | network-backed | sha `c5f62c9fce6e08b5` |
| APS race-test runner | in-process Map | `RevocationStorage` interface | [aeoess/agent-passport-system@20de7e9](https://github.com/aeoess/agent-passport-system/blob/main/tests/race-test-revocation.ts) |

Methodology portability across substrates is the load-bearing claim that makes the dimension panel-ready: the same race-test shape produces identical headline numbers across two independent backends.

## How to engage

- **Open an issue** to propose a dimension refinement, raise a tier-criterion question, or surface a third-implementation candidate.
- **Open a PR** against [WORKING-TEXT.md](./WORKING-TEXT.md) for direct edits.
- **Standards-body discussion** stays on [OWASP AIVSS #31](https://github.com/OWASP/www-project-artificial-intelligence-vulnerability-scoring-system/issues/31) and #32 for cross-axis composition; this repo is the citable artifact.

## License

Apache-2.0. Same as APS, audit-pack-signing v0.5, and the AIVSS canonical text.
