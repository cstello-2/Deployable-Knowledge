// BERT ReRanker File

import { AutoTokenizer, AutoModelForSequenceClassification } from '@huggingface/transformers';

export interface Document {
  page: string | number;
  source: string;
  text?: string;
  segmentID?: string;
  score?: number;
  [key: string]: unknown;
}

export interface RerankOptions {
  limit?: number;
}

export interface RerankedDocument extends Document {
  score: number;
}

// Global cache for model to avoid reloading on every query
let tokenizer: any = null;
let model: any = null;

async function initializeModel(): Promise<void> {
  if (!tokenizer || !model) {
    const modelId = 'Xenova/ms-marco-MiniLM-L-6-v2';
    tokenizer = await AutoTokenizer.from_pretrained(modelId);
    model = await AutoModelForSequenceClassification.from_pretrained(modelId);
  }
}

function documentKey(doc: Document): string {
  if (typeof doc.segmentID === "string" && doc.segmentID.length > 0) {
    return `segment:${doc.segmentID}`;
  }
  return `location:${doc.source}:${doc.page}`;
}

function mergeDocuments(bm25Rank: Document[], vectorRank: Document[]): Map<string, Document> {
  const docs = new Map<string, Document>();

  for (const doc of vectorRank) {
    docs.set(documentKey(doc), { ...doc });
  }

  for (const doc of bm25Rank) {
    const key = documentKey(doc);
    docs.set(key, {
      ...docs.get(key),
      ...doc,
    });
  }

  return docs;
}

export async function reRankData(
  query: string,
  bm25Rank: Document[],
  vectorRank: Document[],
  options: RerankOptions = {},
): Promise<RerankedDocument[]> {
  
  const uniqueDocsMap = mergeDocuments(bm25Rank, vectorRank);
  const candidates = [...uniqueDocsMap.values()];

  if (candidates.length === 0) return [];

  await initializeModel();

  // Map query to document text string strings
  const queries = new Array(candidates.length).fill(query);
  const passages = candidates.map((doc) => doc.text as string);
  const encodedInputs = await tokenizer(queries, {
    text_pair: passages,
    padding: true,
    truncation: true,
    max_length: 512,
  });

  const { logits } = await model(encodedInputs);
  const rawScores = logits.data;

  const reranked: RerankedDocument[] = candidates.map((doc, index) => ({
    ...doc,
    score: rawScores[index],
  }));

  reranked.sort((left, right) => right.score - left.score);

  if (typeof options.limit === "number") {
    return reranked.slice(0, Math.max(0, Math.floor(options.limit)));
  }

  return reranked;
}
