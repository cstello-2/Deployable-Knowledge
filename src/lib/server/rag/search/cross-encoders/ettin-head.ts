import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const MODEL_ID = 'cross-encoder/ettin-reranker-32m-v1';
const MODEL_REVISION = 'b33e5ceb5110773ea9cf5e00c9bedc83a8c2afdd';
const HIDDEN_SIZE = 384;
const LAYER_NORM_EPSILON = 1e-5;

type HeadAsset = {
	cacheName: string;
	remotePath: string;
	sha256: string;
};

const HEAD_ASSETS = {
	dense: {
		cacheName: 'dense.safetensors',
		remotePath: '2_Dense/model.safetensors',
		sha256: 'ae4d8431b8ed8afeda16dd51608c4cb7e0f810724a91423dbbb867c047285000'
	},
	layerNorm: {
		cacheName: 'layer-norm.safetensors',
		remotePath: '3_LayerNorm/model.safetensors',
		sha256: '3e8b5ae0d2716b538d0cdd8664bef438f20a09a1b79654fc09f19560197d3274'
	},
	output: {
		cacheName: 'output.safetensors',
		remotePath: '4_Dense/model.safetensors',
		sha256: '03aa39279659756a52fb02cd569b97f2d1fb0d8036ab74d45c4736f358389e01'
	}
} satisfies Record<string, HeadAsset>;

const HEAD_CACHE_DIR = resolve(
	process.cwd(),
	'.cache',
	'transformersjs',
	'ettin-reranker-32m-v1',
	'head'
);

type SafeTensorDescriptor = {
	dtype: string;
	shape: number[];
	data_offsets: [number, number];
};

export type EttinHeadWeights = {
	denseWeight: Float32Array;
	layerNormWeight: Float32Array;
	layerNormBias: Float32Array;
	outputWeight: Float32Array;
	outputBias: number;
};

let headWeightsPromise: Promise<EttinHeadWeights> | undefined;

function verifyChecksum(bytes: Uint8Array, expected: string, name: string): void {
	const actual = createHash('sha256').update(bytes).digest('hex');

	if (actual !== expected) {
		throw new Error(`Checksum mismatch for Ettin asset ${name}`);
	}
}

