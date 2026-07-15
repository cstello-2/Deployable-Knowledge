// Cross-encoder relevance scorer.

import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
} from "@huggingface/transformers";

export type RerankCandidate = {
  chunkId: string;
  content: string;
};

let tokenizer: any = null;
let model: any = null;

async function initializeModel() {
  if (!tokenizer || !model) {
    const modelId = "Xenova/ms-marco-MiniLM-L-6-v2";
    tokenizer = await AutoTokenizer.from_pretrained(modelId);
    model = await AutoModelForSequenceClassification.from_pretrained(modelId);
  }
}

export async function rerankCandidates(
  query: string,
  candidates: RerankCandidate[],
): Promise<RerankCandidate[]> {
  const uniqueCandidates = [
    ...new Map(candidates.map((candidate) => [candidate.chunkId, candidate])).values(),
  ];

  if (uniqueCandidates.length === 0) return [];

  await initializeModel();

  const queries = new Array(uniqueCandidates.length).fill(query);
  const passages = uniqueCandidates.map((candidate) => candidate.content);
  const encodedInputs = await tokenizer(queries, {
    text_pair: passages,
    padding: true,
    truncation: true,
    max_length: 512,
  });
  const { logits } = await model(encodedInputs);

  return uniqueCandidates
    .map((candidate, index) => ({
      candidate,
      logit: Number(logits.data[index]),
    }))
    .sort((left, right) => right.logit - left.logit)
    .map(({ candidate }) => candidate);
}
