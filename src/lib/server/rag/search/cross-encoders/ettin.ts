import { resolve } from 'node:path';
import { AutoModel, AutoTokenizer, type Tensor } from '@huggingface/transformers';
import { INFERENCE_THREADS } from '../../embedding-model';
import { loadEttinHeadWeights, scoreEttinHiddenStates, type EttinHeadWeights } from './ettin-head';
import { sigmoidScore, type CrossEncoder } from './cross-encoder';

const MODEL_ID = 'cross-encoder/ettin-reranker-32m-v1';
const MODEL_REVISION = 'b33e5ceb5110773ea9cf5e00c9bedc83a8c2afdd';
const MODEL_FILE_NAME = 'model_quint8_avx2';
const MODEL_CACHE_DIR = resolve(process.cwd(), '.cache', 'transformersjs');
const MAX_LENGTH = 512;
const BATCH_SIZE = 8;

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;

type Encoder = Awaited<ReturnType<typeof AutoModel.from_pretrained>>;

type EttinRuntime = {
	tokenizer: Tokenizer;
	encoder: Encoder;
	head: EttinHeadWeights;
};

type EncoderOutput = {
	last_hidden_state?: Tensor;
};

export class Ettin implements CrossEncoder {
	readonly id = 'ettin-32m';
	readonly name = 'Ettin 32M';

	private runtimePromise: Promise<EttinRuntime> | undefined;

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
				throw new Error(`Ettin returned a non-finite score at index ${index}`);
			}

			return sigmoidScore(score);
		});
	}

	private getRuntime(): Promise<EttinRuntime> {
		if (!this.runtimePromise) {
			const started = Date.now();

			console.log(`[CrossEncoder] Loading ${this.name}...`);

			this.runtimePromise = Promise.all([
				AutoTokenizer.from_pretrained(MODEL_ID, {
					revision: MODEL_REVISION,
					cache_dir: MODEL_CACHE_DIR
				}),
				AutoModel.from_pretrained(MODEL_ID, {
					revision: MODEL_REVISION,
					cache_dir: MODEL_CACHE_DIR,
					model_file_name: MODEL_FILE_NAME,
					dtype: 'fp32',
					device: 'cpu',
					session_options: {
						intraOpNumThreads: INFERENCE_THREADS,
						interOpNumThreads: 1
					}
				}),
				loadEttinHeadWeights()
			])
				.then(([tokenizer, encoder, head]) => {
					console.log(
						`[CrossEncoder] ${this.name} ready in ` +
							`${((Date.now() - started) / 1000).toFixed(1)}s.`
					);

					return {
						tokenizer,
						encoder,
						head
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
		runtime: EttinRuntime
	): Promise<number[]> {
		const queries = new Array(passages.length).fill(query);
		const inputs = await runtime.tokenizer(queries, {
			text_pair: [...passages],
			padding: true,
			truncation: true,
			max_length: MAX_LENGTH
		});
		let hiddenStates: Tensor | undefined;

		try {
			const output = (await runtime.encoder(inputs)) as EncoderOutput;

			hiddenStates = output.last_hidden_state;

			if (!hiddenStates) {
				throw new Error('Ettin ONNX encoder did not return last_hidden_state');
			}

			if (!(hiddenStates.data instanceof Float32Array)) {
				throw new Error('Ettin ONNX encoder returned a non-float32 tensor');
			}

			return scoreEttinHiddenStates(hiddenStates.data, Array.from(hiddenStates.dims), runtime.head);
		} finally {
			hiddenStates?.dispose();

			for (const tensor of Object.values(inputs)) {
				tensor.dispose();
			}
		}
	}
}
