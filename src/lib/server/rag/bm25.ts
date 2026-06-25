// @ts-ignore
import BM25Engine from 'wink-bm25-text-search';
import { stemmer } from 'stemmer';
import { eng } from 'stopword';

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

// Query engine utility that formats matches into standard Document shapes for mathRerank
export function searchBM25(queryText: string, topK: number = 5): Document[] 
{
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