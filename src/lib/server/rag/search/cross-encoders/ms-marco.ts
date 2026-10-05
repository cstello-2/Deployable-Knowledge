import { resolve } from 'node:path';
import {
	AutoModelForSequenceClassification,
	AutoTokenizer,
	type Tensor
} from '@huggingface/transformers';
import { INFERENCE_THREADS } from '../../embedding-model';
import { sigmoidScore, type CrossEncoder } from './cross-encoder';

const MODEL_ID = 'Xenova/ms-marco-MiniLM-L-6-v2';
const MODEL_CACHE_DIR = resolve(process.cwd(), '.cache', 'transformersjs');
const MAX_LENGTH = 512;
const BATCH_SIZE = 32;

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;

type ClassificationModel = Awaited<
	ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>
>;

type MsMarcoRuntime = {
	tokenizer: Tokenizer;
	model: ClassificationModel;
};

export class MsMarco implements CrossEncoder {
	readonly id = 'ms-marco-minilm-l6-v2';
	readonly name = 'MS Marco MiniLM L6';

	private runtimePromise: Promise<MsMarcoRuntime> | undefined;

	async predict(query: string, passages: readonly string[]): Promise<readonly number[]> {
		if (passages.length === 0) {
			return [];
		}

		const runtime = await this.getRuntime();
		const rawScores: number[] = [];

		for (let offset = 0; offset < passages.length; offset += BATCH_SIZE) {
			const batch = passages.slice(offset, offset + BATCH_SIZE);

			rawScores.push(...(await this.scoreBatch(query, batch, runtime)));
		}

		return rawScores.map((score, index) => {
			if (!Number.isFinite(score)) {
				throw new Error(`MS Marco returned a non-finite score at index ${index}`);
			}

			return sigmoidScore(score);
		});
	}

	private getRuntime(): Promise<MsMarcoRuntime> {
		if (!this.runtimePromise) {
			const started = Date.now();

			console.log(`[CrossEncoder] Loading ${this.name}...`);

			this.runtimePromise = Promise.all([
				AutoTokenizer.from_pretrained(MODEL_ID, {
					cache_dir: MODEL_CACHE_DIR
				}),
				AutoModelForSequenceClassification.from_pretrained(MODEL_ID, {
					cache_dir: MODEL_CACHE_DIR,
					session_options: {
						intraOpNumThreads: INFERENCE_THREADS,
						interOpNumThreads: 1
					}
				})
			])
				.then(([tokenizer, model]) => {
					console.log(
						`[CrossEncoder] ${this.name} ready in ` +
							`${((Date.now() - started) / 1000).toFixed(1)}s.`
					);

					return {
						tokenizer,
						model
					};
				})
				.catch((error) => {
					this.runtimePromise = undefined;
					throw error;
				});
		}

		return this.runtimePromise;
	}

	private async scoreBatch(
		query: string,
		passages: readonly string[],
		runtime: MsMarcoRuntime
	): Promise<number[]> {
		const queries = new Array(passages.length).fill(query);
		const inputs = await runtime.tokenizer(queries, {
			text_pair: [...passages],
			padding: true,
			truncation: true,
			max_length: MAX_LENGTH
		});
		let logits: Tensor | undefined;

		try {
			const output = await runtime.model(inputs);
			logits = output.logits;

			if (!logits) {
				throw new Error('MS Marco did not return logits');
			}

			if (!(logits.data instanceof Float32Array)) {
				throw new Error('MS Marco returned a non-float32 tensor');
			}

			if (logits.data.length !== passages.length) {
				throw new Error('MS Marco score count does not match the passage count');
			}

			return Array.from(logits.data);
		} finally {
			logits?.dispose();

			for (const tensor of Object.values(inputs)) {
				tensor.dispose();
			}
		}
	}
}
