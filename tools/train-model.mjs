#!/usr/bin/env node
/**
 * RealityOS — offline training for the workload / risk / stress models.
 *
 *   npm run train                      # train on the simulated cohort
 *   npm run train -- --real data/outcomes.json
 *
 * WHY THIS EXISTS
 * ---------------
 * The product needs a *real* ML component, not a hard-coded table pretending to
 * be one. Because RealityOS has no historical user data on day one, the model is
 * fit on a **generative cohort**: a documented, seeded process model of how work
 * actually behaves (scope inflation under complexity and dependencies, capacity
 * loss from fragmentation, unplanned overhead from low resource availability,
 * individual follow-through reliability). Labels are *sampled* from that process,
 * so logistic regression has to recover the structure from features rather than
 * being told the answer.
 *
 * This is honestly labelled everywhere it surfaces: the UI shows the model
 * version, its training source and the fact that it was trained on a simulated
 * cohort. As real recorded outcomes accumulate, per-user calibration is applied
 * at runtime (see worker/services/profile.ts) and `--real` lets the weights
 * themselves be refit on exported outcome data:
 *
 *   [
 *     { "success": 1, "deadlineMiss": 0, "stress01": 0.61,
 *       "features": { "slack": 0.42, "complexity": 0.7, ... "reliability": 0.8 } }
 *   ]
 *
 * Feature extraction is imported from src/shared/engine/features.ts, the exact
 * module the runtime uses, so training and inference can never drift apart.
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CAPACITY_FEATURES,
  STRESS_FEATURES,
  mulberry32,
  clamp,
  round3,
} from '../src/shared/engine/features.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../src/shared/ml/weights.ts')

const args = process.argv.slice(2)
const realIndex = args.indexOf('--real')
const realPath = realIndex >= 0 ? args[realIndex + 1] : null

const SEED = 20261007
const SAMPLES = 12000
const TEST_FRACTION = 0.3

/* ── generative cohort ─────────────────────────────────────────────────────── */

function gaussian(rand) {
  // Box-Muller
  const u = Math.max(1e-9, rand())
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x))
}

function generateCohort(rand) {
  const rows = []
  for (let i = 0; i < SAMPLES; i += 1) {
    const complexity = 0.15 + rand() * 0.8
    const deps = Math.round(rand() * 6)
    const deliverableCount = 2 + Math.round(rand() * 4)
    const horizonDays = 2 + rand() * 43
    const activeDaysPerWeek = 3 + Math.round(rand() * 4)
    const availableHoursPerDay = 1.5 + rand() * 4.5
    const reliability = clamp(0.72 + gaussian(rand) * 0.12, 0.35, 1)
    const fragmentation = rand() * 0.75
    const resourceAdequacy = [0.3, 0.65, 1][Math.floor(rand() * 3)] ?? 0.65
    // How much of the available hours the plan actually commits (over-commit > 1).
    const plannedFraction = 0.6 + rand() * 0.45

    // The estimator's belief about the size of the job (`requiredHours`), which
    // is what the features expose. Reality differs (below).
    const estimatedHours =
      (4 + 22 * complexity) * (1 + 0.12 * deps) * (0.85 + 0.3 * (deliverableCount - 2)) * Math.exp(gaussian(rand) * 0.25)

    // Latent truth: overhead from dependencies, coordination and low resources.
    const overhead = Math.exp(
      -0.06 +
        0.22 * fragmentation +
        0.20 * complexity +
        0.15 * (1 - resourceAdequacy) +
        (gaussian(rand) * 0.30),
    )
    const trueRequired = estimatedHours * overhead

    const effectiveDays = Math.max(1, horizonDays * (activeDaysPerWeek / 7))
    const plannedDailyHours = availableHoursPerDay * plannedFraction
    const plannedTotal =
      effectiveDays * plannedDailyHours * reliability * (1 - 0.16 * fragmentation) * Math.exp(gaussian(rand) * 0.18)

    const slack = Math.log(Math.max(0.05, plannedTotal) / Math.max(0.5, trueRequired))
    // +1.15 prior-shift: a plan that genuinely fits the available hours is usually
    // executable. Without it the cohort implies a demoralising ~36% base rate and
    // every well-sized plan would read as a coin flip.
    const pSuccess = sigmoid(2.0 * slack + 1.15 + 0.5 * (reliability - 0.72) + (gaussian(rand) * 0.15))
    const pMiss = sigmoid(
      -2.0 * slack -
        1.25 +
        1.1 * (0.15 + 0.5 * fragmentation + 0.4 * complexity + 0.15 * (1 - resourceAdequacy)) +
        gaussian(rand) * 0.15,
    )
    const stress01 = clamp(
      0.0 +
        0.30 * plannedFraction +
        0.18 * complexity +
        0.10 * Math.min(1, deps / 6) +
        0.16 * fragmentation +
        0.12 * (1 - resourceAdequacy) +
        gaussian(rand) * 0.05,
      0.02,
      0.99,
    )

    const features = {
      slack: round3(clamp(Math.log(Math.max(0.05, plannedTotal) / Math.max(0.5, estimatedHours)), -3, 3)),
      complexity: round3(complexity),
      dependencyDepth: round3(Math.min(1, (deps * deliverableCount) / 24)),
      horizon: round3(Math.min(1.4, horizonDays / 30)),
      resourceAdequacy,
      fragmentation: round3(fragmentation),
      reliability: round3(reliability),
      utilization: round3(clamp(plannedFraction, 0.2, 1.5)),
    }

    rows.push({
      features,
      success: rand() < pSuccess ? 1 : 0,
      deadlineMiss: rand() < pMiss ? 1 : 0,
      stress01,
    })
  }
  return rows
}

