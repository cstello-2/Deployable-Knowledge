import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { chunkPages } from "./chunker-semantic";
import { postprocessChunks } from "./chunk-postprocess";
import { TextExtract, type Source } from "./text-extract";

const pdfPath = process.argv[2] ?? process.env.CHUNK_TEST_PDF ?? join(
  process.cwd(),
  "documents",
  "17-13-tactical-casualty-combat-care-handbook-v5-may-17-distro-a.pdf",
);

if (!pdfPath) {
  throw new Error("Pass a PDF path as the first argument or set CHUNK_TEST_PDF.");
}

const source: Source = {
  title: basename(pdfPath),
  type: "PDF",
  path: pdfPath,
};

const pages = await TextExtract(source);

const semanticChunks = await chunkPages(
  pages,
  {
    minWords: 3,
    overlapSentences: 1,
  },
);

const chunks = postprocessChunks(pages, semanticChunks, {
  filterChunks: true,
  minWords: 5,
});

const outputPath =
  process.env.CHUNK_OUTPUT_PATH ??
  join(tmpdir(), "chunker-semantic.json");
const rawOutputPath = outputPath.replace(/\.json$/i, "-raw.json");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  rawOutputPath,
  JSON.stringify(
    {
      model: process.env.SEMANTIC_EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2",
      chunks: semanticChunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        pageIndex: chunk.pageIndex,
        content: chunk.content,
      })),
    },
    null,
    2,
  ),
);
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      model: process.env.SEMANTIC_EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2",
      chunks: chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        pageIndex: chunk.pageIndex,
        content: chunk.content,
      })),
    },
    null,
    2,
  ),
);

console.error(`Wrote semantic chunks to ${outputPath}`);
console.error(`Wrote raw semantic chunks to ${rawOutputPath}`);
console.log(
  JSON.stringify(
    {
      model: process.env.SEMANTIC_EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2",
      chunkCount: chunks.length,
      outputPath,
      rawOutputPath,
    },
    null,
    2,
  ),
);
