import type { EmbeddingDevice, EmbeddingTask } from '$lib/constants';
import type { EmbeddingBackend } from '$lib/types';

export abstract class EmbeddingProvider {
	abstract id: string;
	abstract name: string;

	/** Returns one L2-normalized vector per text, so a dot product is the cosine similarity. */
	abstract embed(
		texts: string[],
		task: EmbeddingTask,
		model: string,
		device: EmbeddingDevice
	): Promise<Float32Array[]>;

	async isInstalled(_model: string): Promise<boolean> {
		return true;
	}

	backend(): EmbeddingBackend | null {
		return null;
	}

	async unload(): Promise<void> {}
}

export function normalizeVector(values: readonly number[]): Float32Array {
	const length = Math.hypot(...values);
	return Float32Array.from(values, (value) => value / length);
}
