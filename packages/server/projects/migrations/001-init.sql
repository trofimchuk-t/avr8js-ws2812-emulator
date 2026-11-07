CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  led TEXT NOT NULL,
  visual TEXT,
  sketch_ref TEXT NOT NULL UNIQUE,
  main_file TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX projects_owner ON projects (owner_id, updated_at DESC);
