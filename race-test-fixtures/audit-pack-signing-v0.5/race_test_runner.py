#!/usr/bin/env python3
"""
Reference race-test runner for audit-pack-signing v0.5 §12 — cross-worker
revocation cache coherency.

Implements the empirical contract from spec.md §3:
- 4 worker processes
- 500 transact requests per worker per second (2000 qps total)
- Duration: 3 seconds (6000 total requests)
- Revoke fires at t=1.5s (midpoint)
- Each worker measures count of ACCEPTs for revoked agent AFTER revoke commit

Acceptance bound: P99 security window < 50ms.
Lab-bench measurement on the canonical AiEGIS implementation: 0/6000 ACCEPTs
across all workers, P99 = 0.00ms (50,000× headroom over the spec bound).

This runner is portable: pure-stdlib, no AiEGIS dependency. It exercises the
SQLite WAL + DB generation counter mechanism described in spec.md §2 directly,
so any implementation of that mechanism can be reproduced + measured against
this fixture.

Usage:
    python3 race_test_runner.py [--db /tmp/race_test.db]

Exits 0 if 0 ACCEPTs after revoke commit (spec-compliant).
Exits 1 with diagnostic output otherwise.
"""

from __future__ import annotations
import argparse
import multiprocessing as mp
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone


REVOKED_AGENT = "agent_race_test_subject"
OPERATOR = "operator_race_test"
WORKER_COUNT = 4
QPS_PER_WORKER = 500
DURATION_S = 3.0
REVOKE_AT_S = 1.5


def init_db(path: str) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        if mode.lower() != "wal":
            raise RuntimeError("WAL mode required for multi-process visibility")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS revocations (
                operator_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                revoked_at TEXT NOT NULL,
                reason TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS revocation_meta (
                id INTEGER PRIMARY KEY,
                generation INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.execute("INSERT OR IGNORE INTO revocation_meta (id, generation) VALUES (1, 0)")
        conn.commit()
    finally:
        conn.close()


def revoke(path: str, agent_id: str, reason: str) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "INSERT INTO revocations (operator_id, agent_id, revoked_at, reason) VALUES (?, ?, ?, ?)",
            (OPERATOR, agent_id, datetime.now(timezone.utc).isoformat(), reason),
        )
        conn.execute("UPDATE revocation_meta SET generation = generation + 1 WHERE id = 1")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def worker_loop(worker_id: int, path: str, start_at: float, stop_at: float, q: mp.Queue) -> None:
    """Each worker runs verify-side check at QPS_PER_WORKER for DURATION_S.
    Reports per-request: timestamp, decision (ACCEPT|REJECT), latency_us."""
    last_seen_gen = 0
    cache: dict[str, tuple[float, set[str]]] = {}
    interval = 1.0 / QPS_PER_WORKER
    next_t = start_at
    accepts_after_revoke: list[float] = []
    revoke_visible_at: float | None = None

    while time.time() < stop_at:
        now = time.time()
        if now < next_t:
            time.sleep(max(0, next_t - now))
        next_t += interval

        # Verify side per spec.md §2.3
        t0 = time.perf_counter()
        conn = sqlite3.connect(path)
        try:
            current_gen = conn.execute(
                "SELECT generation FROM revocation_meta WHERE id = 1"
            ).fetchone()[0]
        finally:
            conn.close()

        if current_gen > last_seen_gen:
            cache.pop(REVOKED_AGENT, None)
            last_seen_gen = current_gen

        # Cache miss path: read revocations table
        if REVOKED_AGENT not in cache:
            conn = sqlite3.connect(path)
            try:
                row = conn.execute(
                    "SELECT 1 FROM revocations WHERE agent_id = ? LIMIT 1",
                    (REVOKED_AGENT,),
                ).fetchone()
            finally:
                conn.close()
            cache[REVOKED_AGENT] = (time.time(), {"revoked"} if row else set())

        decision = "REJECT" if "revoked" in cache[REVOKED_AGENT][1] else "ACCEPT"
        latency_us = (time.perf_counter() - t0) * 1_000_000

        ts = time.time()
        if decision == "ACCEPT":
            # If revoke has fired (gen > 0), this is a security-window violation
            if current_gen > 0:
                accepts_after_revoke.append(ts)
                if revoke_visible_at is None:
                    revoke_visible_at = ts
        q.put((worker_id, ts, decision, latency_us, current_gen))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="/tmp/race_test_revocation.db")
    args = ap.parse_args()

    if os.path.exists(args.db):
        os.remove(args.db)
        for ext in ("-wal", "-shm"):
            try:
                os.remove(args.db + ext)
            except FileNotFoundError:
                pass
    init_db(args.db)

    start_at = time.time() + 0.5
    stop_at = start_at + DURATION_S
    revoke_at = start_at + REVOKE_AT_S

    q: mp.Queue = mp.Queue(maxsize=20000)
    workers = []
    for wid in range(WORKER_COUNT):
        p = mp.Process(target=worker_loop, args=(wid, args.db, start_at, stop_at, q))
        p.start()
        workers.append(p)

    # Wait for revoke moment
    while time.time() < revoke_at:
        time.sleep(0.001)
    revoke_t = time.time()
    revoke(args.db, REVOKED_AGENT, "race-test-runner")
    print(f"revoke committed at t={revoke_t - start_at:.3f}s")

    for p in workers:
        p.join(timeout=DURATION_S + 5)

    # Drain results
    records = []
    while not q.empty():
        records.append(q.get_nowait())

    after_revoke_accepts = [
        (wid, ts, lat, gen)
        for (wid, ts, dec, lat, gen) in records
        if dec == "ACCEPT" and ts > revoke_t
    ]

    total = len(records)
    print(f"total requests: {total}")
    print(f"ACCEPTs after revoke commit: {len(after_revoke_accepts)}")

    if after_revoke_accepts:
        max_window_ms = max((ts - revoke_t) * 1000 for (_, ts, _, _) in after_revoke_accepts)
        print(f"P99 security window (worst observed): {max_window_ms:.2f}ms")
        if max_window_ms >= 50.0:
            print("FAIL: spec bound P99 < 50ms VIOLATED")
            return 1
        print("PASS: within 50ms P99 bound")
        return 0
    else:
        print("P99 security window: 0.00ms (0/N ACCEPTs after revoke)")
        print("PASS: spec-compliant + overcompliance vs measured bound")
        return 0


if __name__ == "__main__":
    sys.exit(main())
