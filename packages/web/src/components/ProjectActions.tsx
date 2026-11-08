import { createContext, use } from "react";
import type { ProjectSummary } from "../lib/api";
import type { ProjectDraft } from "../lib/project-io";

/** Project-level actions owned by `App`, used by the header menu and the Projects panel. */
export interface ProjectActions {
  projects: ProjectSummary[];
  selectedId: string | null;
  select: (id: string) => void;
  create: (draft: ProjectDraft) => void;
  /** Opens the "New project" dialog. */
  openNewProject: () => void;
  /** Opens the file picker for .ino / .zip import. */
  importFile: () => void;
  duplicate: (id: string) => void;
  exportProject: (id: string) => void;
  remove: (id: string) => void;
}

export const ProjectActionsContext = createContext<ProjectActions | null>(null);

export function useProjectActions() {
  const value = use(ProjectActionsContext);
  if (!value) throw new Error("useProjectActions outside ProjectActionsContext");
  return value;
}
