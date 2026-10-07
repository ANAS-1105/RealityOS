-- RealityOS schema (Cloudflare D1 / SQLite).
--
-- Every user-owned row carries `owner` = the Freebuff `user.sub`. Queries are
-- always scoped by owner; a client-supplied id is never used to decide whose
-- data to read or write.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  sub        TEXT PRIMARY KEY,
  email      TEXT,
  name       TEXT,
  picture    TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  sub            TEXT PRIMARY KEY REFERENCES users(sub) ON DELETE CASCADE,
  use_case       TEXT,
  decision_style TEXT,
  onboarded_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simulations (
  id              TEXT PRIMARY KEY,
  owner           TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  description     TEXT NOT NULL,
  is_demo         INTEGER NOT NULL DEFAULT 0,
  goal            TEXT,
  deadline        TEXT,
  engine_mode     TEXT,
  reliability     REAL,
  chosen_option   TEXT,
  top_option_name    TEXT,
  top_option_code    TEXT,
  top_success        REAL,
  top_deadline_risk  REAL,
  top_stress         REAL,
  risk_level         TEXT,
  confidence         REAL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_simulations_owner ON simulations(owner, created_at DESC);

-- Versioned snapshots of the structured situation (the Situation Agent output,
-- including any edits the user made).
CREATE TABLE IF NOT EXISTS situations (
  id            TEXT PRIMARY KEY,
  simulation_id TEXT NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  owner         TEXT NOT NULL,
  payload       TEXT NOT NULL,
  edited        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_situations_sim ON situations(simulation_id, created_at DESC);

-- One row per simulation run: options, projections, comparison, recommendation.
CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  simulation_id TEXT NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  owner         TEXT NOT NULL,
  payload       TEXT NOT NULL,
  engine_mode   TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_sim ON runs(simulation_id, created_at DESC);

-- The falsifiable part: what the model said would happen.
CREATE TABLE IF NOT EXISTS predictions (
  id                       TEXT PRIMARY KEY,
  simulation_id            TEXT NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  owner                    TEXT NOT NULL,
  option_id                TEXT,
  success_probability      REAL NOT NULL,
  deadline_risk            REAL NOT NULL,
  stress_index             REAL NOT NULL,
  expected_hours           REAL NOT NULL,
  expected_completion_date TEXT,
  deadline                 TEXT,
  created_at               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_predictions_sim ON predictions(simulation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outcomes (
  id            TEXT PRIMARY KEY,
  simulation_id TEXT NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  owner         TEXT NOT NULL,
  option_id     TEXT,
  payload       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outcomes_sim ON outcomes(simulation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comparisons (
  id            TEXT PRIMARY KEY,
  simulation_id TEXT NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  owner         TEXT NOT NULL,
  payload       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Feature rows kept for retraining the model on real outcomes
-- (`npm run train -- --real <export>`).
CREATE TABLE IF NOT EXISTS training_rows (
  id            TEXT PRIMARY KEY,
  owner         TEXT NOT NULL,
  simulation_id TEXT NOT NULL,
  features      TEXT NOT NULL,
  success       INTEGER NOT NULL,
  deadline_miss INTEGER NOT NULL,
  stress01      REAL NOT NULL,
  created_at    TEXT NOT NULL
);

-- Simple fixed-window rate limiting for the expensive endpoints.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- Audit trail of agent activity, useful for debugging and for showing the user
-- which agents touched their simulation.
CREATE TABLE IF NOT EXISTS agent_events (
  id            TEXT PRIMARY KEY,
  simulation_id TEXT,
  owner         TEXT NOT NULL,
  agent         TEXT NOT NULL,
  status        TEXT NOT NULL,
  detail        TEXT,
  duration_ms   INTEGER,
  created_at    TEXT NOT NULL
);
