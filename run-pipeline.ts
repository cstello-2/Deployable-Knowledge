import { basename } from 'node:path';
import { TextExtract } from './src/lib/server/providers/parse_pipeline/text-extract.ts';
import { chunkPages } from './src/lib/server/providers/parse_pipeline/chunker-semantic.ts';
import { postprocessChunks } from './src/lib/server/providers/parse_pipeline/chunk-postprocess.ts';
import { storeDocumentChunks } from './src/lib/server/rag/embedding.ts';

async function run() {
  // Update this path to point to your actual PDF file location
  const pdfPath = './documents/17-13-tactical-casualty-combat-care-handbook-v5-may-17-distro-a.pdf';
  
  const source = { title: basename(pdfPath), type: 'PDF', path: pdfPath };
  
  console.log("Extracting text...");
  const pages = await TextExtract(source);
  
  console.log("Chunking pages...");
  const semanticChunks = await chunkPages(pages, { minWords: 3, overlapSentences: 1 });
  
  console.log("Postprocessing chunks...");
  const chunks = postprocessChunks(pages, semanticChunks, { filterChunks: true, minWords: 5 });
  
  console.log("Storing document chunks...");
  const result = await storeDocumentChunks(chunks);
  
  console.log(JSON.stringify(result, null, 2));
}

run().catch(console.error);