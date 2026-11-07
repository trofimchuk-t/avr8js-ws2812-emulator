import type { LedConfig, SketchFile } from "@avr8js-ws2812/engine";

/** Metadata and configuration; the sketch files live in a `SketchStorage`. */
export interface Project {
  id: string;
  ownerId: string;
  name: string;
  led: LedConfig;
  /** Reserved for the visual editor. */
  visual?: unknown;
  /** Key under which the `SketchStorage` finds the files. */
  sketchRef: string;
  /** Name of the main .ino file. */
  mainFile: string;
  createdAt: string;
  updatedAt: string;
}

export type NewProject = Omit<Project, "id" | "createdAt" | "updatedAt">;
export type ProjectPatch = Partial<Omit<Project, "id" | "ownerId" | "createdAt" | "updatedAt">>;

export interface ProjectRepository {
  /** Most recently updated first. */
  list(ownerId: string): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  create(input: NewProject): Promise<Project>;
  /** Always bumps `updatedAt`. Resolves to null when the project does not exist. */
  update(id: string, patch: ProjectPatch): Promise<Project | null>;
  /** Resolves to false when the project did not exist. */
  delete(id: string): Promise<boolean>;
}

export class SketchMissingError extends Error {
  constructor(ref: string) {
    super(`No sketch files stored under "${ref}"`);
  }
}

export interface SketchStorage {
  /** Throws `SketchMissingError` when nothing is stored under `ref`. */
  readAll(ref: string): Promise<SketchFile[]>;
  /** Replaces all files of `ref` at once. */
  writeAll(ref: string, files: SketchFile[]): Promise<void>;
  /** Succeeds when there is nothing to delete. */
  delete(ref: string): Promise<void>;
}
