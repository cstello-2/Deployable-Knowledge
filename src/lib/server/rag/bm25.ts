import * as path from 'path';
import * as fs from 'fs';
import BM25Engine from 'wink-bm25-text-search';
import { stemmer } from 'stemmer';
import { eng } from 'stopword';

// Note: Ensure your custom PDF extractors are imported correctly
// import { parsePdf, extractPdfImages } from './core/rag/chunking';

// Interfaces for structured data
interface PageTextData {
    text: string;
    page: number;
}

interface PageImageData {
    page: number;
    [key: string]: any; 
}

// Global BM25 Engine Setup
const engine = BM25Engine();
const stopWordsSet = new Set(eng); // Python-equivalent English stopwords

engine.defineConfig({
    fldWeights: { text: 1 }
});

// Text prep pipeline: Clean -> Tokenize -> Filter Stopwords -> Stem
engine.definePrepTasks([
    (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ''),
    (text: string) => text.split(/\s+/),
    (tokens: string[]) => tokens
        .filter(token => token.length > 0 && !stopWordsSet.has(token))
        .map(token => stemmer(token))
]);

// Stub functions simulating your custom PDF utilities
async function parsePdf(filePath: string): Promise<PageTextData[]> {
    // Your actual PDF text extraction implementation goes here
    return [];
}

async function extractPdfImages(filePath: string): Promise<PageImageData[]> {
    // Your actual PDF image extraction implementation goes here
    return [];
}

// Utility to suppress console.log (equivalent to suppress_stdout)
async function suppressStdout<T>(fn: () => Promise<T>): Promise<T> {
    const originalLog = console.log;
    console.log = () => {}; 
    try {
        return await fn();
    } finally {
        console.log = originalLog; 
    }
}

async function getCorpus() {
    console.log("Getting corpus...");
    
    const corpusGet: PageTextData[][] = [];
    const corpusPicGet: PageImageData[][] = [];
    
    const baseDir = process.cwd();
    const documentsDir = path.join(baseDir, 'documents');
    
    if (fs.existsSync(documentsDir)) {
        const files = fs.readdirSync(documentsDir);
        const pdfFiles = files.filter((file: string) => file.endsWith('.pdf'));
        
        for (const file of pdfFiles) {
            const filePath = path.join(documentsDir, file);
            
            corpusGet.push(await parsePdf(filePath));
            
            const picData = await suppressStdout(() => extractPdfImages(filePath));
            corpusPicGet.push(picData);
        }
    }

    const corpusText: string[] = [];
    const corpusPageNum: number[] = [];
    const corpusPicData: PageImageData[] = [];
    
    for (const pageDict of corpusGet) {
        for (const item of pageDict) {
            corpusText.push(item.text);
            corpusPageNum.push(item.page);
        }
    }

    for (const picInfo of corpusPicGet) {
        corpusPicData.push(...picInfo);
    }
    
    return { corpusText, corpusPageNum, corpusPicData };
}

function testQuery(): string {
    console.log("Getting query...");
    return "How do I perform a 9-line when reporting an injured soldier?";
}

function tokenizeCorpus(corpusText: string[]): void {
    console.log("Tokenizing and indexing corpus...");
    
    corpusText.forEach((text, index) => {
        // Wink BM25 indexes documents as objects with unique string keys
        engine.addDoc({ text: text }, index.toString());
    });
    
    engine.consolidate();
}

function ranker(queryText: string) {
    console.log("Ranking results...");
    // Wink automatically tokenizes, removes stopwords, and stems the query internally
    const rawResults = engine.search(queryText, 10);
    
    // Format to match Python's [results, scores] matrix structure
    const results = [rawResults.map(r => parseInt(r[0]))];
    const scores = [rawResults.map(r => r[1])];
    
    return { results, scores };
}

function finalResults(
    results: number[][], 
    scores: number[][], 
    corpusData: number[], 
    picData: PageImageData[]
) {
    console.log("Final results:\n");
    
    const queryResults = results[0];
    const queryScores = scores[0];

    if (!queryResults || queryResults.length === 0) {
        console.log("No matching results found.");
        return;
    }

    for (let i = 0; i < queryResults.length; i++) {
        const docIndex = queryResults[i];
        const score = queryScores[i];
        
        console.log(`Rank ${i + 1} (score: ${score.toFixed(2)}): Document Index ${docIndex}`);
        console.log("Page number: " + corpusData[docIndex]);

        for (const x of picData) {
            if (x.page === corpusData[docIndex]) {
                console.log("Associated Image Data:", x);
            }
        }
        console.log(""); // Empty line for spacing
    }
}

async function main() {
    // 1. Load data
    const { corpusText, corpusPageNum, corpusPicData } = await getCorpus();
    const query = testQuery();
    
    // 2. Index & Search
    tokenizeCorpus(corpusText);
    const { results, scores } = ranker(query);
    
    // 3. Display Outputs
    finalResults(results, scores, corpusPageNum, corpusPicData);
    console.log("Done");
}

// Run script
main();