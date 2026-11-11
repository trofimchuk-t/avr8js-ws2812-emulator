import { SketchFilesError, validateLedConfig, validateSerialConfig } from "@avr8js-ws2812/engine";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ProjectService, ProjectWithFiles } from "./service.ts";
import type { Project } from "./types.ts";

const MAX_NAME = 100;

/** Public shape: no owner and no storage key. */
function publicProject(project: Project) {
  const { id, name, led, serial, visual, mainFile, createdAt, updatedAt } = project;
  return { id, name, led, serial, visual, mainFile, createdAt, updatedAt };
}

function publicWithFiles({ files, ...project }: ProjectWithFiles) {
  return { ...publicProject(project), files };
}

function parseName(value: unknown) {
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > MAX_NAME) {
    throw new RangeError(`\`name\` must be a string of 1 to ${MAX_NAME} characters`);
  }
  return value.trim();
}

function fail(reply: FastifyReply, err: unknown) {
  if (err instanceof SketchFilesError) return reply.code(err.status).send({ error: err.message });
  if (err instanceof RangeError) return reply.code(400).send({ error: err.message });
  throw err;
}

const notFound = (reply: FastifyReply) => reply.code(404).send({ error: "Project not found" });

export function registerProjectRoutes(app: FastifyInstance, projects: ProjectService) {
  app.get("/api/projects", async () => (await projects.list()).map(publicProject));

  app.post("/api/projects", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      const project = await projects.create({
        name: parseName(body.name),
        led: validateLedConfig(body.led),
        serial: body.serial === undefined ? undefined : validateSerialConfig(body.serial),
        files: body.files,
        main: body.main,
      });
      return reply.code(201).send(publicWithFiles(project));
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const project = await projects.get(request.params.id);
    return project ? publicWithFiles(project) : notFound(reply);
  });

  app.put<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      const project = await projects.update(request.params.id, {
        name: body.name === undefined ? undefined : parseName(body.name),
        led: body.led === undefined ? undefined : validateLedConfig(body.led),
        serial: body.serial === undefined ? undefined : validateSerialConfig(body.serial),
        files: body.files,
        main: body.main,
      });
      return project ? publicWithFiles(project) : notFound(reply);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    return (await projects.delete(request.params.id)) ? reply.code(204).send() : notFound(reply);
  });
}
