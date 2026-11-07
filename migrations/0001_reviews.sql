CREATE TABLE reviews (
  id TEXT PRIMARY KEY NOT NULL,
  client_name TEXT NOT NULL CHECK(length(trim(client_name)) BETWEEN 2 AND 80),
  rating INTEGER NOT NULL CHECK(typeof(rating) = 'integer' AND rating BETWEEN 1 AND 5),
  title TEXT NOT NULL DEFAULT '' CHECK(length(title) <= 120),
  review_text TEXT NOT NULL CHECK(length(trim(review_text)) BETWEEN 20 AND 3000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  moderated_at TEXT,
  submission_key TEXT NOT NULL UNIQUE
);
CREATE INDEX reviews_status_created ON reviews(status, created_at DESC, id DESC);

-- Only digests of random session tokens and CSRF tokens are stored.
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  csrf_hash TEXT NOT NULL,
  credential_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);

-- Fixed window limits use atomic conditional UPSERTs, shared across edge locations.
-- Keys contain HMACs, never raw visitor IP addresses. Expired rows are pruned on writes.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts > 0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
