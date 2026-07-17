import { constants } from "node:fs";
import { access, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { error, json } from "@sveltejs/kit";
import { containsPath } from "$lib/server/documents/remove-document";
import type { RequestHandler } from "./$types";

type DirectoryItem = {
  name: string;
  path: string;
  kind: "folder" | "pdf";
};

export const GET: RequestHandler = async ({ url }) => {
  const root = await realpath(homedir());
  const requested = url.searchParams.get("path")?.trim() || root;

  let directory: string;
  try {
    directory = await realpath(resolve(requested));
    const directoryStats = await stat(directory);
    if (!directoryStats.isDirectory()) throw new Error("Not a directory.");
    await access(directory, constants.R_OK);
  } catch {
    throw error(400, "Directory does not exist or cannot be read.");
  }

  if (!containsPath(root, directory)) {
    throw error(403, "Directory is outside your home folder.");
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const items: DirectoryItem[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) items.push({ name: entry.name, path, kind: "folder" });
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".pdf") {
      items.push({ name: entry.name, path, kind: "pdf" });
    }
  }

  items.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  const parentPath = directory === root ? null : resolve(directory, "..");

  return json({
    path: directory,
    parentPath,
    items,
  });
};
