CREATE TABLE IF NOT EXISTS webhook_inbox (
  subscription_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_json TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED', 'DONE')),
  PRIMARY KEY (subscription_id, event_id)
);
CREATE INDEX IF NOT EXISTS webhook_inbox_state ON webhook_inbox(state, received_at);
