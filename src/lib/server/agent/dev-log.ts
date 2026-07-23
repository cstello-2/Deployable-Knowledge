import { dev } from '$app/environment';
import type {
	ProviderChatMessage,
	ProviderChatOptions,
	ProviderToolDefinition
} from '../providers/provider';
import type { ToolExecutionResult } from '../tools/types';

// Dev-only terminal logging for the agent loop. Every exported function is a
// no-op outside `vite dev`, so callers never need to guard.

const TOOL_RESULT_PREVIEW_LIMIT = 1_500;
const RULE = '─'.repeat(72);

const ansi = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m'
} as const;

const roleStyles: Record<ProviderChatMessage['role'], string> = {
	system: ansi.magenta,
	user: ansi.cyan,
	assistant: ansi.green,
	tool: ansi.yellow
};

export function logModelCall({
	providerName,
	model,
	modelTurn,
	messages,
	options
}: {
	providerName: string;
	model: string;
	modelTurn: number;
	messages: ProviderChatMessage[];
	options: ProviderChatOptions;
}): void {
	if (!dev) return;

	const optionsSummary = describeOptions(options);
	write('\n');
	write(`${paint(RULE, [ansi.dim])}\n`);
	write(
		`${paint(
			` MODEL CALL · turn ${modelTurn} · ${providerName} · ${model}` +
				(optionsSummary ? ` · ${optionsSummary}` : ''),
			[ansi.bold]
		)}\n`
	);
	write(`${paint(RULE, [ansi.dim])}\n`);
	logToolDefinitions(options.tools ?? []);
	messages.forEach((message, index) => logMessage(message, index + 1));
}

export function logStreamStart(modelTurn: number): void {
	if (!dev) return;
	write(`\n ${paint(`▶ response stream · turn ${modelTurn}`, [ansi.bold, ansi.green])}\n`);
}

export function logStreamContent(delta: string): void {
	if (!dev) return;
	write(delta);
}

export function logStreamReasoning(delta: string): void {
	if (!dev) return;
	write(paint(delta, [ansi.dim]));
}

export function logStreamEnd(requestedTools: string[]): void {
	if (!dev) return;
	const summary = requestedTools.length
		? `■ stream end · requested tools: ${requestedTools.join(', ')}`
		: '■ stream end';
	write(`\n ${paint(summary, [ansi.bold, ansi.green])}\n`);
}

export function logToolExecutionStart(name: string, argumentsValue: unknown): void {
	if (!dev) return;
	const compact = JSON.stringify(argumentsValue) ?? String(argumentsValue);
	write(`\n ${paint(`⚙ tool ${name}`, [ansi.bold, ansi.yellow])}`);
	if (compact.length <= 120) {
		write(` ${paint(compact, [ansi.dim])}\n`);
	} else {
		write('\n');
		writeIndented(JSON.stringify(argumentsValue, null, 2) ?? compact);
	}
}

export function logToolExecutionResult(name: string, result: ToolExecutionResult): void {
	if (!dev) return;
	const status = result.isError
		? paint(`✗ tool ${name} failed`, [ansi.bold, ansi.red])
		: paint(`✓ tool ${name}`, [ansi.bold, ansi.green]);
	const outputCount = result.outputs?.length ?? 0;
	const stats = `· ${result.content.length} chars${outputCount ? ` · ${outputCount} outputs` : ''}`;
	write(` ${status} ${paint(stats, [ansi.dim])}\n`);
	if (result.content) writeIndented(previewText(result.content));
}

export function logAgentComplete({
	modelTurns,
	toolTurns
}: {
	modelTurns: number;
	toolTurns: number;
}): void {
	if (!dev) return;
	write(
		` ${paint(`● agent done · ${modelTurns} model turns · ${toolTurns} tool turns`, [
			ansi.bold,
			ansi.cyan
		])}\n\n`
	);
}

function logToolDefinitions(definitions: ProviderToolDefinition[]): void {
	const label = definitions.length
		? `tools: ${definitions.map((definition) => definition.function.name).join(', ')}`
		: 'tools: none';
	write(` ${paint(label, [ansi.yellow])}\n`);
}

function logMessage(message: ProviderChatMessage, position: number): void {
	const roleLabel =
		message.role === 'tool' && message.name
			? `${message.role.toUpperCase()} · ${message.name}`
			: message.role.toUpperCase();
	const header = paint(`[${position}] ${roleLabel}`, [ansi.bold, roleStyles[message.role]]);
	const chars = paint(`(${message.content?.length ?? 0} chars)`, [ansi.dim]);
	write(`\n ${header} ${chars}\n`);
	if (message.reasoningContent) writeIndented(paint(message.reasoningContent, [ansi.dim]));
	if (message.content) writeIndented(message.content);
	for (const call of message.toolCalls ?? []) {
		write(`   ${paint(`↳ ${call.function.name} ${call.function.arguments}`, [ansi.yellow])}\n`);
	}
}

function describeOptions(options: ProviderChatOptions): string {
	const parts: string[] = [];
	if (options.temperature !== undefined) parts.push(`temp ${options.temperature}`);
	if (options.topK !== undefined) parts.push(`topK ${options.topK}`);
	if (options.maxTokens !== undefined) parts.push(`maxTokens ${options.maxTokens}`);
	if (options.reasoningBudget !== undefined) parts.push(`reasoning ${options.reasoningBudget}`);
	return parts.join(' · ');
}

function previewText(text: string): string {
	if (text.length <= TOOL_RESULT_PREVIEW_LIMIT) return text;
	const hidden = text.length - TOOL_RESULT_PREVIEW_LIMIT;
	return `${text.slice(0, TOOL_RESULT_PREVIEW_LIMIT)}… (+${hidden} more chars)`;
}

function writeIndented(text: string): void {
	for (const line of text.split('\n')) {
		write(`   ${paint('│', [ansi.dim])} ${line}\n`);
	}
}

function paint(text: string, codes: string[]): string {
	if (!process.stdout.isTTY) return text;
	return `${codes.join('')}${text}${ansi.reset}`;
}

function write(text: string): void {
	process.stdout.write(text);
}
