import type {
	Provider,
	ProviderChatMessage,
	ProviderChatOptions,
	ProviderToolCall
} from '../providers/provider';
import { toolRegistry } from '../tools';
import type { ToolExecutionContext, ToolExecutionResult } from '../tools/types';
import type { AgentOutput, AgentProgressEvent, AgentTraceItem } from '$lib/types';
import { createReasoningTrace, createToolTrace } from '$lib/utils/agent-trace';
import {
	AGENT_MAX_TURNS_MIN,
	CONTEXT_WINDOW_TOKENS_MAX,
	DEFAULT_ASSISTANT_CONFIG,
	ESTIMATED_CHARACTERS_PER_TOKEN
} from '$lib/constants';
import { readObject } from '../utils/values';
import { createGoalNudger, unfinishedGoals } from '../tools/goals';
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

type ProgressCallback = (event: AgentProgressEvent) => void;

export type AgentRunResult = {
	content: string;
	modelTurns: number;
	toolTurns: number;
	outputs: AgentOutput[];
	trace: AgentTraceItem[];
};

// Sent in order when the model returns an empty answer: first a nudge to keep
// going, then a demand for the final answer with tools withdrawn.
const EMPTY_TURN_PROMPTS = [
	'Continue. Use tools if you still need information, or give your complete final answer now. Answer every part of the request.',
	'Give your complete final answer to my request now, using the information gathered above. Answer every part of the request. Do not call any more tools.'
];
const REASONING_PROGRESS_INTERVAL_MS = 250;

export async function runAgent({
	provider,
	model,
	messages,
	chatOptions,
	toolNames,
	toolContext,
	maxToolTurns,
	onProgress,
	onText,
	onTextReset
}: {
	provider: Provider;
	model: string;
	messages: ProviderChatMessage[];
	chatOptions: ProviderChatOptions;
	toolNames: readonly string[];
	toolContext: ToolExecutionContext;
	maxToolTurns: number;
	onProgress: ProgressCallback;
	onText: (text: string) => void;
	onTextReset: () => void;
}): Promise<AgentRunResult> {
	const transcript = [...messages];
	const definitions = toolRegistry.definitions(toolNames);
	const maxTurns = clampAgentMaxTurns(maxToolTurns);
	const budgetChars = transcriptBudgetChars(chatOptions);
	const compactExemptTools = toolRegistry.compactExemptIds();
	const nudgeGoals = createGoalNudger();
	const outputs = new Map<string, AgentOutput>();
	const trace: AgentTraceItem[] = [];
	let modelTurns = 0;
	let toolTurns = 0;
	let emptyTurns = 0;

	while (true) {
		chatOptions.signal?.throwIfAborted();
		const forceFinalAnswer = emptyTurns >= EMPTY_TURN_PROMPTS.length;
		const toolsAvailable = !forceFinalAnswer && toolTurns < maxTurns && definitions.length > 0;
		const options = { ...chatOptions, tools: toolsAvailable ? definitions : undefined };
		// Tell the model its tool-turn allocation so it plans work that fits the
		// budget instead of promising follow-up turns it will never get.
		const budgetNote =
			definitions.length && Number.isFinite(maxTurns)
				? turnBudgetNote(toolTurns, maxTurns, toolsAvailable)
				: '';
		compactTranscript(transcript, budgetChars - budgetNote.length, compactExemptTools);
		const turnMessages = budgetNote ? withSystemNote(transcript, budgetNote) : transcript;

		modelTurns += 1;
		const reasoningId = `reasoning-${modelTurns}`;
		let lastReasoningEmit = 0;
		onProgress({ kind: 'model', status: 'started' });
		logModelCall({
			providerName: provider.name,
			model,
			modelTurn: modelTurns,
			messages: turnMessages,
			options
		});
		const turn = await streamTurn(
			provider,
			model,
			turnMessages,
			options,
			modelTurns,
			onText,
			(reasoning) => {
				const now = Date.now();
				if (now - lastReasoningEmit < REASONING_PROGRESS_INTERVAL_MS) return;
				lastReasoningEmit = now;
				onProgress({
					kind: 'model',
					status: 'started',
					trace: createReasoningTrace(reasoningId, reasoning, 'running')
				});
			}
		);
		const reasoningTrace = turn.reasoning.trim()
			? createReasoningTrace(reasoningId, turn.reasoning)
			: undefined;
		if (reasoningTrace) trace.push(reasoningTrace);
		onProgress({
			kind: 'model',
			status: 'completed',
			requestedTools: turn.toolCalls.map((call) => call.function.name),
			trace: reasoningTrace
		});

		if (toolsAvailable && turn.toolCalls.length) {
			if (turn.content) onTextReset();
			transcript.push({
				role: 'assistant',
				content: turn.content || null,
				reasoning_content: turn.reasoning || undefined,
				tool_calls: turn.toolCalls
			});
			for (const call of turn.toolCalls) {
				chatOptions.signal?.throwIfAborted();
				const run = await executeToolCall(call, toolContext, onProgress);
				trace.push(run.trace);
				for (const output of run.outputs) outputs.set(`${output.type}:${output.id}`, output);
				transcript.push({
					role: 'tool',
					content: run.result.content,
					tool_call_id: call.id,
					name: call.function.name
				});
			}
			toolTurns += 1;
			continue;
		}

		const nudge = toolsAvailable ? nudgeGoals(toolContext) : null;
		if (nudge) {
			if (turn.content) {
				transcript.push({ role: 'assistant', content: turn.content });
				onTextReset();
			}
			transcript.push({ role: 'user', content: nudge });
			continue;
		}

		if (!turn.content && !forceFinalAnswer) {
			transcript.push({ role: 'user', content: EMPTY_TURN_PROMPTS[emptyTurns] });
			emptyTurns += 1;
			continue;
		}

		let content = turn.content;
		if (!content) {
			content = turn.toolCalls.length
				? "I couldn't produce a final response within the configured tool-turn limit."
				: "I couldn't produce a final response.";
			onText(content);
		}

		const unfinished = unfinishedGoals(toolContext);
		if (unfinished.length) {
			const notice = [
				'\n\n**Work remains incomplete.** The run ended with these goals unfinished:',
				...unfinished.map((goal) => `- ${goal.text}`)
			].join('\n');
			content += notice;
			onText(notice);
		}

		logAgentComplete({ modelTurns, toolTurns });
		return { content, modelTurns, toolTurns, outputs: [...outputs.values()], trace };
	}
}