async function loadAsset(asset: HeadAsset): Promise<Uint8Array> {
	const cachePath = resolve(HEAD_CACHE_DIR, asset.cacheName);

	try {
		const cached = await readFile(cachePath);
		verifyChecksum(cached, asset.sha256, asset.cacheName);
		return cached;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}

	const url =
		`https://huggingface.co/${MODEL_ID}/resolve/` + `${MODEL_REVISION}/${asset.remotePath}`;
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to download ${asset.remotePath}: HTTP ${response.status}`);
	}

	const bytes = new Uint8Array(await response.arrayBuffer());
	verifyChecksum(bytes, asset.sha256, asset.cacheName);

	await mkdir(dirname(cachePath), { recursive: true });

	const temporaryPath = `${cachePath}.${process.pid}.tmp`;
	await writeFile(temporaryPath, bytes);
	await rename(temporaryPath, cachePath);

	return bytes;
}

function readFloatTensor(bytes: Uint8Array, name: string, expectedShape: number[]): Float32Array {
	if (bytes.byteLength < 8) {
		throw new Error('Invalid SafeTensors file');
	}

	const fileView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const headerLength = Number(fileView.getBigUint64(0, true));
	const dataStart = 8 + headerLength;

	if (!Number.isSafeInteger(headerLength) || dataStart > bytes.byteLength) {
		throw new Error('Invalid SafeTensors header');
	}

	const headerText = new TextDecoder().decode(bytes.subarray(8, dataStart));
	const header = JSON.parse(headerText) as Record<string, SafeTensorDescriptor>;
	const descriptor = header[name];

	if (!descriptor || descriptor.dtype !== 'F32') {
		throw new Error(`Missing F32 tensor ${name}`);
	}

	if (
		descriptor.shape.length !== expectedShape.length ||
		descriptor.shape.some((dimension, index) => dimension !== expectedShape[index])
	) {
		throw new Error(`Unexpected shape for tensor ${name}`);
	}

	const [start, end] = descriptor.data_offsets;
	const elementCount = expectedShape.reduce((total, dimension) => total * dimension, 1);

	if (end - start !== elementCount * Float32Array.BYTES_PER_ELEMENT) {
		throw new Error(`Unexpected byte length for tensor ${name}`);
	}

	const tensorStart = dataStart + start;

	if (tensorStart < dataStart || dataStart + end > bytes.byteLength) {
		throw new Error(`Invalid offsets for tensor ${name}`);
	}

	const tensorView = new DataView(bytes.buffer, bytes.byteOffset + tensorStart, end - start);
	const values = new Float32Array(elementCount);

	for (let index = 0; index < elementCount; index += 1) {
		values[index] = tensorView.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
	}

	return values;
}

export function loadEttinHeadWeights(): Promise<EttinHeadWeights> {
	if (!headWeightsPromise) {
		headWeightsPromise = Promise.all([
			loadAsset(HEAD_ASSETS.dense),
			loadAsset(HEAD_ASSETS.layerNorm),
			loadAsset(HEAD_ASSETS.output)
		])
			.then(([dense, layerNorm, output]) => ({
				denseWeight: readFloatTensor(dense, 'linear.weight', [HIDDEN_SIZE, HIDDEN_SIZE]),
				layerNormWeight: readFloatTensor(layerNorm, 'norm.weight', [HIDDEN_SIZE]),
				layerNormBias: readFloatTensor(layerNorm, 'norm.bias', [HIDDEN_SIZE]),
				outputWeight: readFloatTensor(output, 'linear.weight', [1, HIDDEN_SIZE]),
				outputBias: readFloatTensor(output, 'linear.bias', [1])[0]
			}))
			.catch((error) => {
				headWeightsPromise = undefined;
				throw error;
			});
	}

	return headWeightsPromise;
}

function erf(value: number): number {
	const sign = value < 0 ? -1 : 1;
	const absolute = Math.abs(value);
	const scale = 1 / (1 + 0.3275911 * absolute);
	const polynomial =
		((((1.061405429 * scale - 1.453152027) * scale + 1.421413741) * scale - 0.284496736) * scale +
			0.254829592) *
		scale;

	return sign * (1 - polynomial * Math.exp(-absolute * absolute));
}

function gelu(value: number): number {
	return 0.5 * value * (1 + erf(value / Math.SQRT2));
}

export function scoreEttinHiddenStates(
	hiddenStates: Float32Array,
	dimensions: number[],
	weights: EttinHeadWeights
): number[] {
	if (dimensions.length !== 3 || dimensions[2] !== HIDDEN_SIZE) {
		throw new Error(`Unexpected Ettin output dimensions: ${dimensions.join('x')}`);
	}

	const [batchSize, sequenceLength] = dimensions;
	const expectedLength = batchSize * sequenceLength * HIDDEN_SIZE;

	if (hiddenStates.length !== expectedLength) {
		throw new Error('Ettin output length does not match its dimensions');
	}

	const scores: number[] = [];

	for (let batch = 0; batch < batchSize; batch += 1) {
		const clsOffset = batch * sequenceLength * HIDDEN_SIZE;
		const dense = new Float32Array(HIDDEN_SIZE);

		for (let output = 0; output < HIDDEN_SIZE; output += 1) {
			const weightOffset = output * HIDDEN_SIZE;
			let value = 0;

			for (let input = 0; input < HIDDEN_SIZE; input += 1) {
				value += hiddenStates[clsOffset + input] * weights.denseWeight[weightOffset + input];
			}

			dense[output] = gelu(value);
		}

		let mean = 0;

		for (const value of dense) {
			mean += value;
		}

		mean /= HIDDEN_SIZE;

		let variance = 0;

		for (const value of dense) {
			const difference = value - mean;
			variance += difference * difference;
		}

		variance /= HIDDEN_SIZE;
		const denominator = Math.sqrt(variance + LAYER_NORM_EPSILON);
		let score = weights.outputBias;

		for (let index = 0; index < HIDDEN_SIZE; index += 1) {
			const normalized =
				((dense[index] - mean) / denominator) * weights.layerNormWeight[index] +
				weights.layerNormBias[index];

			score += normalized * weights.outputWeight[index];
		}

		scores.push(score);
	}

	return scores;
}
