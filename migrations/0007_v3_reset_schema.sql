DROP TRIGGER IF EXISTS set_updated_at;
DROP TABLE IF EXISTS oauth2_authorization_sessions;
DROP TABLE IF EXISTS application_api_keys;
DROP TABLE IF EXISTS connected_applications;
DROP TABLE IF EXISTS oauth;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    email TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE connected_applications (
    application_id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    connection_method TEXT NOT NULL,
    encrypted_credentials TEXT NOT NULL,
    credentials_iv TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
    CHECK (provider_id IN ('google-gmail', 'microsoft-outlook', 'amazon-sns')),
    CHECK (connection_method IN ('oauth2', 'access-keys')),
    CHECK (status IN ('draft', 'connected'))
);

CREATE TABLE application_api_keys (
    api_key_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_last_four TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_used_at INTEGER,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE
);

CREATE TABLE oauth2_authorization_sessions (
    session_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    state_hash TEXT NOT NULL UNIQUE,
    code_verifier TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE
);

CREATE INDEX idx_connected_applications_user_email ON connected_applications(user_email);
CREATE INDEX idx_application_api_keys_application_id ON application_api_keys(application_id);
CREATE INDEX idx_application_api_keys_key_hash ON application_api_keys(key_hash);
CREATE INDEX idx_application_api_keys_expires_at ON application_api_keys(expires_at);
CREATE INDEX idx_oauth2_authorization_sessions_application_id ON oauth2_authorization_sessions(application_id);
CREATE INDEX idx_oauth2_authorization_sessions_expires_at ON oauth2_authorization_sessions(expires_at);