async function loadReal(path) {
  const raw = JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8'))
  if (!Array.isArray(raw) || raw.length < 120) {
    throw new Error(`--real needs at least 120 labelled rows, received ${Array.isArray(raw) ? raw.length : 0}`)
  }
  return raw.map((r) => ({
    features: r.features,
    success: r.success ? 1 : 0,
    deadlineMiss: r.deadlineMiss ? 1 : 0,
    stress01: clamp(Number(r.stress01 ?? 0.5), 0, 1),
  }))
}

/* ── models ────────────────────────────────────────────────────────────────── */

function standardizer(rows, features) {
  const mean = []
  const std = []
  features.forEach((f) => {
    const values = rows.map((r) => Number(r.features[f] ?? 0))
    const m = values.reduce((a, b) => a + b, 0) / values.length
    const v = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length
    mean.push(m)
    std.push(Math.sqrt(v) || 1)
  })
  return { mean, std }
}

function matrix(rows, features, stats) {
  return rows.map((r) =>
    features.map((f, i) => (Number(r.features[f] ?? 0) - stats.mean[i]) / stats.std[i]),
  )
}

function trainLogistic(X, y, { epochs = 3000, lr = 0.5, l2 = 1e-3 } = {}) {
  const n = X.length
  const d = X[0].length
  const w = new Array(d).fill(0)
  let b = 0
  for (let e = 0; e < epochs; e += 1) {
    const gw = new Array(d).fill(0)
    let gb = 0
    for (let i = 0; i < n; i += 1) {
      let z = b
      for (let j = 0; j < d; j += 1) z += w[j] * X[i][j]
      const err = sigmoid(z) - y[i]
      for (let j = 0; j < d; j += 1) gw[j] += err * X[i][j]
      gb += err
    }
    for (let j = 0; j < d; j += 1) w[j] -= lr * (gw[j] / n + l2 * w[j])
    b -= lr * (gb / n)
  }
  return { weights: w.map(round3), bias: round3(b) }
}

function trainRidge(X, y, { epochs = 3000, lr = 0.3, l2 = 1e-2 } = {}) {
  const n = X.length
  const d = X[0].length
  const w = new Array(d).fill(0)
  let b = 0
  for (let e = 0; e < epochs; e += 1) {
    const gw = new Array(d).fill(0)
    let gb = 0
    for (let i = 0; i < n; i += 1) {
      let z = b
      for (let j = 0; j < d; j += 1) z += w[j] * X[i][j]
      const err = z - y[i]
      for (let j = 0; j < d; j += 1) gw[j] += err * X[i][j]
      gb += err
    }
    for (let j = 0; j < d; j += 1) w[j] -= lr * (gw[j] / n + l2 * w[j])
    b -= lr * (gb / n)
  }
  return { weights: w.map(round3), bias: round3(b) }
}

function predict(row, model, stats) {
  let z = model.bias
  stats.mean.forEach((m, j) => {
    z += model.weights[j] * ((Number(row.features[STRESS_FEATURES[j]] ?? 0) - m) / stats.std[j])
  })
  return z
}

