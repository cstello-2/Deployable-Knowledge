import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { textExtract, type Source } from "$lib/utils/text-extract";

export const _base = 'C:/Users/USAF_Admin/Deployable-Knowledge/Documents';

export type DirectoryItem = {
    path: string,
    kind: string,
    name: string,
    absolute_path: string,
}

export const GET: RequestHandler = async ({ url }) => {
  try {
          // This actually pauses execution until the OS returns the file list
          const files = await readdir(_base);
          
          // Map over the array of file names and construct the paths
          const collector: DirectoryItem[] = await files.map(file => {
              const absolutePath = path.resolve(_base, file);
              
              return {
                  path: path.join(_base, file), // The relative path from your execution context
                  kind: path.extname(file),
                  name: file, // `file` is already just the _basename
                  absolute_path: absolutePath
              };
          });

          //console.log(collector);
  
          return json(collector);
  
      } catch (err) {
          console.error("Failed to read directory:", err);
          return json([{ status: 500, error: err }]);
      }
};

// Begins embedding process, 1/6
// File path gets recieved here. text-extract.ts is called by this function.
export const POST: RequestHandler = async ({ url }) => {
  console.log("query called");
  const filePath = url.searchParams.get('path');
  console.log(filePath);

  if (!filePath) {
    return json({ error: "Missing path parameter" }, { status: 400 });
  }

  if (filePath.split("{\}").at(-1) == undefined) {
    return json({ error: "file name error, see /documensts/+server.ts" }, { status: 500 }); 
  }
  const name: string = filePath.split("{\}").at(-1)!;
  

  try {
    let file: Source = {
        title: name,
        type: "PDF",
        path: filePath,
    }
    console.log(await textExtract(file));
  } catch (err) {
    console.error("Failed to read directory:", err);
    return json([{ status: 500, error: err }]);
  }
  return json([{ status: 200 }]);
};