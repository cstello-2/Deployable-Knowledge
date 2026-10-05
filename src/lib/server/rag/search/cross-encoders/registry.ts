import { Ettin } from './ettin';
import { MsMarco } from './ms-marco';
import type { CrossEncoder } from './cross-encoder';

export const DEFAULT_CROSS_ENCODER_ID = 'ettin-32m';

const builtInCrossEncoders: CrossEncoder[] = [new Ettin(), new MsMarco()];

export function listBuiltInCrossEncoders(): CrossEncoder[] {
	return [...builtInCrossEncoders];
}

export function findCrossEncoder(id: string): CrossEncoder | null {
	return builtInCrossEncoders.find((crossEncoder) => crossEncoder.id === id) ?? null;
}

export function getActiveCrossEncoder(): CrossEncoder {
	const configuredId = process.env.RAG_CROSS_ENCODER?.trim() || DEFAULT_CROSS_ENCODER_ID;
	const crossEncoder = findCrossEncoder(configuredId);

	if (!crossEncoder) {
		throw new Error(`Cross-encoder "${configuredId}" is unavailable.`);
	}

	return crossEncoder;
}
