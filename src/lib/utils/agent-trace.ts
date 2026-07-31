import type { AgentTraceItem, StoredToolCall } from '$lib/types';

type TraceStatus = NonNullable<AgentTraceItem['status']>;

export function createReasoningTrace(
	id: string,
	output: string,
	status: TraceStatus = 'complete'
): AgentTraceItem {
	return {
		id,
		kind: 'reasoning',
		title: status === 'running' ? 'Thinking…' : 'Thought process',
		output: output.trim(),
		status
	};
}

export function createToolTrace({
	id,
	name,
	argumentsValue,
	resultValue,
	status,
	isError = false
}: {
	id: string;
	name: string;
	argumentsValue: unknown;
	resultValue?: unknown;
	status: TraceStatus;
	isError?: boolean;
}): AgentTraceItem {
	return {
		id,
		kind: 'tool',
		title: toolTitle(name, argumentsValue, status),
		output: toolOutput(name, argumentsValue, resultValue),
		status,
		...(isError ? { isError: true } : {})
	};
}

export function legacyToolCallTrace(call: StoredToolCall, index: number): AgentTraceItem {
	return createToolTrace({
		id: call.id ?? `legacy-tool-${index}`,
		name: call.name,
		argumentsValue: call.arguments ?? {},
		resultValue: call.error || undefined,
		status: call.isError ? 'error' : 'complete',
		isError: call.isError
	});
}

function toolTitle(name: string, argumentsValue: unknown, status: TraceStatus): string {
	const running = status === 'running';
	const args = readObject(argumentsValue);

	if (name === 'python') return running ? 'Running Python…' : 'Ran Python';

	if (name === 'search') {
		const query = typeof args.query === 'string' ? args.query.trim() : '';
		if (running) return query ? `Searching ${query}…` : 'Searching documents…';
		return query ? `Searched ${query}` : 'Searched documents';
	}

	if (name === 'get_datetime') {
		return running ? 'Checking the date and time…' : 'Checked the date and time';
	}

	const label = name.replaceAll('_', ' ');
	return running ? `Running ${label}…` : `Ran ${label}`;
}

function toolOutput(name: string, argumentsValue: unknown, resultValue: unknown): string {
	if (name === 'search') return formatSearchResults(resultValue);

	const args = readObject(argumentsValue);
	if (name === 'python') {
		return typeof args.code === 'string' ? args.code : 'No code recorded';
	}

	const sections: string[] = [];

	if (Object.keys(args).length) {
		sections.push(`Input\n${formatTraceValue(args)}`);
	}

	if (resultValue !== undefined) {
		sections.push(`Output\n${formatTraceValue(resultValue)}`);
	}

	return sections.join('\n\n') || 'No output';
}

function formatSearchResults(resultValue: unknown): string {
	if (resultValue === undefined) return 'Waiting for results…';
	if (typeof resultValue === 'string') return resultValue.trim() || 'No results';

	const result = readObject(resultValue);
	if (typeof result.context === 'string') {
		return result.context.trim() || 'No results';
	}

	const matches =
		[result.hybrid, result.results, result.sources].find((value) => Array.isArray(value)) ?? [];

	if (matches.length) {
		return matches.map((match, index) => formatSearchMatch(match, index)).join('\n\n');
	}

	if (typeof result.error === 'string') return result.error;
	return 'No results';
}

function firstString(values: unknown[]): string {
	const found = values.find((value) => typeof value === 'string');
	return typeof found === 'string' ? found : '';
}

function formatSearchMatch(value: unknown, index: number): string {
	const match = readObject(value);
	const title = firstString([match.sourceTitle, match.title]) || 'Document';
	const page = typeof match.pageIndex === 'number' ? `, page ${match.pageIndex + 1}` : '';
	const text = firstString([match.content, match.description]);

	return `${index + 1}. ${title}${page}${text ? `\n${text}` : ''}`;
}

export function formatTraceValue(value: unknown): string {
	if (typeof value === 'string') return value;

	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return String(value);
	}
}

function readObject(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
