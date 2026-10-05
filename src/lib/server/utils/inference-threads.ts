import { availableParallelism } from 'node:os';

export const INFERENCE_THREADS = Math.max(1, Math.min(8, Math.floor(availableParallelism() / 4)));
