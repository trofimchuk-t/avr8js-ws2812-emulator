import { randomUUID } from "node:crypto";
import {
  validateSketchFiles,
  type LedConfig,
  type SketchFile,
  type SketchFileLimits,
} from "@avr8js-ws2812/engine";
import {
  SketchMissingError,
  type Project,
  type ProjectRepository,
  type SketchStorage,
} from "./types.ts";

export interface ProjectWithFiles extends Project {
  files: SketchFile[];
}

const byName = (a: SketchFile, b: SketchFile) => (a.name < b.name ? -1 : 1);

export interface Logger {
  warn(message: string): void;
}

export interface CreateInput {
  name: string;
  led: LedConfig;
  files: unknown;
  main?: unknown;
}

export interface UpdateInput {
  name?: string;
  led?: LedConfig;
  files?: unknown;
  main?: unknown;
}

/**
 * Keeps the database record and the sketch files in step. It only knows the two interfaces.
 * Create writes the files first, delete removes the record first, so a failure in between
 * leaves at worst an orphaned directory, never a record without files.
 */
export class ProjectService {
  private readonly repo: ProjectRepository;
  private readonly storage: SketchStorage;
  private readonly ownerId: string;
  private readonly limits: SketchFileLimits;
  private readonly log: Logger;

  constructor(
    repo: ProjectRepository,
    storage: SketchStorage,
    options: { ownerId: string; limits: SketchFileLimits; log?: Logger },
  ) {
    this.repo = repo;
    this.storage = storage;
    this.ownerId = options.ownerId;
    this.limits = options.limits;
    this.log = options.log ?? { warn() {} };
  }

  /** Does not touch the disk, so a damaged project cannot break the list. */
  list() {
    return this.repo.list(this.ownerId);
  }

  async get(id: string): Promise<ProjectWithFiles | null> {
    const project = await this.owned(id);
    if (!project) return null;
    return { ...project, files: await this.readFiles(project) };
  }

  async create(input: CreateInput): Promise<ProjectWithFiles> {
    const sketch = validateSketchFiles(input.files, input.main, this.limits);
    sketch.files.sort(byName);
    const sketchRef = randomUUID();
    await this.storage.writeAll(sketchRef, sketch.files);
    try {
      const project = await this.repo.create({
        ownerId: this.ownerId,
        name: input.name,
        led: input.led,
        sketchRef,
        mainFile: sketch.main,
      });
      return { ...project, files: sketch.files };
    } catch (err) {
      await this.storage.delete(sketchRef).catch(() => {});
      throw err;
    }
  }

  async update(id: string, input: UpdateInput): Promise<ProjectWithFiles | null> {
    const project = await this.owned(id);
    if (!project) return null;
    let files: SketchFile[];
    let mainFile = project.mainFile;
    if (input.files !== undefined || input.main !== undefined) {
      const stored = input.files === undefined ? await this.readFiles(project) : input.files;
      const sketch = validateSketchFiles(stored, input.main ?? project.mainFile, this.limits);
      files = sketch.files.sort(byName);
      mainFile = sketch.main;
      if (input.files !== undefined) await this.storage.writeAll(project.sketchRef, files);
    } else {
      files = await this.readFiles(project);
    }
    const updated = await this.repo.update(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.led !== undefined && { led: input.led }),
      mainFile,
    });
    return updated && { ...updated, files };
  }

  async delete(id: string): Promise<boolean> {
    const project = await this.owned(id);
    if (!project) return false;
    await this.repo.delete(id);
    try {
      await this.storage.delete(project.sketchRef);
    } catch (err) {
      this.log.warn(`Orphaned sketch files for ${id} (${project.sketchRef}): ${String(err)}`);
    }
    return true;
  }

  private async owned(id: string) {
    const project = await this.repo.get(id);
    return project && project.ownerId === this.ownerId ? project : null;
  }

  private async readFiles(project: Project): Promise<SketchFile[]> {
    try {
      return await this.storage.readAll(project.sketchRef);
    } catch (err) {
      if (!(err instanceof SketchMissingError)) throw err;
      this.log.warn(`Project ${project.id} has no sketch files (${project.sketchRef})`);
      return [];
    }
  }
}
