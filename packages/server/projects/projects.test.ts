import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLedConfig } from "@avr8js-ws2812/engine";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { Compiler } from "../compiler.ts";
import { loadConfig } from "../config.ts";
import { FileSketchStorage } from "./file-sketch-storage.ts";
import { ProjectService } from "./service.ts";
import { SqliteProjectRepository } from "./sqlite-repository.ts";
import { memoryProjects } from "./test-helpers.ts";
import { SketchMissingError } from "./types.ts";

const config = { ...loadConfig(), maxSketchBytes: 1000, maxSketchFiles: 4 };
const ino = { name: "main.ino", content: "void setup(){}" };

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "ws2812-projects-"));
  const warnings: string[] = [];
  const repo = new SqliteProjectRepository(":memory:");
  const storage = new FileSketchStorage(dir);
  const service = new ProjectService(repo, storage, {
    ownerId: "test",
    limits: config,
    log: { warn: (m) => warnings.push(m) },
  });
  const app = buildApp(config, new Compiler(config), service);
  return { dir, warnings, repo, storage, service, app };
}

describe("FileSketchStorage", () => {
  it("writes, replaces, reads and deletes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws2812-storage-"));
    const storage = new FileSketchStorage(dir);
    await storage.writeAll("abc-1", [ino, { name: "a.h", content: "x" }]);
    expect(await storage.readAll("abc-1")).toEqual([{ name: "a.h", content: "x" }, ino]);
    await storage.writeAll("abc-1", [{ name: "b.ino", content: "y" }]);
    expect(await storage.readAll("abc-1")).toEqual([{ name: "b.ino", content: "y" }]);
    expect(readdirSync(dir)).toEqual(["abc-1"]); // no temp leftovers
    await storage.delete("abc-1");
    await storage.delete("abc-1");
    await expect(storage.readAll("abc-1")).rejects.toBeInstanceOf(SketchMissingError);
    rmSync(dir, { recursive: true });
  });

  it("rejects refs and names that could leave the directory", async () => {
    const storage = new FileSketchStorage(mkdtempSync(join(tmpdir(), "ws2812-storage-")));
    for (const ref of ["../x", "a/b", "", ".", ".."]) {
      await expect(storage.readAll(ref)).rejects.toThrow(RangeError);
      await expect(storage.writeAll(ref, [ino])).rejects.toThrow(RangeError);
      await expect(storage.delete(ref)).rejects.toThrow(RangeError);
    }
    await expect(storage.writeAll("ok", [{ name: "../evil.ino", content: "" }])).rejects.toThrow(
      RangeError,
    );
  });
});

describe("SqliteProjectRepository", () => {
  it("round-trips JSON fields and orders by update time", async () => {
    const repo = new SqliteProjectRepository(":memory:");
    const base = { ownerId: "u", led: createLedConfig(), sketchRef: "r1", mainFile: "a.ino" };
    const first = await repo.create({ ...base, name: "one", visual: { nodes: [1] } });
    const second = await repo.create({ ...base, name: "two", sketchRef: "r2" });
    expect(first.led).toEqual(createLedConfig());
    expect(first.visual).toEqual({ nodes: [1] });
    expect(second.visual).toBeUndefined();
    expect((await repo.list("u")).map((p) => p.name)).toEqual(["two", "one"]);
    await new Promise((r) => setTimeout(r, 5));
    const touched = await repo.update(first.id, { name: "one!" });
    expect(touched!.updatedAt > first.updatedAt).toBe(true);
    expect((await repo.list("u")).map((p) => p.name)).toEqual(["one!", "two"]);
    expect(await repo.list("other")).toEqual([]);
    expect(await repo.delete(first.id)).toBe(true);
    expect(await repo.delete(first.id)).toBe(false);
    expect(await repo.update("nope", { name: "x" })).toBeNull();
  });
});

