-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL, -- 'admin' or 'user'
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 2. API Tokens Table (Opaque Tokens)
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash);

-- 3. Devices Table
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  endpoint TEXT UNIQUE NOT NULL,
  subscription TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  last_seen_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- 4. Device Topics Table
CREATE TABLE IF NOT EXISTS device_topics (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  PRIMARY KEY (device_id, topic)
);
CREATE INDEX IF NOT EXISTS idx_device_topics_topic ON device_topics(topic);

-- 5. Invitation Codes Table
CREATE TABLE IF NOT EXISTS invitation_codes (
  code TEXT PRIMARY KEY NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'used'
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_status ON invitation_codes(status);

-- 6. User Topics Table
CREATE TABLE IF NOT EXISTS user_topics (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (user_id, name)
);
