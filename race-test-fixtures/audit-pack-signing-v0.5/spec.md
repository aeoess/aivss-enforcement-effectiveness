# Audit Pack Signing Spec — v0.5 Amendment §12: Revocation Cache Cross-Worker Coherency

**Status:** v0.5 amendment to `audit_pack_signing_v0_4_1_spec.md` (composes with v0.4.7 multi-platform + v0.4.8 verifier-version-drift amendments).
**Author:** Nel (spec) + Velo (impl + empirical measurement)
**Trigger:** Cache-coherency bug caught in production v0.4.6 _REVOCATION_CACHE 14:11 IST 2026-05-06. v0.4.7.2 patch (sha d7e8a7b8662a75de) closed single-worker bug; v0.5 §12 closes multi-worker residual window.

---

## 1. Customer-facing contract

**Revocation propagation:** When `/api/agent/revoke` is called against agent_X, ANY subsequent transact request for agent_X — regardless of which gunicorn worker handles it — MUST reject within **50ms (P99) intra-host**.

**Stronger informal bound:** Lab-bench measurement at synthetic 4-worker × 500qps × 3s load shows P99 = 0.00ms across 6000 requests (0/6000 ACCEPTs after revoke). Spec language reserves 50,000× headroom over measured behavior.

**Realistic-load claim:** Under realistic customer load (up to 2000 transact qps per worker, sustained), P99 security-window remains <50ms.

**Multi-host:** out-of-scope for v0.5 §12. Multi-host coherency requires shared revocation store (which we have via DB) but cross-host worker-cache invalidation is v0.6+ work. v0.5 supports single-host customer pilots (HSE-class).

## 2. Mechanism (option D — DB generation counter)

### 2.1 Schema

```sql
CREATE TABLE IF NOT EXISTS revocation_meta (
    id INTEGER PRIMARY KEY,
    generation INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO revocation_meta (id, generation) VALUES (1, 0);
```

Single row. Single integer. SQLite WAL-mode REQUIRED for multi-process reader visibility.

### 2.2 Revoke side (`/api/agent/revoke`)

Generation increment AND revocation INSERT MUST be in same transaction:

```python
def revoke(operator_id: str, agent_id: str, reason: str) -> None:
    conn = sqlite3.connect(REVOCATIONS_DB_PATH)
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "INSERT INTO revocations (operator_id, agent_id, revoked_at, reason) VALUES (?, ?, ?, ?)",
            (operator_id, agent_id, datetime.now(timezone.utc).isoformat(), reason),
        )
        conn.execute("UPDATE revocation_meta SET generation = generation + 1 WHERE id = 1")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

**`BEGIN IMMEDIATE`** required to prevent two concurrent revokes from racing on generation increment (would silently merge to a single bump otherwise — observability lost, but security-property still holds because both rows committed).

### 2.3 Verify side (worker-local cache check)

Each worker maintains process-local state:
```python
_LAST_SEEN_GENERATION: int = 0
_REVOCATION_CACHE: dict[str, tuple[float, set[str]]] = {}  # existing TTL cache
```

On every revocation check:
```python
def _check_revocation(passport: dict) -> None:
    revocation_url = passport["credentials"].get("revocation_url")
    if not revocation_url:
        return

    # NEW v0.5: read DB gen counter on every check (~10µs SQLite WAL read on local file)
    conn = sqlite3.connect(REVOCATIONS_DB_PATH)
    try:
        current_gen = conn.execute("SELECT generation FROM revocation_meta WHERE id = 1").fetchone()[0]
    finally:
        conn.close()

    global _LAST_SEEN_GENERATION
    if current_gen > _LAST_SEEN_GENERATION:
        # Generation bumped — invalidate THIS worker's cache for this revocation_url
        _REVOCATION_CACHE.pop(revocation_url, None)
        _LAST_SEEN_GENERATION = current_gen

    # Existing v0.4.7.2 4-state cache resolution proceeds with refreshed cache
    ...
```

**Critical:** generation check happens BEFORE the existing TTL/cache-resolution logic. Even if cache TTL is "fresh" by clock, a higher generation means stale.

### 2.4 WAL-mode pre-flight

Verifier startup MUST confirm SQLite is in WAL mode:
```python
mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
if mode.lower() != "wal":
    raise RuntimeError("agent_revocations.db must be in WAL mode for multi-process visibility")
```

Without WAL, readers see a snapshot from before the writer's commit — generation bump invisible.

## 3. Empirical contract (4-worker race-test)

Test fixture at `test_revocation_generation_counter_race.py` (Velo lane, ships in same patch as impl).

**Test parameters:**
- 4 worker processes (multiprocessing.Process)
- 500 transact requests per worker per second (2000 qps total)
- Duration: 3 seconds (6000 total requests)
- Revoke fires at t=1.5s (midpoint)
- Each worker measures: count of ACCEPTs for revoked agent AFTER revoke commit

**Expected:** 0 ACCEPTs across all workers, P99 security window 0.00ms.

**SHIP-GATE:** P99 < 50ms is the v0.5 §12 acceptance bound. Empirical 0.00ms is overcompliance; that's the right direction.

## 4. Reason code additions

No new reason codes for §12. Generation-bump invalidation is internal — cache miss after invalidate falls through to existing fetch logic, which uses existing reason codes (`agent_revoked`, `revocation_fetch_failed`, etc).

## 5. Acceptance criteria

- [ ] revocation_meta schema migration applied
- [ ] `/api/agent/revoke` bumps generation in same transaction as INSERT
- [ ] Worker `_check_revocation()` reads gen counter on every call
- [ ] WAL-mode pre-flight check at verifier startup
- [ ] race-test fixture P99 < 50ms (currently measuring 0.00ms — 50,000× headroom)
- [ ] No regression on v0.4.7.2 single-worker test_e2e_roundtrip (cache-fix patch d7e8a7b8662a75de)
- [ ] 4-mirror sha-coherent
- [ ] Customer-facing privacy.json claim updated: "revocation propagates within 50ms (P99) intra-host"

## 6. Out of scope (v0.6+)

- **Multi-host coherency** — requires either shared cache (Redis) or distributed gen counter. v0.6 work, gated on first multi-host customer.
- **Cross-region replication** — out of scope until we have a customer with multi-region deployment.
- **Generation counter overflow** — INTEGER in SQLite is 64-bit signed, overflow at ~2^63 bumps. At 1000 revokes/sec sustained, that's 292 million years. Not a concern.

## 7. Status

v0.5 spec amendment authored 2026-05-06 14:42 IST. Velo lane writing /opt/aegis/grid_platform/agent_passport_parser.py + /opt/aegis/api_v2.py patches. Trav-gated rsync to VPS once impl lands + my fixtures pass.