describe("ProjectService", () => {
  it("leaves no files behind when the record cannot be created", async () => {
    const { dir, service, repo } = setup();
    repo.create = async () => {
      throw new Error("db down");
    };
    await expect(
      service.create({ name: "x", led: createLedConfig(), files: [ino] }),
    ).rejects.toThrow("db down");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("logs a missing sketch and still lists the project", async () => {
    const { dir, service, warnings, storage } = setup();
    const created = await service.create({ name: "x", led: createLedConfig(), files: [ino] });
    rmSync(join(dir, readdirSync(dir)[0]), { recursive: true });
    expect((await service.list()).map((p) => p.id)).toEqual([created.id]);
    expect((await service.get(created.id))!.files).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(storage).toBeDefined();
  });

  it("logs, but succeeds, when files cannot be deleted", async () => {
    const { service, warnings, storage } = setup();
    const created = await service.create({ name: "x", led: createLedConfig(), files: [ino] });
    storage.delete = async () => {
      throw new Error("disk");
    };
    expect(await service.delete(created.id)).toBe(true);
    expect(warnings[0]).toContain("Orphaned");
    expect(await service.get(created.id)).toBeNull();
  });

  it("memoryProjects works standalone", async () => {
    const service = memoryProjects();
    expect(await service.list()).toEqual([]);
  });
});

describe("/api/projects", () => {
  const body = (extra: object = {}) => ({
    name: "  Demo  ",
    led: createLedConfig({ count: 8 }),
    files: [ino, { name: "config.h", content: "#define N 8" }],
    ...extra,
  });

  it("creates, lists, reads, updates and deletes", async () => {
    const { app } = setup();
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: body() });
    expect(created.statusCode).toBe(201);
    const project = created.json();
    expect(project.name).toBe("Demo");
    expect(project.mainFile).toBe("main.ino");
    expect(project.files).toHaveLength(2);
    expect(project).not.toHaveProperty("ownerId");
    expect(project).not.toHaveProperty("sketchRef");

    const list = (await app.inject({ url: "/api/projects" })).json();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("files");

    const url = `/api/projects/${project.id}`;
    expect((await app.inject({ url })).json().files).toEqual(project.files);

    const renamed = await app.inject({ method: "PUT", url, payload: { name: "Renamed" } });
    expect(renamed.json().name).toBe("Renamed");
    expect(renamed.json().files).toEqual(project.files);

    const edited = await app.inject({
      method: "PUT",
      url,
      payload: { led: createLedConfig({ count: 9, dataPin: 6 }), files: [ino], main: "main.ino" },
    });
    expect(edited.json().led.count).toBe(9);
    expect((await app.inject({ url })).json().files).toEqual([ino]);

    expect((await app.inject({ method: "DELETE", url })).statusCode).toBe(204);
    expect((await app.inject({ url })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url })).statusCode).toBe(404);
  });

  it("changes only the main file", async () => {
    const { app } = setup();
    const files = [ino, { name: "other.ino", content: "int x;" }];
    const { id } = (
      await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: body({ files, main: "main.ino" }),
      })
    ).json();
    const res = await app.inject({
      method: "PUT",
      url: `/api/projects/${id}`,
      payload: { main: "other.ino" },
    });
    expect(res.json().mainFile).toBe("other.ino");
    const bad = await app.inject({
      method: "PUT",
      url: `/api/projects/${id}`,
      payload: { main: "x.ino" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("validates input", async () => {
    const { app } = setup();
    const post = (payload: object) => app.inject({ method: "POST", url: "/api/projects", payload });
    expect((await post(body({ name: " " }))).statusCode).toBe(400);
    expect((await post(body({ name: 5 }))).statusCode).toBe(400);
    expect((await post(body({ led: { count: 0 } }))).statusCode).toBe(400);
    expect((await post(body({ led: undefined }))).statusCode).toBe(400);
    expect((await post(body({ files: [{ name: "../x.ino", content: "a" }] }))).statusCode).toBe(
      400,
    );
    expect(
      (await post(body({ files: [{ name: "a.ino", content: "a".repeat(1001) }] }))).statusCode,
    ).toBe(413);
    const { id } = (await post(body())).json();
    const put = (payload: object) =>
      app.inject({ method: "PUT", url: `/api/projects/${id}`, payload });
    expect((await put({ name: "" })).statusCode).toBe(400);
    expect((await put({ led: { ...createLedConfig(), dataPin: 0 } })).statusCode).toBe(400);
    expect((await put({ files: [] })).statusCode).toBe(400);
    // Nothing changed by the failed updates.
    expect((await app.inject({ url: `/api/projects/${id}` })).json().name).toBe("Demo");
  });

  it("returns 404 for unknown projects", async () => {
    const { app } = setup();
    expect(
      (await app.inject({ method: "PUT", url: "/api/projects/nope", payload: { name: "x" } }))
        .statusCode,
    ).toBe(404);
  });
});
