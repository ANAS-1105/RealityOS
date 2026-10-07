# RealityOS

**Simulate the decision before you live it.**

RealityOS is an AI decision-simulation platform. You describe a real situation in plain language
(goals, deadlines, available hours, constraints, resources, competing priorities); RealityOS turns it
into a structured decision model, proposes several genuinely different strategies, simulates each
one with a trained workload model, analyses the risk, recommends a path — and then, when the real
outcome arrives, scores its own prediction and calibrates the next one on it.

```
USER INPUT → SITUATION MODEL → DECISION OPTIONS → SIMULATION → RISK ANALYSIS
          → RECOMMENDATION → REAL-WORLD OUTCOME → PREDICTION VS REALITY → LEARNING
```

That loop is the product. Everything below serves it.

---

## What is in the box

| Area | What was built |
| --- | --- |
| Public site | Landing (with a live, real-engine What-If demo), How it works, Features, About, Privacy, Login, Sign up, Account recovery, 404 |
| Auth | Sign in with Freebuff (OpenID Connect + PKCE, Google/GitHub/Apple). No passwords stored, no secrets in the project, sessions in HTTP-only cookies |
| Onboarding | Name, primary use case, decision style — then one auto-generated, clearly-labelled demo simulation |
| App | Dashboard, Create simulation (text + voice + file upload + optional structured hints), Situation analysis (editable), Simulation results, Decision comparison, Recommendation, What-If simulator, Decision history, Prediction vs reality, Personal decision profile, Settings |
| Backend | One Cloudflare Worker (Hono) serving the API and the SPA, with D1 persistence, rate limiting, same-origin enforcement and per-user authorization on every query |
| AI | Provider-agnostic LLM abstraction plus seven agents (Situation, Planning, Simulation, Risk, Critic, Recommendation, Reflection) behind a staged SSE pipeline, with a deterministic local reasoning core as a first-class fallback |
| ML | Two logistic regressions (completion, deadline miss) and a ridge regressor (workload pressure), trained offline by `npm run train`, shipped as weights, explainable per prediction, and calibrated per user from recorded outcomes |

## Architecture

```
Browser (React 19 + Vite + Tailwind v4 + motion + Recharts)
   │  same-origin fetch / SSE
   ▼
Cloudflare Worker  ── Hono router ── /api/*  ── services ── agents ── shared engine + ML
   │                                  │
   │                                  └── D1 (SQLite) : users, profiles, simulations,
   │                                        situations, runs, predictions, outcomes,
   │                                        comparisons, training_rows, rate_limits
   └── env.ASSETS (static SPA, run_worker_first)
```

* **Deterministic core** (`src/shared/engine/…`): workload estimation, capacity modelling, feature
  extraction, ML inference, option projection, scoring, What-If deltas. It imports nothing, runs
  identically in the Worker and the browser, and accepts an explicit `today` so results are
  reproducible and testable.
* **ML layer** (`src/shared/ml/…`): weights produced by `tools/train-model.mjs`, which imports the
  runtime's own feature-extraction module — training and inference cannot drift apart.
* **Agents** (`worker/ai/…`): each agent has one prompt, one zod output schema and one job. Model
  output is a *proposal*: it is validated, clamped and re-keyed before storage, and every probability
  is recomputed by the engine rather than taken from the LLM.
* **Services/repo** (`worker/services`, `worker/db`): all SQL lives in one module and is always scoped
  by the signed-in user's `sub`.

Full notes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack notes and platform deviations

The brief suggested Next.js + FastAPI + PostgreSQL. The chosen hosting platform runs **prebuilt
Cloudflare Worker fetch handlers plus static assets** and provides **D1 (SQLite)**, so the shipped
stack is a **Vite/React SPA + a Hono Worker + D1**. This keeps the whole product deployable on the
available infrastructure without an SSR adapter, a second service or an external database, and it
changes no product behaviour. Python/scikit-learn is replaced by an offline trainer that fits the
same model family in TypeScript/Node (plain gradient descent), so the training pipeline stays
reproducible in one toolchain.

## Running it

```bash
npm install                     # Node 20+ (developed on Node 24)

npm run train                   # refit the workload model (writes src/shared/ml/weights.ts)
npm run db:local                # apply worker/db/schema.sql to the local D1 database
npm run dev:worker              # Worker + API on http://localhost:8787  (workerd via wrangler)
npm run dev                     # Vite dev server on http://localhost:3000 (proxies /api)

npm run typecheck               # tsc --noEmit across app, worker and tooling
npm test                        # engine + agent tests (node --test)
node --test tests/api.test.mjs  # end-to-end API tests in real workerd with a real local D1
```

`npm run build` produces `dist/client` (SPA) and `dist/worker/index.js` (bundled Worker), which is
exactly what a deploy consumes.

### Configuration

Copy `.env.example` to `.dev.vars` for local work. On the hosting platform the reserved auth
variables are injected automatically; anything you add goes in **Sites → Secrets**.

| Variable | Purpose |
| --- | --- |
| `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN` | Public auth configuration (injected on deploy) |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | Optional LLM pipeline. Without a key the local reasoning core runs instead |

**No secrets belong in this repository.** The LLM key is read server-side only and never reaches the
browser.

## Honest notes

* The workload model is trained on a **seeded generative cohort**, not on real user data. The cohort
  process, its assumptions and its held-out metrics are documented in `tools/train-model.mjs` and
  surfaced in the UI (`Features` and `Settings` show version, source and AUC). Per-user calibration
  comes from outcomes you actually record, and `npm run train -- --real <export.json>` refits the
  weights on that exported data.
* Simulations are estimates. The UI says so, and never presents a probability as a promise.
* If no LLM key is configured, nothing pretends otherwise: every screen labels the active engine, and
  the local core produces the same structure, options and numbers.

## Tests

* `tests/engine.test.mjs` — extraction (dates, hours, deliverables), determinism, monotonicity,
  scoring weights, What-If direction, prediction-vs-reality maths (11 tests)
* `tests/agents.test.mjs` — LLM branch with a mock provider: normalization, hallucination rejection,
  schema-violation fallback, engine-mode honesty, stage events (6 tests)
* `tests/api.test.mjs` — real workerd + real D1: 401s, cross-site 403s, two-account isolation, the
  full create → analyze → run → what-if → choose → outcome → profile loop (9 tests)
