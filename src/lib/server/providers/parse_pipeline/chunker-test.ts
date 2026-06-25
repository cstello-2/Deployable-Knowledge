import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { chunkPages } from "./chunker";
import { TextExtract, type Source } from "./text-extract";

const pdfPath = process.argv[2] ?? process.env.CHUNK_TEST_PDF;

if (!pdfPath) {
  throw new Error("Pass a PDF path as the first argument or set CHUNK_TEST_PDF.");
}

const source: Source = {
  title: basename(pdfPath),
  type: "PDF",
  path: pdfPath,
};

const pages = await TextExtract(source);

const chunks = chunkPages(
  pages,
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
