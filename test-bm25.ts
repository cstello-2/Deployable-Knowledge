import { seedBM25FromDatabase } from './src/lib/server/rag/bm25.ts';
import { hybridSearch } from './src/lib/server/rag/hybrid-search.ts';

// Change this to something you know is in your documents
const TEST_QUERY = 'how do I put on a tourniquet';
const TOP_K = 5;

async function run()
{
    // Load all chunks from SQLite into the BM25 engine
    await seedBM25FromDatabase();

    console.log(`\nSearching for: "${TEST_QUERY}"\n`);

    const results = await hybridSearch(TEST_QUERY, TOP_K);

    if (results.length === 0)
    {
        console.log("No results — either the DB is empty or the query didn't match anything.");
        return;
    }

    // Print each result so you can eyeball whether the rankings look right
    results.forEach((doc: any, i: number) => {
        console.log(`--- Result ${i + 1} ---`);
        console.log(`Score:   ${doc.score}`);
        console.log(`Page:    ${doc.page}`);
        console.log(`Source:  ${doc.source}`);
        console.log(`Preview: ${doc.text.slice(0, 200).trim()}...`);
        console.log();
    });
}

run().catch(console.error);