function evaluateLogistic(X, y, model) {
  const probs = X.map((xi) => sigmoid(xi.reduce((a, v, j) => a + v * model.weights[j], model.bias)))
  const correct = probs.filter((p, i) => (p >= 0.5 ? 1 : 0) === y[i]).length
  const brier = probs.reduce((a, p, i) => a + (p - y[i]) ** 2, 0) / probs.length
  const pos = probs.filter((_, i) => y[i] === 1)
  const neg = probs.filter((_, i) => y[i] === 0)
  let auc = 0.5
  if (pos.length && neg.length) {
    let wins = 0
    for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0
    auc = wins / (pos.length * neg.length)
  }
  return { accuracy: round3(correct / probs.length), brier: round3(brier), auc: round3(auc), positives: y.reduce((a, b) => a + b, 0) }
}

function evaluateRidge(rows, model, stats) {
  const errs = []
  for (const r of rows) {
    const z = predict(r, model, stats)
    errs.push(clamp(z, 0.02, 0.99) - r.stress01)
  }
  const mae = errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length
  const meanY = rows.reduce((a, r) => a + r.stress01, 0) / rows.length
  const sse = errs.reduce((a, e) => a + e * e, 0)
  const sst = rows.reduce((a, r) => a + (r.stress01 - meanY) ** 2, 0)
  return { mae: round3(mae), r2: round3(1 - sse / (sst || 1)) }
}

async function main() {
  const rand = mulberry32(SEED)
  const rows = realPath ? await loadReal(realPath) : generateCohort(rand)
  const source = realPath ? `recorded-outcomes:${realPath}` : 'simulated-cohort-v1'

  // Deterministic shuffle, then split.
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[rows[i], rows[j]] = [rows[j], rows[i]]
  }
  const cut = Math.floor(rows.length * (1 - TEST_FRACTION))
  const train = rows.slice(0, cut)
  const test = rows.slice(cut)

  const capStats = standardizer(train, [...CAPACITY_FEATURES])
  const stressStats = standardizer(train, [...STRESS_FEATURES])

  const successModel = trainLogistic(matrix(train, [...CAPACITY_FEATURES], capStats), train.map((r) => r.success), { lr: 0.6 })
  const missModel = trainLogistic(matrix(train, [...CAPACITY_FEATURES], capStats), train.map((r) => r.deadlineMiss), { lr: 0.6 })
  const stressModel = trainRidge(matrix(train, [...STRESS_FEATURES], stressStats), train.map((r) => r.stress01))

  const metrics = {
    success: evaluateLogistic(matrix(test, [...CAPACITY_FEATURES], capStats), test.map((r) => r.success), successModel),
    deadlineMiss: evaluateLogistic(matrix(test, [...CAPACITY_FEATURES], capStats), test.map((r) => r.deadlineMiss), missModel),
    stress: evaluateRidge(test, stressModel, stressStats),
  }

  const weights = {
    version: 2,
    trainedAt: new Date().toISOString(),
    source,
    sampleSize: rows.length,
    seed: realPath ? null : SEED,
    provenance: realPath
      ? 'Refit on exported RealityOS outcomes recorded by users.'
      : 'Trained offline on a seeded generative cohort (no real user data). Per-user calibration is applied at runtime from recorded outcomes.',
    capacity: {
      features: [...CAPACITY_FEATURES],
      mean: capStats.mean.map(round3),
      std: capStats.std.map(round3),
      models: { success: successModel, deadlineMiss: missModel },
    },
    stress: {
      features: [...STRESS_FEATURES],
      mean: stressStats.mean.map(round3),
      std: stressStats.std.map(round3),
      model: stressModel,
    },
    metrics,
    prior: {
      successRate: round3(train.reduce((a, r) => a + r.success, 0) / train.length),
      deadlineMissRate: round3(train.reduce((a, r) => a + r.deadlineMiss, 0) / train.length),
      meanStress: round3(train.reduce((a, r) => a + r.stress01, 0) / train.length),
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  const banner = `/**
 * AUTO-GENERATED FILE — do not edit by hand.
 *
 * Produced by \`npm run train\` (tools/train-model.mjs). Emitted as a TypeScript
 * module rather than JSON so Node's type-stripping loader, esbuild (Worker) and
 * Vite (browser) all consume it identically, with no import attributes.
 */
export const weightsFile = `
  await writeFile(OUT, `${banner}${JSON.stringify(weights, null, 2)} as const\n`)
  console.log(`trained on ${rows.length} rows (${source})`)
  console.log(`  success      AUC ${metrics.success.auc}  acc ${metrics.success.accuracy}  brier ${metrics.success.brier}`)
  console.log(`  deadlineMiss AUC ${metrics.deadlineMiss.auc}  acc ${metrics.deadlineMiss.accuracy}  brier ${metrics.deadlineMiss.brier}`)
  console.log(`  stress       R² ${metrics.stress.r2}  MAE ${metrics.stress.mae}`)
  console.log(`wrote ${OUT}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
