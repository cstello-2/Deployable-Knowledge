import type {
	Provider,
	ProviderChatMessage,
	ProviderChatOptions,
	ProviderToolCall,
	ProviderToolCallDelta
} from '../providers/provider';
import type { ToolRegistry } from '../tools/registry';
import type { ToolExecutionContext, ToolExecutionResult } from '../tools/types';
import type { AgentOutput, AgentTraceItem } from '$lib/types';
import { createReasoningTrace, createToolTrace } from '$lib/utils/agent-trace';
import type { AgentProgressEvent } from '$lib/types';
import {
	AGENT_MAX_TURNS_MIN,
	DEFAULT_ASSISTANT_CONFIG,
	ESTIMATED_CHARACTERS_PER_TOKEN
} from '$lib/constants';
import { readObject } from '../utils/values';
import { readGoals, unfinishedGoals } from '../tools/goals';
import {
	logAgentComplete,
	logModelCall,
	logStreamContent,
	logStreamEnd,
	logStreamReasoning,
	logStreamStart,
	logToolExecutionResult,
	logToolExecutionStart
} from './dev-log';

export type AgentToolExecution = {
	id: string;
	name: string;
	arguments: unknown;
	isError: boolean;
	error?: string;
	outputCount: number;
};

export type AgentRunResult = {
	content: string;
	modelTurns: number;
	toolTurns: number;
	toolExecutions: AgentToolExecution[];
	outputs: AgentOutput[];
	trace: AgentTraceItem[];
};

