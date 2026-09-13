CREATE TABLE IF NOT EXISTS oauth2_access_token_refresh_status (
    application_id TEXT PRIMARY KEY,
    access_token_expires_at INTEGER,
    last_refresh_started_at INTEGER,
    last_refresh_succeeded_at INTEGER,
    last_refresh_failed_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth2_access_token_refresh_status_expires_at
    ON oauth2_access_token_refresh_status(access_token_expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth2_access_token_refresh_status_updated_at
    ON oauth2_access_token_refresh_status(updated_at);
