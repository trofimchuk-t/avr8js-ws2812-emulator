import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSketchStorage } from "./file-sketch-storage.ts";
import { ProjectService, type Logger } from "./service.ts";
import { SqliteProjectRepository } from "./sqlite-repository.ts";

/** In-memory database and a temp directory for the files; for tests. */
export function memoryProjects(
  options: { limits?: { maxSketchBytes: number; maxSketchFiles: number }; log?: Logger } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "ws2812-projects-"));
  return new ProjectService(new SqliteProjectRepository(":memory:"), new FileSketchStorage(dir), {
    ownerId: "test",
    limits: options.limits ?? { maxSketchBytes: 1000, maxSketchFiles: 4 },
    log: options.log,
  });
}