export async function runAgent({
	provider,
	model,
	messages,
	chatOptions,
	registry,
	toolNames,
	toolContext = {},
	maxToolTurns = DEFAULT_ASSISTANT_CONFIG.agentMaxTurns,
	onProgress,
	onText,
	onTextReset
}: {
	provider: Provider;
	model: string;
	messages: ProviderChatMessage[];
	chatOptions: ProviderChatOptions;
	registry: ToolRegistry;
	toolNames: readonly string[];
	toolContext?: ToolExecutionContext;
	maxToolTurns?: number;
	onProgress?: (event: AgentProgressEvent) => void;
	onText?: (text: string) => void;
	onTextReset?: () => void;
}): Promise<AgentRunResult> {
	const transcript = [...messages];
	const definitions = registry.definitions(toolNames);
	const maxTurns = clampAgentMaxTurns(maxToolTurns);
	const executions: AgentToolExecution[] = [];
	const outputs = new Map<string, AgentOutput>();
	const trace: AgentTraceItem[] = [];
	const compactBudgetChars = transcriptBudgetChars(chatOptions);
	let toolTurns = 0;
	let modelTurns = 0;
	let forceFinalAnswer = false;
	let emptyTurnRetried = false;
	let fruitlessNudges = 0;
	let lastNudgeSnapshot = '';

	while (true) {
		chatOptions.signal?.throwIfAborted();
		compactTranscript(transcript, compactBudgetChars);
		const toolsAvailable = !forceFinalAnswer && toolTurns < maxTurns && definitions.length > 0;
		onProgress?.({
			kind: 'model',
			status: 'started',
			modelTurn: modelTurns + 1,
			toolTurn: toolTurns
		});
		const reasoningTraceId = `reasoning-${modelTurns + 1}`;
		let lastReasoningEmit = 0;
		const turnOptions: ProviderChatOptions = {
			...chatOptions,
			tools: toolsAvailable ? definitions : undefined,
			toolChoice: toolsAvailable ? 'auto' : 'none',
			parallelToolCalls: true
		};
		logModelCall({
			providerName: provider.name,
			model,
			modelTurn: modelTurns + 1,
			messages: transcript,
			options: turnOptions
		});
		const turn = await collectTurn(
			provider,
			transcript,
			model,
			turnOptions,
			modelTurns,
			onText,
			(reasoning) => {
				const now = Date.now();
				if (now - lastReasoningEmit < 250) return;
				lastReasoningEmit = now;
				onProgress?.({
					kind: 'model',
					status: 'started',
					modelTurn: modelTurns + 1,
					toolTurn: toolTurns,
					trace: createReasoningTrace(reasoningTraceId, reasoning, 'running')
				});
			}
		);
		modelTurns += 1;
		const reasoningTrace = turn.reasoningContent.trim()
			? createReasoningTrace(`reasoning-${modelTurns}`, turn.reasoningContent)
			: undefined;
		if (reasoningTrace) trace.push(reasoningTrace);
		onProgress?.({
			kind: 'model',
			status: 'completed',
			modelTurn: modelTurns,
			toolTurn: toolTurns,
			requestedTools: turn.toolCalls.map((call) => call.function.name),
			...(reasoningTrace ? { trace: reasoningTrace } : {})
		});

		if (!turn.toolCalls.length || !toolsAvailable) {
			const unfinished = unfinishedGoals(toolContext);
			if (toolsAvailable && !turn.toolCalls.length && unfinished.length > 0) {
				const snapshot = `${toolTurns}:${JSON.stringify(readGoals(toolContext))}`;
				fruitlessNudges = snapshot === lastNudgeSnapshot ? fruitlessNudges + 1 : 0;
				lastNudgeSnapshot = snapshot;

				if (fruitlessNudges < 2) {
					if (turn.content) transcript.push({ role: 'assistant', content: turn.content });
					if (turn.contentChunks.length) onTextReset?.();
					transcript.push({
						role: 'user',
						content: `Do not answer yet. These goals are still unfinished:\n${unfinished
							.map((goal) => `- ${goal.text}`)
							.join(
								'\n'
							)}\nContinue now: work on the next unfinished goal using tools. When a goal is complete, update the goals tool with done: true and record what you found in its answer field. Give the final answer only when every goal is done.`
					});
					continue;
				}
			}

			if (!turn.content && !forceFinalAnswer) {
				if (!emptyTurnRetried) {
					emptyTurnRetried = true;
					transcript.push({
						role: 'user',
						content:
							'Continue. Use tools if you still need information, or give your complete final answer now. Answer every part of the request.'
					});
					continue;
				}
				forceFinalAnswer = true;
				transcript.push({
					role: 'user',
					content:
						'Give your complete final answer to my request now, using the information gathered above. Answer every part of the request. Do not call any more tools.'
				});
				continue;
			}

			const finalContent =
				turn.content ||
				(turn.toolCalls.length
					? "I couldn't produce a final response within the configured tool-turn limit."
					: "I couldn't produce a final response.");

			if (!turn.contentChunks.length) onText?.(finalContent);

			logAgentComplete({ modelTurns, toolTurns });

			return {
				content: finalContent,
				modelTurns,
				toolTurns,
				toolExecutions: executions,
				outputs: [...outputs.values()],
				trace
			};
		}

		if (turn.contentChunks.length) onTextReset?.();

		transcript.push({
			role: 'assistant',
			content: turn.content || null,
			reasoningContent: turn.reasoningContent || undefined,
			toolCalls: turn.toolCalls
		});

		for (const call of turn.toolCalls) {
			chatOptions.signal?.throwIfAborted();
			const parsedArguments = parseJson(call.function.arguments);
			const runningTrace = createToolTrace({
				id: call.id,
				name: call.function.name,
				argumentsValue: parsedArguments,
				status: 'running'
			});
			onProgress?.({
				kind: 'tool',
				status: 'started',
				modelTurn: modelTurns,
				toolTurn: toolTurns + 1,
				callId: call.id,
				name: call.function.name,
				trace: runningTrace
			});
			logToolExecutionStart(call.function.name, parsedArguments);
			const result = await registry.executeCall(call, toolContext);
			logToolExecutionResult(call.function.name, result);
			const toolError = result.isError ? readToolError(result) : '';
			const callOutputs = result.outputs ?? [];
			const completedTrace = createToolTrace({
				id: call.id,
				name: call.function.name,
				argumentsValue: parsedArguments,
				resultValue: result.data ?? parseJson(result.content),
				status: result.isError ? 'error' : 'complete',
				isError: result.isError
			});
			trace.push(completedTrace);

			executions.push({
				id: call.id,
				name: call.function.name,
				arguments: parsedArguments,
				isError: result.isError ?? false,
				outputCount: callOutputs.length,
				...(toolError ? { error: toolError } : {})
			});
			onProgress?.({
				kind: 'tool',
				status: 'completed',
				modelTurn: modelTurns,
				toolTurn: toolTurns + 1,
				callId: call.id,
				name: call.function.name,
				trace: completedTrace,
				isError: result.isError ?? false,
				...(toolError ? { error: toolError } : {})
			});

			for (const output of callOutputs) {
				outputs.set(`${output.type}:${output.id}`, {
					...output,
					toolCallId: call.id,
					toolName: call.function.name
				});
			}

			transcript.push({
				role: 'tool',
				content: result.content,
				toolCallId: call.id,
				name: call.function.name
			});
		}

		toolTurns += 1;
	}
}

const KEEP_RECENT_TOOL_RESULTS = 2;
const MIN_COMPACT_BUDGET_CHARS = 24_000;
const COMPACT_SKIP_UNDER_CHARS = 320;

function transcriptBudgetChars(chatOptions: ProviderChatOptions): number {
	const contextTokens = chatOptions.contextSize ?? 16_384;
	const reservedTokens =
		(chatOptions.maxTokens ?? 1_024) + Math.max(0, chatOptions.reasoningBudget ?? 0);
	const budget = Math.round(
		(contextTokens - reservedTokens) * ESTIMATED_CHARACTERS_PER_TOKEN * 0.6
	);
	const ceiling = Math.round(contextTokens * ESTIMATED_CHARACTERS_PER_TOKEN * 0.6);
	return Math.min(Math.max(MIN_COMPACT_BUDGET_CHARS, budget), Math.max(ceiling, 4_000));
}

