CREATE TABLE IF NOT EXISTS oska_cloud_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS oska_cloud_teams (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES oska_cloud_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  members JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status = 'DRAFT'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS oska_cloud_teams_owner ON oska_cloud_teams(owner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS oska_cloud_tasks (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES oska_cloud_users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  prompt TEXT NOT NULL,
  team_id UUID REFERENCES oska_cloud_teams(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'BLOCKED_PROVIDER',
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_id, request_id)
);
CREATE INDEX IF NOT EXISTS oska_cloud_tasks_owner ON oska_cloud_tasks(owner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS oska_cloud_limits (
  owner_id TEXT PRIMARY KEY REFERENCES oska_cloud_users(id) ON DELETE CASCADE,
  window_number BIGINT NOT NULL,
  requests INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oska_cloud_sessions (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES oska_cloud_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS oska_cloud_sessions_owner ON oska_cloud_sessions(owner_id);
