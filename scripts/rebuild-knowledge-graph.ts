import { eq } from "drizzle-orm";
import { db } from "../src/lib/server/database/database";
import { document_chunks, documents } from "../src/lib/server/database/schema";
import type { ParsedChunk } from "../src/lib/server/rag/chunk/parse-shared";
import { rebuildDocumentTriplets } from "../src/lib/server/knowledge-graph/triplet-store";

const documentIdArg = process.argv.find((arg) => arg.startsWith("--document-id="));
const requestedDocumentId = documentIdArg?.slice("--document-id=".length);
const extractorArg = process.argv.find((arg) => arg.startsWith("--extractor="));
const requestedExtractor = extractorArg?.slice("--extractor=".length).trim();

if (requestedExtractor) {
  process.env.KNOWLEDGE_GRAPH_EXTRACTOR = requestedExtractor;
}

const documentRows = requestedDocumentId
  ? await db.select().from(documents).where(eq(documents.id, requestedDocumentId))
  : await db.select().from(documents);

let totalNodes = 0;
let totalEdges = 0;

for (const document of documentRows) {
  const chunkRows = await db
    .select()
    .from(document_chunks)
    .where(eq(document_chunks.documentId, document.id));
  const chunks: ParsedChunk[] = chunkRows.map((chunk) => ({
    chunkId: chunk.id,
    source: {
      title: document.title,
      path: document.sourcePath,
      type: document.sourceType,
    },
    chunkType: chunk.chunkType,
    pageIndex: Number(chunk.pageIndex),
    chunkIndex: Number(chunk.chunkIndex),
    content: chunk.content,
  }));
  const result = await rebuildDocumentTriplets(document.id, chunks);
  totalNodes += result.nodes;
  totalEdges += result.edges;
  console.log(
    `${document.title}: ${result.nodes.toLocaleString()} graph nodes, ${result.edges.toLocaleString()} graph edges`,
  );
}

console.log(
  `Knowledge Graph rebuild complete: ${totalNodes.toLocaleString()} nodes, ${totalEdges.toLocaleString()} edges`,
);
