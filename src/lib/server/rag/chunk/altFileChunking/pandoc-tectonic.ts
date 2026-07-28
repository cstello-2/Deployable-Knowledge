import { spawn } from "node:child_process";

// Shared subprocess runner for the pandoc -> tectonic conversion pipeline used by every
// "convert some office format to PDF" module (docx, pptx, csv/txt).
export function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `"${command}" is not installed or not on PATH. Document conversion requires both pandoc and tectonic.`,
          ),
        );
      } else {
        reject(error);
      }
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`"${command}" exited with code ${code}.${stderr.trim() ? `\n${stderr.trim()}` : ""}`));
      }
    });
  });
}
