import { pipeline } from '@xenova/transformers';
import { Voy } from 'voy-search';

// --- DATA CONTRACT INTERFACES ---

//This matches the exact structure produced by chunker-semantic.ts
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

//This is the clean, uniform layout required by mathRerank.ts
interface Document 
{
    page: string | number;
    source: string;
    text: string;
    segmentID: string;
    score?: number;
}

// --- MAIN CLASS IMPLEMENTATION ---

export class VoyVectorSearch 
{
    //The background WebAssembly (WASM) vector database instance from 'voy-search'
    private index: Voy;

    constructor() 
    {
        //Initialize a clean, empty in-memory vector index workspace
        this.index = new Voy();
    }

    /**
     * Adds semantic chunks and their corresponding embeddings into the Voy vector database.
     * @param chunks An array of structured ChunkRecords from the chunker pipeline
     * @param embeddings A parallel 2D array containing the raw vector embeddings for each chunk
     */
    public addChunks(chunks: ChunkRecord[], embeddings: number[][]): void 
    {
        // Map the custom semantic chunks into the format Voy expects
        const voyResources = chunks.map((chunk, index) => {
            //Voy expects a serialized string or URL field to hold custom attributes.
            //We serialize the source path, page index, and content type into a JSON string.
            const serializedMetadata = JSON.stringify({
                source: chunk.source.path,
                page: chunk.pageIndex,
                contentType: chunk.chunkType
            });

            return {
                id: chunk.chunkId,
                embeddings: embeddings[index], //The numeric vector matching this chunk
                title: chunk.content,          //Voy uses the 'title' field to hold the main raw text body
                url: serializedMetadata         //Storing our structured meta metadata as a string
            };
        });

        //Bulk insert all mapped text assets directly into the index
        this.index.add({ embeddings: voyResources });
    }

    /**
     * Performs a vector similarity search using a natural language query string.
     * @param query The search query typed by the user
     * @param topK The max number of matched documents to return
     */
    public async search(query: string, topK: number = 5): Promise<Document[]> 
    {
        if (topK <= 0) return [];

        //Load the text embedding transformer model (Xenova's MiniLM model)
        const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        
        //Generate a vector embedding for the incoming query string
        const output = await embedder(query, { pooling: 'mean', normalize: true });
        const queryEmbedding = output.data as Float32Array;

        //Query the index. We fetch a wider window (topK * 3) to allow room for filtering
        const rawMatches = this.index.search(queryEmbedding, topK * 3);
        const finalMatches: Document[] = [];

        //Iterate over raw vector hits and convert them to our uniform Document interface
        for (const item of rawMatches.neighbors) 
        {
            //Safely parse our metadata back out from the JSON string stored in the 'url' property
            const parsedMeta = JSON.parse(item.url);
            
            //Format the search result exactly to match what mathRerank.ts expects
            finalMatches.push({
                segmentID: item.id,
                text: item.title || "",
                source: parsedMeta.source,
                page: parsedMeta.page,
                score: 1 // Voy doesn't expose distance on 'Neighbor'. We pass 1 since it's already pre-sorted by match order.
            });

            //Stop collecting once we meet the user's requested limit
            if (finalMatches.length >= topK) 
            {
                break;
            }
        }

        return finalMatches;
    }

    /**
     * Completely wipes the current workspace memory to start fresh.
     */
    public clear(): void {
        this.index = new Voy();
    }
}