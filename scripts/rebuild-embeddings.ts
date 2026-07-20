import { eq } from "drizzle-orm";
import { db } from "../src/lib/server/database/database";
import { document_chunks } from "../src/lib/server/database/schema";
import {
  EMBEDDING_MODEL,
  embedTexts,
} from "../src/lib/server/rag/embedding-model";

const UPDATE_BATCH_SIZE = 64;

function embeddingToBuffer(values: number[]): Buffer {
  const array = Float32Array.from(values);
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

const chunkRows = await db
  .select({
    id: document_chunks.id,
    content: document_chunks.content,
  })
  .from(document_chunks);

if (!chunkRows.length) {
  console.log("No stored chunks need embedding.");
  process.exit(0);
}

console.log(
  `Rebuilding ${chunkRows.length.toLocaleString()} chunk embeddings with ${EMBEDDING_MODEL}.`,
);

for (let offset = 0; offset < chunkRows.length; offset += UPDATE_BATCH_SIZE) {
  const batch = chunkRows.slice(offset, offset + UPDATE_BATCH_SIZE);
  const embeddings = await embedTexts(
    batch.map((chunk) => chunk.content),
    "search_document",
  );

  await db.transaction(async (transaction) => {
    for (let index = 0; index < batch.length; index += 1) {
      const embedding = embeddings[index];
      if (!embedding?.length) {
        throw new Error(`The embedding model returned no vector for chunk ${batch[index].id}.`);
      }
      await transaction
        .update(document_chunks)
        .set({ embedding: embeddingToBuffer(embedding) })
        .where(eq(document_chunks.id, batch[index].id));
    }
  });

  const completed = Math.min(offset + batch.length, chunkRows.length);
  console.log(`Embedded ${completed.toLocaleString()} of ${chunkRows.length.toLocaleString()} chunks.`);
}

console.log("Embedding rebuild complete.");
