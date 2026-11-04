/**
 * Data access layer. All SQL lives here; every statement that touches user data
 * is scoped by `owner` (= the Freebuff `user.sub` for the signed-in request).
 * Persisted JSON is re-validated on the way out — we never trust stored blobs.
 */
import { situationSchema } from '../../src/shared/schemas.ts'
import type { OutcomeRecord, PredictionComparison, SimulationRun, SimulationStatus, StructuredSituation } from '../../src/shared/types.ts'
import type { StoredPrediction } from '../../src/shared/engine/reflect.ts'

export interface SimulationRow {
  id: string
  owner: string
  title: string
  status: SimulationStatus
  description: string
  is_demo: number
  goal: string | null
  deadline: string | null
  engine_mode: string | null
  reliability: number | null
  chosen_option: string | null
  top_option_name: string | null
  top_option_code: string | null
  top_success: number | null
  top_deadline_risk: number | null
  top_stress: number | null
  risk_level: string | null
  confidence: number | null
  created_at: string
  updated_at: string
}

export interface ProfileRow {
  sub: string
  use_case: string | null
  decision_style: string | null
  onboarded_at: string | null
  created_at: string
  updated_at: string
}

const now = () => new Date().toISOString()

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

export async function ensureUser(
  db: D1Database,
  user: { sub: string; email?: string; name?: string; picture?: string },
): Promise<ProfileRow> {
  const timestamp = now()
  await db
    .prepare(
      `INSERT INTO users (sub, email, name, picture, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(sub) DO UPDATE SET
         email = CASE WHEN users.email_edited = 1 THEN users.email ELSE COALESCE(excluded.email, users.email) END,
         name = COALESCE(excluded.name, users.name),
         picture = COALESCE(excluded.picture, users.picture),
         updated_at = ?5`,
    )
    .bind(user.sub, user.email ?? null, user.name ?? null, user.picture ?? null, timestamp)
    .run()

  const existing = await db.prepare(`SELECT * FROM profiles WHERE sub = ?1`).bind(user.sub).first<ProfileRow>()
  if (existing) return existing
  await db
    .prepare(
      `INSERT INTO profiles (sub, created_at, updated_at) VALUES (?1, ?2, ?2)
       ON CONFLICT(sub) DO NOTHING`,
    )
    .bind(user.sub, timestamp)
    .run()
  return (
    (await db.prepare(`SELECT * FROM profiles WHERE sub = ?1`).bind(user.sub).first<ProfileRow>()) ?? {
      sub: user.sub,
      use_case: null,
      decision_style: null,
      onboarded_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    }
  )
}

export interface AccountRow {
  sub: string
  email: string | null
  name: string | null
  picture: string | null
  auth_provider: string
  password_hash: string | null
}

export function getAccount(db: D1Database, sub: string): Promise<AccountRow | null> {
  return db
    .prepare(`SELECT sub, email, name, picture, auth_provider, password_hash FROM users WHERE sub = ?1`)
    .bind(sub)
    .first<AccountRow>()
}

/** Edits made in Settings. Changing the email marks it user-owned. */
export async function updateAccount(
  db: D1Database,
  sub: string,
  input: { name?: string; email?: string },
): Promise<AccountRow> {
  const timestamp = now()
  await db
    .prepare(
      `UPDATE users SET
         name = COALESCE(?2, name),
         email = COALESCE(?3, email),
         email_edited = CASE WHEN ?3 IS NULL THEN email_edited ELSE 1 END,
         updated_at = ?4
       WHERE sub = ?1`,
    )
    .bind(sub, input.name ?? null, input.email ?? null, timestamp)
    .run()
  const row = await getAccount(db, sub)
  if (!row) throw new Error('account disappeared while updating it')
  return row
}

export async function setOnboarding(
  db: D1Database,
  sub: string,
  input: { name: string; useCase: string; decisionStyle: string },
): Promise<void> {
  const timestamp = now()
  await db.prepare(`UPDATE users SET name = ?2, updated_at = ?3 WHERE sub = ?1`).bind(sub, input.name, timestamp).run()
  await db
    .prepare(
      `UPDATE profiles SET use_case = ?2, decision_style = ?3, onboarded_at = ?4, updated_at = ?4 WHERE sub = ?1`,
    )
    .bind(sub, input.useCase, input.decisionStyle, timestamp)
    .run()
}

