-- Reference schema for isolated tests. Generate the actual Sites migration with
-- the retained starter's db:generate command; do not apply both copies.
CREATE TABLE even_display_state (
  owner_id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
