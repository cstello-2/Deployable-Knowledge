import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { chunkPages } from "./chunker";
import type { Chunk, Source } from "./text-extract";

const pdfPath =
  "/Users/matthewplambeck/Desktop/Deployable-Knowledge/documents/17-13-tactical-casualty-combat-care-handbook-v5-may-17-distro-a.pdf";

const source: Source = {
  title: basename(pdfPath),
  type: "PDF",
  path: pdfPath,
};

const pages = JSON.parse(
  execFileSync(
    "python3",
    [
      "-c",
      [
        "import json, sys",
        "from pypdf import PdfReader",
        "reader = PdfReader(sys.argv[1])",
        "print(json.dumps([page.extract_text() or '' for page in reader.pages]))",
      ].join("; "),
      pdfPath,
    ],
    { encoding: "utf8" },
  ),
) as string[];

const chunks = chunkPages(
  pages.map(
    (content, pageIndex): Chunk => ({
      chunkType: "TEXT",
      source,
      pageIndex,
      content,
    }),
  ),
  {
    maxChars: 80,
    minWords: 3,
    overlapSentences: 1,
  },
);

const outputPath = process.env.CHUNK_OUTPUT_PATH;
if (outputPath) {
  writeFileSync(
    outputPath,
    JSON.stringify(
      chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        pageIndex: chunk.pageIndex,
        content: chunk.content,
      })),
      null,
      2,
    ),
  );
}

console.log(JSON.stringify(chunks, null, 2));
