CREATE TABLE IF NOT EXISTS csv_studio_grants (
  subscription_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  buyer_principal TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  context_sha256 TEXT NOT NULL,
  download_token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'REVOKED')),
  PRIMARY KEY (subscription_id, order_id)
);
