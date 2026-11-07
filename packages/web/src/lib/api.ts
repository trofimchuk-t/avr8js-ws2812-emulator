import type { LedConfig, SketchFile } from "@avr8js-ws2812/engine";

export const baseUrl: string = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {}

/** Project metadata as returned by the list endpoint. */
export interface ProjectSummary {
  id: string;
  name: string;
  led: LedConfig;
  mainFile: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends ProjectSummary {
  files: SketchFile[];
}

export interface ProjectInput {
  name: string;
  led: LedConfig;
  files: SketchFile[];
  main: string;
}

/** fetch + JSON, turning network and HTTP failures into readable `ApiError`s. */
export async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(baseUrl + path, {
      cache: "no-cache",
      ...init,
      headers: init?.json === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.json === undefined ? undefined : JSON.stringify(init.json),
    });
  } catch {
    throw new ApiError("Cannot reach the server. Is it running (yarn server)?");
  }
  if (!resp.ok) {
    let reason = resp.statusText;
    try {
      reason = (await resp.json()).error ?? reason;
    } catch {
      // Not JSON (for example a proxy error page); keep the status text.
    }
    throw new ApiError(`Server error (${resp.status}): ${reason}`);
  }
  return resp.status === 204 ? (undefined as T) : ((await resp.json()) as T);
}

export const listProjects = () => request<ProjectSummary[]>("/projects");
export const getProject = (id: string) => request<Project>(`/projects/${id}`);
export const createProject = (input: ProjectInput) =>
  request<Project>("/projects", { method: "POST", json: input });
export const updateProject = (id: string, patch: Partial<ProjectInput>) =>
  request<Project>(`/projects/${id}`, { method: "PUT", json: patch });
export const deleteProject = (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" });
