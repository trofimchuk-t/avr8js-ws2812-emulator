const baseUrl: string = import.meta.env.VITE_API_URL ?? "/api";

export interface IHexiResult {
  stdout: string;
  stderr: string;
  hex: string;
}

export class CompileError extends Error {}

export async function buildHex(source: string) {
  let resp: Response;
  try {
    resp = await fetch(baseUrl + "/compile", {
      method: "POST",
      cache: "no-cache",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sketch: source }),
    });
  } catch {
    throw new CompileError("Cannot reach the compile server. Is it running (yarn server)?");
  }
  if (!resp.ok) {
    let reason = resp.statusText;
    try {
      reason = (await resp.json()).error ?? reason;
    } catch {
      // Not JSON (for example a proxy error page); keep the status text.
    }
    throw new CompileError(`Compile server error (${resp.status}): ${reason}`);
  }
  return (await resp.json()) as IHexiResult;
}