function messageChars(message: ProviderChatMessage): number {
	return (
		(message.content?.length ?? 0) +
		(message.reasoningContent?.length ?? 0) +
		(message.toolCalls ? JSON.stringify(message.toolCalls).length : 0)
	);
}

function transcriptChars(transcript: ProviderChatMessage[]): number {
	return transcript.reduce((sum, message) => sum + messageChars(message), 0);
}

function compactTranscript(transcript: ProviderChatMessage[], budgetChars: number): void {
	if (transcriptChars(transcript) <= budgetChars) return;

	const toolIndexes = transcript.flatMap((message, index) =>
		message.role === 'tool' && message.name !== 'goals' ? [index] : []
	);
	const compactable = toolIndexes.slice(
		0,
		Math.max(0, toolIndexes.length - KEEP_RECENT_TOOL_RESULTS)
	);

	for (const index of compactable) {
		if (transcriptChars(transcript) <= budgetChars) return;
		const message = transcript[index];
		const content = message.content ?? '';
		if (content.length <= COMPACT_SKIP_UNDER_CHARS) continue;
		transcript[index] = { ...message, content: compactedToolContent(content) };
	}
}

function compactedToolContent(content: string): string {
	const parsed = readObject(parseJson(content));
	return JSON.stringify({
		compacted: true,
		...(typeof parsed.query === 'string' ? { query: parsed.query } : {}),
		note: 'Older tool result trimmed to fit the context window. Key findings should already be recorded in your goals answer fields; re-run the tool if you need the details again.'
	});
}

export function clampAgentMaxTurns(value: unknown): number {
	const number = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(number)) return DEFAULT_ASSISTANT_CONFIG.agentMaxTurns;
	if (number < 0) return Infinity;
	return Math.max(AGENT_MAX_TURNS_MIN, Math.floor(number));
}

async function collectTurn(
	provider: Provider,
	messages: ProviderChatMessage[],
	model: string,
	options: ProviderChatOptions,
	turnIndex: number,
	onText?: (text: string) => void,
	onReasoning?: (accumulated: string) => void
) {
	const contentChunks: string[] = [];
	let content = '';
	let reasoningContent = '';
	const toolCalls = new Map<number, MutableToolCall>();

	logStreamStart(turnIndex + 1);

	for await (const chunk of provider.streamChat(messages, model, options)) {
		if (chunk.content) {
			content += chunk.content;
			contentChunks.push(chunk.content);
			logStreamContent(chunk.content);
			onText?.(chunk.content);
		}

		if (chunk.reasoningContent) {
			reasoningContent += chunk.reasoningContent;
			logStreamReasoning(chunk.reasoningContent);
			onReasoning?.(reasoningContent);
		}

		for (const delta of chunk.toolCalls ?? []) {
			mergeToolCallDelta(toolCalls, delta, turnIndex);
		}
	}

	const orderedToolCalls = [...toolCalls.entries()]
		.sort(([left], [right]) => left - right)
		.map(([, call]) => call as ProviderToolCall);

	logStreamEnd(orderedToolCalls.map((call) => call.function.name));

	return {
		content,
		contentChunks,
		reasoningContent,
		toolCalls: orderedToolCalls
	};
}

type MutableToolCall = ProviderToolCall;

function mergeToolCallDelta(
	calls: Map<number, MutableToolCall>,
	delta: ProviderToolCallDelta,
	turnIndex: number
) {
	const current = calls.get(delta.index) ?? {
		id: delta.id || `call_${turnIndex + 1}_${delta.index + 1}`,
		type: 'function' as const,
		function: { name: '', arguments: '' }
	};

	if (delta.id) current.id = delta.id;
	if (delta.nameSnapshot !== undefined) {
		current.function.name = delta.nameSnapshot;
	} else if (delta.nameDelta) {
		current.function.name += delta.nameDelta;
	}

	if (delta.argumentsSnapshot !== undefined) {
		current.function.arguments =
			typeof delta.argumentsSnapshot === 'string'
				? delta.argumentsSnapshot
				: JSON.stringify(delta.argumentsSnapshot);
	} else if (delta.argumentsDelta) {
		current.function.arguments += delta.argumentsDelta;
	}

	calls.set(delta.index, current);
}

function parseJson(value: string): unknown {
	try {
		return value ? JSON.parse(value) : {};
	} catch {
		return value;
	}
}

function readToolError(result: ToolExecutionResult): string {
	const data = readObject(result.data);
	if (typeof data.error === 'string' && data.error.trim()) {
		return data.error.trim().slice(0, 2_000);
	}

	const content = parseJson(result.content);
	const contentObject = readObject(content);
	if (typeof contentObject.error === 'string' && contentObject.error.trim()) {
		return contentObject.error.trim().slice(0, 2_000);
	}

	return result.content.trim().slice(0, 2_000);
}
