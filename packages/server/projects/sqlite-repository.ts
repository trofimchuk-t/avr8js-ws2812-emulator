import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { NewProject, Project, ProjectPatch, ProjectRepository } from "./types.ts";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);

/** Applies `NNN-name.sql` files in order. `PRAGMA user_version` records the last one applied. */
export function migrate(db: DatabaseSync) {
  const current = (db.prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+-.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const version = parseInt(file, 10);
    if (version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(new URL(file, MIGRATIONS_DIR), "utf8"));
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

interface Row {
  id: string;
  owner_id: string;
  name: string;
  led: string;
  visual: string | null;
  sketch_ref: string;
  main_file: string;
  created_at: string;
  updated_at: string;
}

function toProject(row: Row): Project {
  const project: Project = {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    led: JSON.parse(row.led),
    sketchRef: row.sketch_ref,
    mainFile: row.main_file,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.visual !== null) project.visual = JSON.parse(row.visual);
  return project;
}

export class SqliteProjectRepository implements ProjectRepository {
  private readonly db: DatabaseSync;

  /** `path` may be ":memory:". */
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    migrate(this.db);
  }

  close() {
    this.db.close();
  }

  async list(ownerId: string) {
    const rows = this.db
      .prepare("SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC, rowid DESC")
      .all(ownerId) as unknown as Row[];
    return rows.map(toProject);
  }

  async get(id: string) {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as unknown as
      Row | undefined;
    return row ? toProject(row) : null;
  }

  async create(input: NewProject) {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO projects (id, owner_id, name, led, visual, sketch_ref, main_file, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.ownerId,
        input.name,
        JSON.stringify(input.led),
        input.visual === undefined ? null : JSON.stringify(input.visual),
        input.sketchRef,
        input.mainFile,
        now,
        now,
      );
    return (await this.get(id))!;
  }

  async update(id: string, patch: ProjectPatch) {
    const current = await this.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE projects SET name = ?, led = ?, visual = ?, sketch_ref = ?, main_file = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.name,
        JSON.stringify(next.led),
        next.visual === undefined ? null : JSON.stringify(next.visual),
        next.sketchRef,
        next.mainFile,
        new Date().toISOString(),
        id,
      );
    return this.get(id);
  }

  async delete(id: string) {
    return Number(this.db.prepare("DELETE FROM projects WHERE id = ?").run(id).changes) > 0;
  }
}
