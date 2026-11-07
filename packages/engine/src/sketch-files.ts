export interface SketchFile {
  name: string;
  content: string;
}

export interface SketchFileLimits {
  maxSketchFiles: number;
  /** Total size of all files. */
  maxSketchBytes: number;
}

export interface ValidatedSketch {
  /** Name of the main `.ino` file. */
  main: string;
  files: SketchFile[];
}

/** `status` is the HTTP status the API answers with. */
export class SketchFilesError extends Error {
  readonly status: 400 | 413;

  constructor(message: string, status: 400 | 413 = 400) {
    super(message);
    this.status = status;
  }
}

/** Flat names only: no directories, no leading dot, a known extension. */
const FILE_NAME = /^[A-Za-z0-9_-]+\.(ino|h|hpp|c|cpp)$/;

export function isValidSketchFileName(name: string) {
  return FILE_NAME.test(name);
}

/**
 * Checks the files of a sketch and picks the main one. `main` may be omitted when there
 * is exactly one `.ino` file.
 */
export function validateSketchFiles(
  files: unknown,
  main: unknown,
  limits: SketchFileLimits,
): ValidatedSketch {
  if (!Array.isArray(files) || files.length === 0) {
    throw new SketchFilesError("`files` must be a non-empty array");
  }
  if (files.length > limits.maxSketchFiles) {
    throw new SketchFilesError(`A sketch can have at most ${limits.maxSketchFiles} files`);
  }
  const seen = new Set<string>();
  let bytes = 0;
  for (const file of files as Array<Partial<SketchFile> | null>) {
    if (typeof file?.name !== "string" || typeof file.content !== "string") {
      throw new SketchFilesError("Every file needs a string `name` and `content`");
    }
    if (!FILE_NAME.test(file.name)) {
      throw new SketchFilesError(
        `Invalid file name "${file.name}": use letters, digits, "_" or "-" and one of .ino .h .hpp .c .cpp`,
      );
    }
    // Case-insensitive, because macOS and Windows file systems would merge such names.
    const key = file.name.toLowerCase();
    if (seen.has(key)) throw new SketchFilesError(`Duplicate file name "${file.name}"`);
    seen.add(key);
    bytes += new TextEncoder().encode(file.content).length;
  }
  if (bytes > limits.maxSketchBytes) {
    throw new SketchFilesError(`Sketch is larger than ${limits.maxSketchBytes} bytes`, 413);
  }
  const valid = files as SketchFile[];
  const inoFiles = valid.filter((f) => f.name.endsWith(".ino"));
  if (main === undefined) {
    if (inoFiles.length !== 1) {
      throw new SketchFilesError(
        inoFiles.length === 0
          ? "A sketch needs a .ino file"
          : "Several .ino files: set `main` to the name of the main one",
      );
    }
    main = inoFiles[0].name;
  }
  const mainFile = inoFiles.find((f) => f.name === main);
  if (!mainFile) {
    throw new SketchFilesError("`main` must name one of the .ino files");
  }
  if (mainFile.content.trim() === "") {
    throw new SketchFilesError("The main .ino file must not be empty");
  }
  return { main: mainFile.name, files: valid };
}