export async function executeToolCall(
	call: ProviderToolCall,
	context: ToolExecutionContext,
	onProgress: ProgressCallback
): Promise<{ result: ToolExecutionResult; trace: AgentTraceItem; outputs: AgentOutput[] }> {
	const { id, function: fn } = call;
	const argumentsValue = parseJson(fn.arguments);
	onProgress({
		kind: 'tool',
		status: 'started',
		name: fn.name,
		trace: createToolTrace({ id, name: fn.name, argumentsValue, status: 'running' })
	});
	logToolExecutionStart(fn.name, argumentsValue);
	const result = await toolRegistry.executeCall(call, context);
	logToolExecutionResult(fn.name, result);
	const trace = createToolTrace({
		id,
		name: fn.name,
		argumentsValue,
		resultValue: result.data ?? parseJson(result.content),
		status: result.isError ? 'error' : 'complete',
		isError: result.isError
	});
	onProgress({ kind: 'tool', status: 'completed', name: fn.name, trace });
	const outputs = (result.outputs ?? []).map((output) => ({
		...output,
		toolCallId: id,
		toolName: fn.name
	}));
	return { result, trace, outputs };
}

async function streamTurn(
	provider: Provider,
	model: string,
	messages: ProviderChatMessage[],
	options: ProviderChatOptions,
	modelTurn: number,
	onText: (text: string) => void,
	onReasoning: (accumulated: string) => void
) {
	let content = '';
	let reasoning = '';
	// Indexed by the provider's tool-call index; deltas for one call arrive in pieces.
	const toolCalls: ProviderToolCall[] = [];

	logStreamStart(modelTurn);
	for await (const chunk of provider.streamChat(messages, model, options)) {
		if (chunk.content) {
			content += chunk.content;
			logStreamContent(chunk.content);
			onText(chunk.content);
		}
		if (chunk.reasoning_content) {
			reasoning += chunk.reasoning_content;
			logStreamReasoning(chunk.reasoning_content);
			onReasoning(reasoning);
		}
		chunk.tool_calls?.forEach((delta, position) => {
			const index = delta.index ?? position;
			const call = (toolCalls[index] ??= {
				id: `call_${modelTurn}_${index + 1}`,
				type: 'function',
				function: { name: '', arguments: '' }
			});
			if (delta.id) call.id = delta.id;
			call.function.name += delta.function?.name ?? '';
			call.function.arguments += delta.function?.arguments ?? '';
		});
	}

	const calls = toolCalls.filter(Boolean);
	logStreamEnd(calls.map((call) => call.function.name));
	return { content, reasoning, toolCalls: calls };
}

