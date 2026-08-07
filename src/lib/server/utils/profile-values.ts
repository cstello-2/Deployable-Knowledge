import type { LlamaGpuMode } from '$lib/types';

const GPU_MODES: readonly LlamaGpuMode[] = ['auto', 'cpu', 'cuda', 'vulkan'];

export function sanitizeContextSize(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 1024) return null;
	return Math.floor(value);
}

export function sanitizeGpuMode(value: unknown): LlamaGpuMode {
	return GPU_MODES.includes(value as LlamaGpuMode) ? (value as LlamaGpuMode) : 'auto';
}
