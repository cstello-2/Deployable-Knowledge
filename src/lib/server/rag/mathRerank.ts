export interface Document {
  page: string | number;
  source: string;
  text?: string;
  segmentID?: string;
  score?: number;
  [key: string]: unknown;
}

export interface RerankOptions {
  bm25Weight?: number;
  vectorWeight?: number;
  rankConstant?: number;
  missingRank?: number;
  limit?: number;
}

export interface RerankedDocument extends Document {
  score: number;
  bm25Rank?: number;
  vectorRank?: number;
  bm25Score: number;
  vectorScore: number;
}

const DEFAULT_BM25_WEIGHT = 0.411111;
const DEFAULT_VECTOR_WEIGHT = 0.588888;
const DEFAULT_RANK_CONSTANT = 60;
const DEFAULT_MISSING_RANK = 100;

function documentKey(doc: Document): string {
  if (typeof doc.segmentID === "string" && doc.segmentID.length > 0) {
    return `segment:${doc.segmentID}`;
  }

  return `location:${doc.source}:${doc.page}`;
}

function rankContribution(
  rank: number | undefined,
  weight: number,
  rankConstant: number,
  missingRank: number,
): number {
  return weight / (rankConstant + (rank ?? missingRank));
}

function rankDocuments(docs: Document[]): Map<string, number> {
  const ranks = new Map<string, number>();

  docs.forEach((doc, index) => {
    const key = documentKey(doc);

    if (!ranks.has(key)) {
      ranks.set(key, index + 1);
    }
  });

  return ranks;
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

export function weightedReciprocalRankRerank(
  bm25Rank: Document[],
  vectorRank: Document[],
  options: RerankOptions = {},
): RerankedDocument[] {
  const bm25Weight = options.bm25Weight ?? DEFAULT_BM25_WEIGHT;
  const vectorWeight = options.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
  const rankConstant = options.rankConstant ?? DEFAULT_RANK_CONSTANT;
  const missingRank = options.missingRank ?? DEFAULT_MISSING_RANK;

  const bm25Ranks = rankDocuments(bm25Rank);
  const vectorRanks = rankDocuments(vectorRank);
  const docs = mergeDocuments(bm25Rank, vectorRank);

  const reranked = [...docs.entries()].map(([key, doc]) => {
    const bm25RankValue = bm25Ranks.get(key);
    const vectorRankValue = vectorRanks.get(key);
    const bm25Score = rankContribution(
      bm25RankValue,
      bm25Weight,
      rankConstant,
      missingRank,
    );
    const vectorScore = rankContribution(
      vectorRankValue,
      vectorWeight,
      rankConstant,
      missingRank,
    );

    return {
      ...doc,
      score: bm25Score + vectorScore,
      bm25Rank: bm25RankValue,
      vectorRank: vectorRankValue,
      bm25Score,
      vectorScore,
    };
  });

  reranked.sort((left, right) => right.score - left.score);

  if (typeof options.limit === "number") {
    return reranked.slice(0, Math.max(0, Math.floor(options.limit)));
  }

  return reranked;
}

export function reRankData(
  bm25Rank: Document[],
  vectorRank: Document[],
  options?: RerankOptions,
): RerankedDocument[] {
  return weightedReciprocalRankRerank(bm25Rank, vectorRank, options);
}
