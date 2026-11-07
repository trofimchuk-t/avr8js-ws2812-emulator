import { buildApp } from "./app.ts";
import { Compiler } from "./compiler.ts";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { FileSketchStorage } from "./projects/file-sketch-storage.ts";
import { ProjectService } from "./projects/service.ts";
import { SqliteProjectRepository } from "./projects/sqlite-repository.ts";
import { loadConfig, TOOLCHAIN_ID } from "./config.ts";

const config = loadConfig();
const compiler = new Compiler(config);
await compiler.verifyToolchain();

mkdirSync(config.dataDir, { recursive: true });
const projects = new ProjectService(
  new SqliteProjectRepository(join(config.dataDir, "projects.db")),
  new FileSketchStorage(join(config.dataDir, "sketches")),
  { ownerId: config.ownerId, limits: config, log: { warn: (message) => console.warn(message) } },
);

const app = buildApp(config, compiler, projects);
const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
app.log.info(`Toolchain: ${TOOLCHAIN_ID}`);