function withSystemNote(messages: ProviderChatMessage[], note: string): ProviderChatMessage[] {
	const [first, ...rest] = messages;
	if (first?.role !== 'system') return [{ role: 'system', content: note }, ...messages];
	return [{ ...first, content: [first.content, note].filter(Boolean).join('\n\n') }, ...rest];
}

function turnBudgetNote(used: number, max: number, toolsAvailable: boolean): string {
	if (!toolsAvailable) {
		return 'TURN BUDGET: All allocated tool turns have been used. Tools are no longer available — give your complete final answer now from the information gathered above.';
	}
	return `TURN BUDGET: You may use at most ${max} tool turn${max === 1 ? '' : 's'} for this request. A turn is one round of tool calls; independent calls made together count as one turn. Used so far: ${used}. Remaining: ${max - used}. Plan only work that fits the remaining turns — batch independent tool calls into a single turn, and never promise or defer work to turns you do not have. Once the budget is used, tools are withdrawn and you must answer with what you have.`;
}

function clampAgentMaxTurns(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_ASSISTANT_CONFIG.agentMaxTurns;
	return value < 0 ? Infinity : Math.max(AGENT_MAX_TURNS_MIN, Math.floor(value));
}

const KEEP_RECENT_TOOL_RESULTS = 2;
const MIN_COMPACT_BUDGET_CHARS = 24_000;
const COMPACT_SKIP_UNDER_CHARS = 320;

function transcriptBudgetChars(options: ProviderChatOptions): number {
	const reservedTokens =
		(options.maxTokens ?? DEFAULT_ASSISTANT_CONFIG.maxTokens) +
		Math.max(0, options.reasoningBudget ?? 0);
	const budget =
		(CONTEXT_WINDOW_TOKENS_MAX - reservedTokens) * ESTIMATED_CHARACTERS_PER_TOKEN * 0.6;
	return Math.max(MIN_COMPACT_BUDGET_CHARS, Math.round(budget));
}

function messageChars(message: ProviderChatMessage): number {
	return (
		(message.content?.length ?? 0) +
		(message.reasoning_content?.length ?? 0) +
		(message.tool_calls ? JSON.stringify(message.tool_calls).length : 0)
	);
}

// Replaces the oldest tool results with a stub until the transcript fits,
// always keeping the most recent results and those of exempt tools.
function compactTranscript(
	transcript: ProviderChatMessage[],
	budgetChars: number,
	exemptTools: ReadonlySet<string>
): void {
	let excess = transcript.reduce((sum, message) => sum + messageChars(message), 0) - budgetChars;
	if (excess <= 0) return;

	const toolIndexes = transcript.flatMap((message, index) =>
		message.role === 'tool' && !exemptTools.has(message.name ?? '') ? [index] : []
	);
	for (const index of toolIndexes.slice(0, -KEEP_RECENT_TOOL_RESULTS)) {
		if (excess <= 0) return;
		const content = transcript[index].content ?? '';
		if (content.length <= COMPACT_SKIP_UNDER_CHARS) continue;
		const query = readObject(parseJson(content)).query;
		const compacted = JSON.stringify({
			compacted: true,
			...(typeof query === 'string' ? { query } : {}),
			note: 'Older tool result trimmed to fit the context window. Re-run the tool if you need the details again.'
		});
		transcript[index] = { ...transcript[index], content: compacted };
		excess -= content.length - compacted.length;
	}
}

function parseJson(value: string): unknown {
	try {
		return value ? JSON.parse(value) : {};
	} catch {
		return value;
	}
}
