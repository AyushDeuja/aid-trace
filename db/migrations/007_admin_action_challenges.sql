CREATE TABLE admin_action_challenges (
  nonce uuid PRIMARY KEY,
  wallet_address text NOT NULL,
  action text NOT NULL,
  resource_id text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX admin_action_challenges_expiry_idx ON admin_action_challenges(expires_at);
