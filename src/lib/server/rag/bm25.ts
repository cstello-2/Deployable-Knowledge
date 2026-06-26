// @ts-ignore
import BM25Engine from 'wink-bm25-text-search';
import { stemmer } from 'stemmer';
import { eng } from 'stopword';
import { db } from '../database/database';
import { document_chunks } from '../database/schema';

// --- DATA CONTRACT INTERFACES ---

interface Source
{
    path: string;
}

interface ChunkMetadata
{
    startChar: number;
    endChar: number;
    wordCount: number;
    sentenceCount: number;
}

interface ChunkRecord
{
    chunkId: string;
    chunkType: "TEXT" | "TABLE" | "IMAGE";
    source: Source;
    pageIndex: number;
    chunkIndex: number;
    content: string;
    metadata: ChunkMetadata;
}

interface Document
{
    page: string | number;
    source: string;
    text: string;
    segmentID: string;
    score?: number;
    [key: string]: any; // Allows for any other dynamic fields you might have
}

// Global BM25 Engine Setup
const engine = BM25Engine();
const stopWordsSet = new Set(eng); // Python-equivalent English stopwords

// Configure engine to index the 'content' field from our chunk assets
engine.defineConfig({
    fldWeights: { content: 1 }
});

// Text prep pipeline: Clean -> Tokenize -> Filter Stopwords -> Stem
engine.definePrepTasks([
    (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ''),
    (text: string) => text.split(/\s+/),
    (tokens: string[]) => tokens
        .filter(token => token.length > 0 && !stopWordsSet.has(token))
        .map(token => stemmer(token))
]);

// Registry map to act as our in-memory dictionary
// Keeps track of the whole ChunkRecord using the unique chunkId string as the primary key
const chunkRegistry = new Map<string, ChunkRecord>();

// Indexes the semantic chunks into the Wink BM25 engine while keeping our tracking references aligned
export function indexSemanticChunks(chunks: ChunkRecord[]): void
{
    console.log(`Indexing ${chunks.length} semantic chunks into BM25 engine...`);

    chunks.forEach((chunk) => {
        // Save the chunk in our registry map so we can look up page and source attributes during queries
        chunkRegistry.set(chunk.chunkId, chunk);

        // Feed the text field content into Wink tracked under its unique SHA-256 chunkId
        engine.addDoc({ content: chunk.content }, chunk.chunkId);
    });

    // Consolidate triggers the final TF/IDF matrix compilation steps
    engine.consolidate();
    console.log("BM25 Indexing completed successfully.");
}

// --- DATABASE SEED ---

// Guard flag prevents double-indexing if this is called more than once per process lifetime
// Wink has no clear() method so a second seed would silently corrupt the TF/IDF scores
let bm25Seeded = false;

// Loads all stored chunks from SQLite and rebuilds the in-memory BM25 index on server boot
// Keeps the index alive across restarts without needing to re-upload documents
// Call once at startup from hooks.server.ts — never call mid-request
export async function seedBM25FromDatabase(): Promise<void>
{
    if (bm25Seeded)
    {
        console.log("BM25 already seeded — skipping.");
        return;
    }

    console.log("Seeding BM25 engine from database...");

    // Pull all rows from document_chunks — each row has everything needed to rebuild a ChunkRecord
    const rows = await db.select().from(document_chunks);

    if (rows.length === 0)
    {
        // Fresh install with no documents yet — engine will fill in once indexSemanticChunks() runs
        console.log("No chunks in database — BM25 index will be empty until documents are uploaded.");
        bm25Seeded = true;
        return;
    }

    // Remap each DB row back into the ChunkRecord shape that indexSemanticChunks() expects
    const chunks: ChunkRecord[] = rows.map((row: any) => {
        // metadata is a JSON blob written by embedding.ts — always contains sourcePath
        const meta = row.metadata as any;

        return {
            chunkId:      row.id,
            chunkType:    row.chunkType as "TEXT" | "TABLE" | "IMAGE",
            source:       { path: meta?.sourcePath ?? '' },
            pageIndex:    row.pageIndex,
            chunkIndex:   row.chunkIndex,
            content:      row.content,
            metadata: {
                startChar:     row.startChar     ?? 0,
                endChar:       row.endChar       ?? 0,
                wordCount:     row.wordCount,
                sentenceCount: row.sentenceCount,
            },
        };
    });

    // Feed the reconstructed chunks into the existing indexer to build the TF/IDF matrix
    indexSemanticChunks(chunks);

    bm25Seeded = true;
    console.log(`BM25 engine seeded with ${chunks.length} chunks from the database.`);
}

// Query engine utility that formats matches into standard Document shapes for mathRerank
export function searchBM25(queryText: string, topK: number = 5): Document[]
{
    // Wink throws if search() is called before consolidate() — return empty if nothing has been indexed yet
    if (chunkRegistry.size === 0) return [];

    // Search returns an array of tuples like: [ ['chunkId_1', score_1], ['chunkId_2', score_2] ]
    const rawResults = engine.search(queryText, topK);

    // Explicitly destructure the tuple and type it as [string, number]
    return rawResults.map(([chunkId, score]: [string, number]) => {

        // Grab the original chunk details back from our tracking registry dictionary
        const originalChunk = chunkRegistry.get(chunkId);

        if (!originalChunk)
        {
            throw new Error(`Pipeline Error: Chunk ID ${chunkId} was missing from active tracker mapping dictionary.`);
        }

        return {
            segmentID: chunkId,
            text: originalChunk.content,
            source: originalChunk.source.path,
            page: originalChunk.pageIndex,
            score: score
        };
    });
}
