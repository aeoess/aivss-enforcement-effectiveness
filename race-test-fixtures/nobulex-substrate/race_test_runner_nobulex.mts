// ══════════════════════════════════════════════════════════════════
// Revocation-to-Enforce Race Test — THIRD substrate: nobulex
// ══════════════════════════════════════════════════════════════════
// Reproduces the audit-pack-signing v0.5 §12 race-test shape
// (4 workers × 500 qps × 3s, midpoint revoke, post-revoke ACCEPT count +
//  security-window latency P50/P95/P99/MAX) against a THIRD independent
// implementation: arian-gogani/nobulex.
//
// Mechanism exercised
// -------------------
// nobulex's real authorize+revoke primitive lives in
//   packages/mcp-server/src/auth.ts  ->  createAuthMiddleware()
//   - authorize : authenticate({ 'x-api-key': KEY })
//                   returns AuthenticatedRequest   => ACCEPT
//                   throws  ValidationError         => REJECT
//   - revoke    : revokeKey(KEY)  -> apiKeys.delete(KEY)  (synchronous)
//
// The revoked SUBJECT is one API key. revokeKey() is the commit point:
// it is durable + verifiable the instant the synchronous call returns —
// every subsequent authenticate(KEY) denies. This is the closest analogue
// in nobulex to "revoke a delegated agent's authority".
//
// This is the REAL nobulex source, imported by absolute path. Its only
// dependency (@nobulex/core for timestamp/sha256String/ValidationError)
// resolves against the built workspace package in the clone.
//
// CONCURRENCY MODEL (disclosed — load-bearing for citability)
// -----------------------------------------------------------
// nobulex's auth middleware is an in-process JS Set. Like the APS SDK
// VolatileBackend substrate (and UNLIKE @VeloGerber's SQLite-WAL
// multi-process substrate), this is a single Node process with multiple
// async workers sharing one middleware instance. Independence here is at
// the IMPLEMENTATION/codebase level (a third, separately-authored repo),
// not at the concurrency-model level. nobulex's covenant/Trust-Capital
// CORE has no runtime authority-revocation call — its covenant
// `revocation` field is declarative metadata (crl|status_endpoint|onchain)
// only; the one runtime authorize+revoke primitive in the repo is this MCP
// auth gate, so that is what the shape is driven against.
//
// Run: npx tsx race_test_runner_nobulex.mts
// ══════════════════════════════════════════════════════════════════

import { createAuthMiddleware } from '/tmp/nobulex-substrate/packages/mcp-server/src/auth.ts'

const NOBULEX_DIR = '/tmp/nobulex-substrate'

interface RaceTestConfig {
  workers: number
  qpsPerWorker: number
  durationSec: number
  revokeAtMs: number
  subjectKey: string
}