export async function createSimulation(
  db: D1Database,
  input: { owner: string; title: string; description: string; isDemo?: boolean; goal?: string | null; deadline?: string | null },
): Promise<SimulationRow> {
  const timestamp = now()
  const simulation: SimulationRow = {
    id: id('sim'),
    owner: input.owner,
    title: input.title,
    status: 'draft',
    description: input.description,
    is_demo: input.isDemo ? 1 : 0,
    goal: input.goal ?? null,
    deadline: input.deadline ?? null,
    engine_mode: null,
    reliability: null,
    chosen_option: null,
    top_option_name: null,
    top_option_code: null,
    top_success: null,
    top_deadline_risk: null,
    top_stress: null,
    risk_level: null,
    confidence: null,
    created_at: timestamp,
    updated_at: timestamp,
  }
  await db
    .prepare(
      `INSERT INTO simulations (id, owner, title, status, description, is_demo, goal, deadline, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
    )
    .bind(
      simulation.id,
      simulation.owner,
      simulation.title,
      simulation.status,
      simulation.description,
      simulation.is_demo,
      simulation.goal,
      simulation.deadline,
      timestamp,
    )
    .run()
  return simulation
}

export async function listSimulations(db: D1Database, owner: string, limit = 50, offset = 0): Promise<SimulationRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM simulations WHERE owner = ?1 ORDER BY updated_at DESC LIMIT ?2 OFFSET ?3`)
    .bind(owner, limit, offset)
    .all<SimulationRow>()
  return results ?? []
}

export async function getSimulation(db: D1Database, owner: string, simulationId: string): Promise<SimulationRow | null> {
  return db.prepare(`SELECT * FROM simulations WHERE id = ?1 AND owner = ?2`).bind(simulationId, owner).first<SimulationRow>()
}

export async function updateSimulation(
  db: D1Database,
  owner: string,
  simulationId: string,
  patch: Partial<
    Pick<
      SimulationRow,
      | 'status'
      | 'title'
      | 'goal'
      | 'deadline'
      | 'engine_mode'
      | 'reliability'
      | 'chosen_option'
      | 'top_option_name'
      | 'top_option_code'
      | 'top_success'
      | 'top_deadline_risk'
      | 'top_stress'
      | 'risk_level'
      | 'confidence'
    >
  >,
): Promise<void> {
  const assignments: string[] = []
  const values: unknown[] = [simulationId, owner]
  const push = (column: string, value: unknown) => {
    values.push(value)
    assignments.push(`${column} = ?${values.length}`)
  }
  if (patch.status !== undefined) push('status', patch.status)
  if (patch.title !== undefined) push('title', patch.title)
  if (patch.goal !== undefined) push('goal', patch.goal)
  if (patch.deadline !== undefined) push('deadline', patch.deadline)
  if (patch.engine_mode !== undefined) push('engine_mode', patch.engine_mode)
  if (patch.reliability !== undefined) push('reliability', patch.reliability)
  if (patch.chosen_option !== undefined) push('chosen_option', patch.chosen_option)
  if (patch.top_option_name !== undefined) push('top_option_name', patch.top_option_name)
  if (patch.top_option_code !== undefined) push('top_option_code', patch.top_option_code)
  if (patch.top_success !== undefined) push('top_success', patch.top_success)
  if (patch.top_deadline_risk !== undefined) push('top_deadline_risk', patch.top_deadline_risk)
  if (patch.top_stress !== undefined) push('top_stress', patch.top_stress)
  if (patch.risk_level !== undefined) push('risk_level', patch.risk_level)
  if (patch.confidence !== undefined) push('confidence', patch.confidence)
  values.push(now())
  assignments.push(`updated_at = ?${values.length}`)
  if (!assignments.length) return
  await db
    .prepare(`UPDATE simulations SET ${assignments.join(', ')} WHERE id = ?1 AND owner = ?2`)
    .bind(...values)
    .run()
}

export async function deleteSimulation(db: D1Database, owner: string, simulationId: string): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM simulations WHERE id = ?1 AND owner = ?2`).bind(simulationId, owner).run()
  return (result.meta?.changes ?? 0) > 0
}

export async function saveSituation(
  db: D1Database,
  input: { owner: string; simulationId: string; situation: StructuredSituation; edited: boolean },
): Promise<void> {
  await db
    .prepare(`INSERT INTO situations (id, simulation_id, owner, payload, edited, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
    .bind(id('sit'), input.simulationId, input.owner, JSON.stringify(input.situation), input.edited ? 1 : 0, now())
    .run()
}

