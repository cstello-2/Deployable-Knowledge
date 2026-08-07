import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { retrieveRagContext, type RagContextResult } from './src/lib/server/rag/retrieve-rag-context.ts'; 

// File path reconstruct
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


interface DBQuery {
    _id: string;
    text: string;
}

async function runBenchmarkDump() {
    const benchmarkDir = path.join(__dirname, 'py-benchmark');
    const syncFilePath = path.join(benchmarkDir, 'active_dataset.txt');
    
    if (!fs.existsSync(syncFilePath)) {
        console.error("[x] Error: active_dataset.txt not found. Please run 'python data_load.py' first.");
        process.exit(1);
    }

    const activeDataset = fs.readFileSync(syncFilePath, 'utf-8').trim();

    // Use the variable `activeDataset` instead of the string literal
    const queriesPath = path.join(benchmarkDir, 'data', activeDataset, 'queries.jsonl');
        
    // Use `benchmarkDir` variable instead of hardcoded 'benchmarking'
    const predDir = path.join(benchmarkDir, 'predictions');
    
    if (!fs.existsSync(predDir)) fs.mkdirSync(predDir, { recursive: true });
    
    const semanticPreds: Record<string, Record<string, number>> = {};
    const bm25Preds: Record<string, Record<string, number>> = {};
    const hybridPreds: Record<string, Record<string, number>> = {};
    
    const fileStream = fs.createReadStream(queriesPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    
    console.log(` Running ${activeDataset.toUpperCase()} queries through RAG pipelines------`);
    
    let i = 1;
    for await (const line of rl) {
        if (!line.trim()) continue;
        const queryData: DBQuery = JSON.parse(line);
        const qId = queryData._id;
        const qText = queryData.text;

        console.log(`Query ${i}: ${qText}`);
    
        // Evaluations
        const semResult: RagContextResult = await retrieveRagContext({ question: qText, topK: 100, mode: "semantic" });
        semanticPreds[qId] = {};
        semResult.matches.forEach(m => {
            semanticPreds[qId][m.documentId] = Math.max(semanticPreds[qId][m.documentId] || 0, m.score);
        });

        console.log(`done semantic`);
    
        // Eval bm25
        const bm25Result: RagContextResult = await retrieveRagContext({ question: qText, topK: 100, mode: "bm25" });
        bm25Preds[qId] = {};
        bm25Result.matches.forEach(m => {
            bm25Preds[qId][m.documentId] = Math.max(bm25Preds[qId][m.documentId] || 0, m.score);
        });
        
        console.log(`done bm25`);

        // Eval hybrid
        const hybridResult: RagContextResult = await retrieveRagContext({ question: qText, topK: 10, mode: "hybrid" });
        hybridPreds[qId] = {};
        hybridResult.matches.forEach(m => {
            hybridPreds[qId][m.documentId] = Math.max(hybridPreds[qId][m.documentId] || 0, m.score);
        });

        console.log(`done hybrid`);
        i++;
    }
    
    fs.writeFileSync(path.join(predDir, 'semantic.json'), JSON.stringify(semanticPreds, null, 2));
    fs.writeFileSync(path.join(predDir, 'bm25.json'), JSON.stringify(bm25Preds, null, 2));
    fs.writeFileSync(path.join(predDir, 'hybrid.json'), JSON.stringify(hybridPreds, null, 2));
    
    console.log(`Extraction done- Predictions written to py-benchmark/predictions/`);
}
    
runBenchmarkDump().catch(console.error);