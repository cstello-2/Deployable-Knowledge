// Small CLI harness for inspecting semantic search output during retrieval tuning.

import {
  searchSemantic,
  type SemanticSearchChunkType,
} from "./semantic-search";

const args = process.argv.slice(2);

let query = "";
let topK = 5;
let asJson = false;
let showFullText = false;
const documentIds: string[] = [];
const sourcePaths: string[] = [];
const chunkTypes: SemanticSearchChunkType[] = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--query" || arg === "-q") {
    query = args[index + 1] ?? "";
    index += 1;
    continue;
  }

  if (arg === "--top-k" || arg === "-k") {
    topK = Number(args[index + 1] ?? topK);
    index += 1;
    continue;
  }

  if (arg === "--document-id") {
    const value = args[index + 1]?.trim();
    if (value) {
      documentIds.push(value);
    }
    index += 1;
    continue;
  }

  if (arg === "--source-path") {
    const value = args[index + 1]?.trim();
    if (value) {
      sourcePaths.push(value);
    }
    index += 1;
    continue;
  }

  if (arg === "--chunk-type") {
    const value = (args[index + 1] ?? "").trim().toUpperCase();
    if (value === "TEXT" || value === "TABLE" || value === "IMAGE") {
      chunkTypes.push(value);
    } else if (value) {
      throw new Error(`Unsupported chunk type: ${value}`);
    }
    index += 1;
    continue;
  }

  if (arg === "--json") {
    asJson = true;
    continue;
  }

  if (arg === "--full") {
    showFullText = true;
    continue;
  }

  if (arg === "--help" || arg === "-h") {
    console.log([
      "Semantic search harness",
      "",
      "Options:",
      "  --query, -q <text>         Query text to embed and search",
      "  --top-k, -k <number>       Number of results to return",
      "  --document-id <id>         Optional document id filter, repeatable",
      "  --source-path <path>       Optional source path filter, repeatable",
      "  --chunk-type <type>        Optional chunk type filter: TEXT | TABLE | IMAGE",
      "  --json                     Print the full result payload as JSON",
      "  --full                     Print full chunk text instead of truncating",
    ].join("\n"));
    process.exit(0);
  }
}

if (!query.trim()) {
  throw new Error("Missing query. Pass --query \"...\".");
}

const result = await searchSemantic({
  query,
  topK,
  documentIds,
  sourcePaths,
  chunkTypes,
});

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log(`Query: ${result.query}`);
console.log(`Model: ${result.embeddingModel}`);
console.log(
  `Timings: total=${result.timings.totalMs}ms embed=${result.timings.embedMs}ms load=${result.timings.loadCandidatesMs}ms decode=${result.timings.decodeEmbeddingsMs}ms score=${result.timings.scoreMs}ms sort=${result.timings.sortMs}ms`,
);
console.log(
  `Candidates: ${result.timings.candidateCount} -> Returned: ${result.timings.returnedCount}`,
);

if (result.results.length === 0) {
  console.log("\nNo results.");
  process.exit(0);
}

for (const [index, row] of result.results.entries()) {
  const content = showFullText
    ? row.content
    : row.content.length > 280
      ? `${row.content.slice(0, 280)}...`
      : row.content;

  console.log(`\n#${index + 1} score=${row.score.toFixed(6)}`);
  console.log(`type=${row.chunkType} page=${row.pageIndex} chunk=${row.chunkIndex}`);
  console.log(`document=${row.documentId}`);
  console.log(`source=${row.sourceTitle}`);
  console.log(content);
}
