import { executeToolCall } from '$lib/server/agent/runner';
import type { ToolExecutionContext } from '$lib/server/tools/types';
import { readObject } from '$lib/server/utils/values';
import type { AgentOutput, AgentProgressEvent, AgentTraceItem } from '$lib/types';

export type AutoSearchResult = {
	context: string;
	outputs: AgentOutput[];
	trace: AgentTraceItem[];
};

// With tool calling turned off the model can never request retrieval, so the
// search tool runs once per prompt with the user's message as the query and the
// result is injected into the prompt instead.
export async function runAutoSearch(
	query: string,
	toolContext: ToolExecutionContext,
	onProgress: (event: AgentProgressEvent) => void
): Promise<AutoSearchResult> {
	const { result, trace, outputs } = await executeToolCall(
		{
			id: 'auto-search-1',
			type: 'function',
			function: { name: 'search', arguments: JSON.stringify({ query }) }
		},
		toolContext,
		onProgress
	);

	const context = readObject(result.data).context;

	return { context: typeof context === 'string' ? context.trim() : '', outputs, trace: [trace] };
}
