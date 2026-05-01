CREATE TABLE IF NOT EXISTS oauth_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(user_id, provider)
);

INSERT INTO oauth_new (id, user_id, provider, client_id, client_secret, refresh_token, created_at)
SELECT id, user_id, provider, client_id, client_secret, refresh_token, created_at FROM oauth;

DROP TABLE oauth;
ALTER TABLE oauth_new RENAME TO oauth;
