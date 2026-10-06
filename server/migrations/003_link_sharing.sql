-- "Anyone with the link" view access: any signed-in user may open the diagram
-- read-only while link_shared is true. Off by default; the owner toggles it.
ALTER TABLE diagrams ADD COLUMN link_shared BOOLEAN NOT NULL DEFAULT FALSE;