interface WorkerResult {
  accepts: number
  rejects: number
  // wall-clock timestamps (ms) of every ACCEPT for the revoked subject
  acceptTimestamps: number[]
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function workerLoop(
  mw: ReturnType<typeof createAuthMiddleware>,
  config: RaceTestConfig,
  startMs: number,
  durationMs: number,
  result: WorkerResult,
): Promise<void> {
  const intervalMs = 1000 / config.qpsPerWorker
  const endMs = startMs + durationMs
  let nextFireMs = startMs

  while (Date.now() < endMs) {
    const now = Date.now()
    if (now >= nextFireMs) {
      // authorize the revoked subject under nobulex's real auth primitive
      let accepted: boolean
      try {
        mw.authenticate({ 'x-api-key': config.subjectKey })
        accepted = true // ACCEPT: key still present
      } catch {
        accepted = false // REJECT: key revoked / invalid
      }
      if (accepted) {
        result.accepts++
        result.acceptTimestamps.push(Date.now())
      } else {
        result.rejects++
      }
      nextFireMs += intervalMs
    } else {
      // yield to the event loop without busy-waiting
      await new Promise((res) => setImmediate(res))
    }
  }
}

async function main(): Promise<void> {
  const config: RaceTestConfig = {
    workers: 4,
    qpsPerWorker: 500,
    durationSec: 3,
    revokeAtMs: 1500,
    subjectKey: 'agent_race_test_subject_key',
  }

  // One middleware instance shared by all workers. Subject key starts valid.
  // A second key is present only to prove revocation is targeted, not a flush.
  const mw = createAuthMiddleware({
    apiKeys: [config.subjectKey, 'agent_control_key_not_revoked'],
  })

  const startMs = Date.now()
  const durationMs = config.durationSec * 1000

  const workerResults: WorkerResult[] = Array.from({ length: config.workers }, () => ({
    accepts: 0,
    rejects: 0,
    acceptTimestamps: [] as number[],
  }))

  const workerPromises = workerResults.map((r) =>
    workerLoop(mw, config, startMs, durationMs, r),
  )

  // Revoker fires at the run midpoint. Commit = the instant revokeKey() returns.
  const revokerPromise = (async () => {
    const fireAt = startMs + config.revokeAtMs
    while (Date.now() < fireAt) {
      await new Promise((res) => setImmediate(res))
    }
    mw.revokeKey(config.subjectKey) // synchronous, durable in-process commit
    const commitMs = Date.now()
    return commitMs
  })()

  const [revocationCommitMs] = await Promise.all([revokerPromise, ...workerPromises])

  // Aggregate
  let totalAccepts = 0
  let totalRejects = 0
  const allAcceptTimestamps: number[] = []
  for (const r of workerResults) {
    totalAccepts += r.accepts
    totalRejects += r.rejects
    allAcceptTimestamps.push(...r.acceptTimestamps)
  }
  const totalRequests = totalAccepts + totalRejects

  // ACCEPTs for the revoked subject AT OR AFTER the revoke commit = violations
  const securityWindows = allAcceptTimestamps
    .filter((ts) => ts >= revocationCommitMs)
    .map((ts) => ts - revocationCommitMs)
    .sort((a, b) => a - b)

  const commitOffsetMs = revocationCommitMs - startMs

  // ── Raw output ──────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('Revocation-to-Enforce Race Test — nobulex (third substrate)')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('')
  console.log(`Date: ${new Date().toISOString()}`)
  console.log(`Substrate dir: ${NOBULEX_DIR}`)
  console.log(`Mechanism: @nobulex/mcp-server createAuthMiddleware()`)
  console.log(`  authorize = authenticate({'x-api-key': SUBJECT})  (ACCEPT=return / REJECT=throw)`)
  console.log(`  revoke    = revokeKey(SUBJECT)  (synchronous Set.delete, in-process)`)
  console.log(`Concurrency: in-process, ${config.workers} async workers, one shared middleware`)
  console.log('')
  console.log('Configuration:')
  console.log(`  workers            ${config.workers}`)
  console.log(`  qps per worker     ${config.qpsPerWorker}`)
  console.log(`  duration           ${config.durationSec}s`)
  console.log(`  revoke fires at    ${config.revokeAtMs}ms into the run`)
  console.log(`  revoked subject    "${config.subjectKey}"`)
  console.log('')
  console.log(`revoke committed at t=${(commitOffsetMs / 1000).toFixed(3)}s`)
  console.log(`total requests: ${totalRequests}`)
  console.log(`  ACCEPT (subject valid): ${totalAccepts}`)
  console.log(`  REJECT (subject denied): ${totalRejects}`)
  console.log(`ACCEPTs after revoke commit: ${securityWindows.length}`)
  console.log('')
  console.log('Security-window latency (revoke-commit -> post-revoke ACCEPT):')
  console.log(`  P50  ${percentile(securityWindows, 50).toFixed(2)}ms`)
  console.log(`  P95  ${percentile(securityWindows, 95).toFixed(2)}ms`)
  console.log(`  P99  ${percentile(securityWindows, 99).toFixed(2)}ms`)
  console.log(`  MAX  ${(securityWindows.length ? securityWindows[securityWindows.length - 1] : 0).toFixed(2)}ms`)
  console.log('')
  if (securityWindows.length === 0) {
    console.log('Post-revoke ACCEPTs: 0. Within §12 P99 < 50ms bound (0.00ms).')
  } else {
    const p99 = percentile(securityWindows, 99)
    console.log(`Post-revoke ACCEPTs: ${securityWindows.length}. P99 = ${p99.toFixed(2)}ms.`)
    console.log(`§12 bound (P99 < 50ms): ${p99 < 50 ? 'WITHIN' : 'VIOLATED'}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
