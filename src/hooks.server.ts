import { seedBM25FromDatabase } from '$lib/server/rag/bm25';

// --- SERVER STARTUP ---

// Top-level await runs once at boot before any requests are handled
// This guarantees the BM25 index is warm before the first search query arrives
// Using top-level await instead of handle() prevents re-seeding on every request
await seedBM25FromDatabase();

// --- REQUEST HANDLE HOOK ---

// SvelteKit requires a named handle export — pass all requests straight through for now
// Add auth guards, CORS headers, etc. here later if needed
export async function handle({ event, resolve }: { event: any; resolve: any })
{
    return resolve(event);
}
