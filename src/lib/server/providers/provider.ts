import type { LlamaGpuMode } from '$lib/types';

export type ProviderChatOptions = {
	temperature?: number;
	topK?: number;
	maxTokens?: number;
	reasoningBudget?: number;
	gpuMode?: LlamaGpuMode;
	tools?: ProviderToolDefinition[];
	signal?: AbortSignal;
};

export type ProviderToolDefinition = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
};

export type ProviderToolCall = {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
};

export type ProviderChatMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	reasoning_content?: string;
	tool_calls?: ProviderToolCall[];
	tool_call_id?: string;
	name?: string;
};

export type ProviderToolCallDelta = {
	index?: number;
	id?: string;
	function?: { name?: string; arguments?: string };
};

export type ProviderChatChunk = {
	content?: string | null;
	reasoning_content?: string | null;
	tool_calls?: ProviderToolCallDelta[];
};

export abstract class Provider {
	abstract id: string;
	abstract name: string;

	async *chat(
		prompt: string,
		model: string,
		options: ProviderChatOptions = {}
	): AsyncGenerator<string> {
		for await (const chunk of this.streamChat(
			[{ role: 'user', content: prompt }],
			model,
			options
		)) {
			if (chunk.content) yield chunk.content;
		}
	}

	abstract streamChat(
		messages: ProviderChatMessage[],
		model: string,
		options?: ProviderChatOptions
	): AsyncGenerator<ProviderChatChunk>;

	abstract listModels(): Promise<string[]>;

	async supportsTools(_model: string): Promise<boolean> {
		return true;
	}
}
