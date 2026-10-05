export interface CrossEncoder {
	readonly id: string;
	readonly name: string;

	predict(query: string, passages: readonly string[]): Promise<readonly number[]>;
}

export function sigmoidScore(value: number): number {
	return 1 / (1 + Math.exp(-value));
}
