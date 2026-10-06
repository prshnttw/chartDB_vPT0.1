-- View-only sharing: a row grants `user_id` read access to `diagram_id`.
-- Editing and deleting stay owner-only (they are scoped by diagrams.user_id).
CREATE TABLE diagram_shares (
    diagram_id UUID NOT NULL REFERENCES diagrams(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(10) NOT NULL DEFAULT 'view' CHECK (permission IN ('view')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (diagram_id, user_id)
);
-- "What is shared with me?" lookups.
CREATE INDEX diagram_shares_user_id_idx ON diagram_shares(user_id);
