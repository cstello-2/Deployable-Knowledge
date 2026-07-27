import { readObject } from '$lib/server/utils/values';
import type {
	ProviderChatChunk,
	ProviderChatMessage,
	ProviderToolCall,
	ProviderToolCallDelta
} from './provider';

type ChatCodecOptions = Readonly<{
	assistantNullContent: 'empty' | 'preserve';
	reasoningField: 'reasoning_content' | 'thinking';
	toolArguments: 'json' | 'string';
	toolCallChunks: 'delta' | 'snapshot';
	toolResultNameField: 'name' | 'tool_name';
}>;

type WireChatMessage = {
	role: ProviderChatMessage['role'];
	content: string | null;
	[key: string]: unknown;
};

export type ChatCodec = Readonly<{
	decodeChunk(value: unknown): ProviderChatChunk | null;
	encodeMessage(message: ProviderChatMessage): WireChatMessage;
}>;

export function createChatCodec(options: ChatCodecOptions): ChatCodec {
	return {
		decodeChunk: (value) => decodeChunk(value, options),
		encodeMessage: (message) => encodeMessage(message, options)
	};
}

function encodeMessage(message: ProviderChatMessage, options: ChatCodecOptions): WireChatMessage {
	const encoded: WireChatMessage = {
		role: message.role,
		content:
			message.content ??
			(message.role === 'assistant' && options.assistantNullContent === 'preserve' ? null : '')
	};

	if (message.role === 'assistant') {
		if (message.reasoningContent) encoded[options.reasoningField] = message.reasoningContent;
		if (message.toolCalls?.length) {
			encoded.tool_calls = message.toolCalls.map((call) => encodeToolCall(call, options));
		}
	}

	if (message.role === 'tool') {
		if (message.toolCallId) encoded.tool_call_id = message.toolCallId;
		if (message.name) encoded[options.toolResultNameField] = message.name;
	}

	return encoded;
}

function encodeToolCall(call: ProviderToolCall, options: ChatCodecOptions) {
	return {
		id: call.id,
		type: call.type,
		function: {
			name: call.function.name,
			arguments:
				options.toolArguments === 'json'
					? (JSON.parse(call.function.arguments || '{}') as unknown)
					: call.function.arguments
		}
	};
}

function decodeChunk(value: unknown, options: ChatCodecOptions): ProviderChatChunk | null {
	const message = readObject(value);
	const reasoning = message[options.reasoningField];
	const content = typeof message.content === 'string' ? message.content : '';
	const reasoningContent = typeof reasoning === 'string' ? reasoning : '';
	const toolCalls = Array.isArray(message.tool_calls)
		? message.tool_calls.map((call, index) => decodeToolCall(call, index, options))
		: [];

	if (!content && !reasoningContent && !toolCalls.length) return null;

	return {
		...(content ? { content } : {}),
		...(reasoningContent ? { reasoningContent } : {}),
		...(toolCalls.length ? { toolCalls } : {})
	};
}

function decodeToolCall(
	value: unknown,
	fallbackIndex: number,
	options: ChatCodecOptions
): ProviderToolCallDelta {
	const call = readObject(value);
	const fn = readObject(call.function);
	const index = Number.isInteger(call.index) ? Number(call.index) : fallbackIndex;
	const id = typeof call.id === 'string' && call.id ? call.id : undefined;
	const name = typeof fn.name === 'string' && fn.name ? fn.name : undefined;

	if (options.toolCallChunks === 'snapshot') {
		return {
			index,
			id,
			nameSnapshot: name,
			argumentsSnapshot: fn.arguments ?? {}
		};
	}

	return {
		index,
		id,
		nameDelta: name,
		...(typeof fn.arguments === 'string'
			? { argumentsDelta: fn.arguments }
			: { argumentsSnapshot: fn.arguments ?? {} })
	};
}
