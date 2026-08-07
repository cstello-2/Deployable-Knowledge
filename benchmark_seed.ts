import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { db } from './src/lib/server/database/database.ts';
import { documents, document_chunks } from './src/lib/server/database/schema.ts';
import { embedTexts, EMBEDDING_MODEL } from './src/lib/server/rag/embedding-model.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BATCH_SIZE = 50;

function embeddingToBuffer(values: number[]): Buffer {
    const array = Float32Array.from(values);
    return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

interface BeirDocument {
    _id: string;
    title: string;
    text: string;
    metadata: Record<string, unknown>;
}

async function seedDatabase() {
    const benchmarkDir = path.join(__dirname, 'py-benchmark');
    const syncFilePath = path.join(benchmarkDir, 'active_dataset.txt');
    
    if (!fs.existsSync(syncFilePath)) {
        console.error("[x] active_dataset.txt missing. Run Python data loader first.");
        process.exit(1);
    }

    const activeDataset = fs.readFileSync(syncFilePath, 'utf-8').trim();
    const corpusPath = path.join(benchmarkDir, 'data', activeDataset, 'corpus.jsonl');
    
    const fileStream = fs.createReadStream(corpusPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    console.log(`\nStart dataset ingest into chunk format: ${activeDataset.toUpperCase()}`);

    let batch: BeirDocument[] = [];
    let count = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;
        batch.push(JSON.parse(line));

        if (batch.length >= BATCH_SIZE) {
            await processBatch(batch);
            count += batch.length;
            console.log(`  -> Inserted ${count} documents---`);
            batch = []; // reset batch
        }
    }

    // Process remaining
    if (batch.length > 0) {
        await processBatch(batch);
        count += batch.length;
        console.log(`  -> Inserted ${count} documents--`);
    }

    console.log("Benchmark seeding complete-- -- --");
}

async function processBatch(batch: BeirDocument[]) {
    const now = new Date().toISOString();

    // Generate embeddings using your existing model
    const textsToEmbed = batch.map(doc => `${doc.title}\n${doc.text}`);
    const embeddings = await embedTexts(textsToEmbed);

    const docsToInsert = batch.map(doc => ({
        id: doc._id,
        title: doc.title,
        sourcePath: `beir/${doc._id}.txt`,
        sourceType: "TXT",
        createdAt: now,
        updatedAt: now,
    }));

    // Format Document Chunks (1-to-1 mapping for BEIR query id matching)
    const chunksToInsert = batch.map((doc, i) => ({
        id: `${doc._id}_chunk0`,
        documentId: doc._id,
        chunkType: "TEXT",
        pageIndex: 0,
        chunkIndex: 0,
        content: `${doc.title}\n${doc.text}`,
        startChar: 0,
        endChar: doc.text.length,
        wordCount: doc.text.split(/\s+/).length,
        sentenceCount: doc.text.split(/[.!?]+/).length,
        metadata: doc.metadata,
        embedding: embeddingToBuffer(embeddings[i]),
        embeddingModel: EMBEDDING_MODEL,
        createdAt: now,
    }));

    // Insert directly into SQL bypassing the SHA-256 step
    await db.insert(documents).values(docsToInsert).onConflictDoNothing();
    await db.insert(document_chunks).values(chunksToInsert).onConflictDoNothing();
}

seedDatabase().catch(console.error);