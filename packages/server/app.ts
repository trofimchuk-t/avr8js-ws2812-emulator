import Fastify from "fastify";
import { Compiler } from "./compiler.ts";
import type { ServerConfig } from "./config.ts";
import { QueueFullError } from "./semaphore.ts";

export function buildApp(config: ServerConfig, compiler = new Compiler(config)) {
  // bodyLimit leaves room for JSON escaping around a maxSketchBytes sketch.
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: config.maxSketchBytes * 2 + 1024,
  });

  app.post("/api/compile", async (request, reply) => {
    const sketch = (request.body as { sketch?: unknown } | null)?.sketch;
    if (typeof sketch !== "string" || sketch.trim() === "") {
      return reply.code(400).send({ error: "`sketch` must be a non-empty string" });
    }
    if (Buffer.byteLength(sketch) > config.maxSketchBytes) {
      return reply
        .code(413)
        .send({ error: `Sketch is larger than ${config.maxSketchBytes} bytes` });
    }
    try {
      return await compiler.compile(sketch);
    } catch (err) {
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