export async function getLatestSituation(
  db: D1Database,
  owner: string,
  simulationId: string,
): Promise<StructuredSituation | null> {
  const row = await db
    .prepare(`SELECT payload FROM situations WHERE simulation_id = ?1 AND owner = ?2 ORDER BY created_at DESC LIMIT 1`)
    .bind(simulationId, owner)
    .first<{ payload: string }>()
  if (!row) return null
  try {
    const parsed = situationSchema.safeParse(JSON.parse(row.payload))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function saveRun(
  db: D1Database,
  input: { owner: string; simulationId: string; run: SimulationRun; engineMode: string },
): Promise<void> {
  await db
    .prepare(`INSERT INTO runs (id, simulation_id, owner, payload, engine_mode, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
    .bind(id('run'), input.simulationId, input.owner, JSON.stringify(input.run), input.engineMode, now())
    .run()
}

export async function getLatestRun(db: D1Database, owner: string, simulationId: string): Promise<SimulationRun | null> {
  const row = await db
    .prepare(`SELECT payload FROM runs WHERE simulation_id = ?1 AND owner = ?2 ORDER BY created_at DESC LIMIT 1`)
    .bind(simulationId, owner)
    .first<{ payload: string }>()
  if (!row) return null
  try {
    return JSON.parse(row.payload) as SimulationRun
  } catch {
    return null
  }
}

export async function savePrediction(
  db: D1Database,
  input: { owner: string; simulationId: string; prediction: StoredPrediction },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO predictions (id, simulation_id, owner, option_id, success_probability, deadline_risk, stress_index, expected_hours, expected_completion_date, deadline, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    )
    .bind(
      id('pred'),
      input.simulationId,
      input.owner,
      input.prediction.optionId,
      input.prediction.successProbability,
      input.prediction.deadlineRisk,
      input.prediction.stressIndex,
      input.prediction.expectedHours,
      input.prediction.expectedCompletionDate,
      input.prediction.deadline,
      now(),
    )
    .run()
}

export interface PredictionWithContext extends StoredPrediction {
  simulationId: string
  createdAt: string
}

export async function listPredictions(db: D1Database, owner: string, limit = 100): Promise<PredictionWithContext[]> {
  const { results } = await db
    .prepare(`SELECT * FROM predictions WHERE owner = ?1 ORDER BY created_at DESC LIMIT ?2`)
    .bind(owner, limit)
    .all<{
      simulation_id: string
      option_id: string | null
      success_probability: number
      deadline_risk: number
      stress_index: number
      expected_hours: number
      expected_completion_date: string | null
      deadline: string | null
      created_at: string
    }>()
  return (results ?? []).map((row) => ({
    simulationId: row.simulation_id,
    optionId: row.option_id,
    successProbability: row.success_probability,
    deadlineRisk: row.deadline_risk,
    stressIndex: row.stress_index,
    expectedHours: row.expected_hours,
    expectedCompletionDate: row.expected_completion_date,
    deadline: row.deadline,
    createdAt: row.created_at,
  }))
}

export async function saveOutcome(
  db: D1Database,
  input: { owner: string; simulationId: string; outcome: OutcomeRecord },
): Promise<void> {
  await db
    .prepare(`INSERT INTO outcomes (id, simulation_id, owner, option_id, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
    .bind(id('out'), input.simulationId, input.owner, input.outcome.optionId, JSON.stringify(input.outcome), now())
    .run()
}

export interface OutcomeWithContext {
  simulationId: string
  outcome: OutcomeRecord
  createdAt: string
  prediction: PredictionWithContext | null
}

export async function listOutcomesWithPredictions(db: D1Database, owner: string, limit = 100): Promise<OutcomeWithContext[]> {
  const { results } = await db
    .prepare(
      `SELECT o.simulation_id, o.payload, o.created_at,
              p.success_probability, p.deadline_risk, p.stress_index, p.expected_hours, p.expected_completion_date, p.deadline, p.option_id
       FROM outcomes o
       LEFT JOIN predictions p ON p.id = (
         SELECT id FROM predictions p2 WHERE p2.simulation_id = o.simulation_id AND p2.owner = o.owner
         ORDER BY p2.created_at DESC LIMIT 1
       )
       WHERE o.owner = ?1 ORDER BY o.created_at DESC LIMIT ?2`,
    )
    .bind(owner, limit)
    .all<{
      simulation_id: string
      payload: string
      created_at: string
      success_probability: number | null
      deadline_risk: number | null
      stress_index: number | null
      expected_hours: number | null
      expected_completion_date: string | null
      deadline: string | null
      option_id: string | null
    }>()

  return (results ?? []).map((row) => {
    let outcome: OutcomeRecord
    try {
      outcome = JSON.parse(row.payload) as OutcomeRecord
    } catch {
      outcome = { optionId: null, completed: 'partly', actualCompletionDate: null, actualHours: null, actualStress: null, whatWentWrong: '', whatWentBetter: '', notes: '' }
    }
    return {
      simulationId: row.simulation_id,
      outcome,
      createdAt: row.created_at,
      prediction:
        row.success_probability === null
          ? null
          : {
              simulationId: row.simulation_id,
              optionId: row.option_id,
              successProbability: row.success_probability,
              deadlineRisk: row.deadline_risk ?? 0,
              stressIndex: row.stress_index ?? 0,
              expectedHours: row.expected_hours ?? 0,
              expectedCompletionDate: row.expected_completion_date,
              deadline: row.deadline,
              createdAt: row.created_at,
            },
    }
  })
}

export async function getLatestOutcome(db: D1Database, owner: string, simulationId: string): Promise<OutcomeRecord | null> {
  const row = await db
    .prepare(`SELECT payload FROM outcomes WHERE simulation_id = ?1 AND owner = ?2 ORDER BY created_at DESC LIMIT 1`)
    .bind(simulationId, owner)
    .first<{ payload: string }>()
  if (!row) return null
  try {
    return JSON.parse(row.payload) as OutcomeRecord
  } catch {
    return null
  }
}

export async function saveComparison(
  db: D1Database,
  input: { owner: string; simulationId: string; comparison: PredictionComparison },
): Promise<void> {
  await db
    .prepare(`INSERT INTO comparisons (id, simulation_id, owner, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(id('cmp'), input.simulationId, input.owner, JSON.stringify(input.comparison), now())
    .run()
}

export async function getLatestComparison(
  db: D1Database,
  owner: string,
  simulationId: string,
): Promise<PredictionComparison | null> {
  const row = await db
    .prepare(`SELECT payload FROM comparisons WHERE simulation_id = ?1 AND owner = ?2 ORDER BY created_at DESC LIMIT 1`)
    .bind(simulationId, owner)
    .first<{ payload: string }>()
  if (!row) return null
  try {
    return JSON.parse(row.payload) as PredictionComparison
  } catch {
    return null
  }
}

export async function saveTrainingRow(
  db: D1Database,
  input: {
    owner: string
    simulationId: string
    features: Record<string, number>
    success: number
    deadlineMiss: number
    stress01: number
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO training_rows (id, owner, simulation_id, features, success, deadline_miss, stress01, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      id('trn'),
      input.owner,
      input.simulationId,
      JSON.stringify(input.features),
      input.success,
      input.deadlineMiss,
      input.stress01,
      now(),
    )
    .run()
}

export async function recordAgentEvent(
  db: D1Database,
  input: { owner: string; simulationId?: string | null; agent: string; status: string; detail?: string; durationMs?: number },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agent_events (id, simulation_id, owner, agent, status, detail, duration_ms, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(id('evt'), input.simulationId ?? null, input.owner, input.agent, input.status, input.detail ?? null, input.durationMs ?? null, now())
    .run()
}

export async function deleteAllUserData(db: D1Database, owner: string): Promise<void> {
  for (const table of ['comparisons', 'outcomes', 'predictions', 'training_rows', 'runs', 'situations', 'agent_events', 'simulations']) {
    await db.prepare(`DELETE FROM ${table} WHERE owner = ?1`).bind(owner).run()
  }
  await db.prepare(`DELETE FROM recovery_codes WHERE sub = ?1`).bind(owner).run()
  await db.prepare(`DELETE FROM sessions WHERE sub = ?1`).bind(owner).run()
  await db.prepare(`DELETE FROM profiles WHERE sub = ?1`).bind(owner).run()
  await db.prepare(`DELETE FROM users WHERE sub = ?1`).bind(owner).run()
}

export async function countSimulations(db: D1Database, owner: string): Promise<{ total: number; outcomes: number }> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM simulations WHERE owner = ?1) AS total,
              (SELECT COUNT(*) FROM outcomes WHERE owner = ?1) AS outcomes`,
    )
    .bind(owner)
    .first<{ total: number; outcomes: number }>()
  return { total: row?.total ?? 0, outcomes: row?.outcomes ?? 0 }
}

export const timestamps = { now }
