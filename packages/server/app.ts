import Fastify from "fastify";
import { Compiler } from "./compiler.ts";
import type { ServerConfig } from "./config.ts";
import { QueueFullError } from "./semaphore.ts";
import { SketchFilesError, validateSketchFiles } from "./sketch-files.ts";

export function buildApp(config: ServerConfig, compiler = new Compiler(config)) {
  // bodyLimit leaves room for JSON escaping around maxSketchBytes of source plus file names.
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: config.maxSketchBytes * 2 + config.maxSketchFiles * 256 + 1024,
  });

  // Body: `{ files: [{ name, content }], main? }`, or the single-file form `{ sketch }`.
  app.post("/api/compile", async (request, reply) => {
    const body = (request.body ?? {}) as { sketch?: unknown; files?: unknown; main?: unknown };
    try {
      let sketch;
      if (body.files !== undefined) {
        sketch = validateSketchFiles(body.files, body.main, config);
      } else if (typeof body.sketch === "string") {
        sketch = validateSketchFiles(
          [{ name: "sketch.ino", content: body.sketch }],
          undefined,
          config,
        );
      } else {
        return reply.code(400).send({ error: "`files` or `sketch` is required" });
      }
      return await compiler.compile(sketch);
    } catch (err) {
      if (err instanceof SketchFilesError) {
        return reply.code(err.status).send({ error: err.message });
      }
      if (err instanceof QueueFullError) {
        return reply
          .code(503)
          .header("Retry-After", "5")
          .send({ error: "Too many builds, try again shortly" });
      }
      throw err;
    }
  });

  app.get("/api/health", async () => ({ ok: true }));

  return app;
}
