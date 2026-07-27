import { logToolExecutionResult, logToolExecutionStart } from '$lib/server/agent/dev-log';
import { toolRegistry } from '$lib/server/tools';
import type { ToolExecutionContext } from '$lib/server/tools/types';
import { readObject } from '$lib/server/utils/values';
import type { AgentOutput, AgentProgressEvent, AgentTraceItem } from '$lib/types';
import { createToolTrace } from '$lib/utils/agent-trace';

const SEARCH_TOOL_NAME = 'search';
const AUTO_SEARCH_CALL_ID = 'auto-search-1';

export type AutoSearchResult = {
	context: string;
	outputs: AgentOutput[];
	trace: AgentTraceItem[];
};

// With tool calling turned off the model can never request retrieval, so the
// search tool runs once per prompt with the user's message as the query and the
// result is injected into the prompt instead.
export async function runAutoSearch({
	query,
	toolContext,
	onProgress
}: {
	query: string;
	toolContext: ToolExecutionContext;
	onProgress?: (event: AgentProgressEvent) => void;
}): Promise<AutoSearchResult> {
	const argumentsValue = { query };

	onProgress?.({
		kind: 'tool',
		status: 'started',
		modelTurn: 0,
		toolTurn: 1,
		callId: AUTO_SEARCH_CALL_ID,
		name: SEARCH_TOOL_NAME,
		trace: createToolTrace({
			id: AUTO_SEARCH_CALL_ID,
			name: SEARCH_TOOL_NAME,
			argumentsValue,
			status: 'running'
		})
	});

	logToolExecutionStart(SEARCH_TOOL_NAME, argumentsValue);
	const result = await toolRegistry.execute(SEARCH_TOOL_NAME, argumentsValue, toolContext);
	logToolExecutionResult(SEARCH_TOOL_NAME, result);

	const isError = result.isError ?? false;
	const trace = createToolTrace({
		id: AUTO_SEARCH_CALL_ID,
		name: SEARCH_TOOL_NAME,
		argumentsValue,
		resultValue: result.data,
		status: isError ? 'error' : 'complete',
		isError
	});

	onProgress?.({
		kind: 'tool',
		status: 'completed',
		modelTurn: 0,
		toolTurn: 1,
		callId: AUTO_SEARCH_CALL_ID,
		name: SEARCH_TOOL_NAME,
		trace,
		isError
	});

	const data = readObject(result.data);
	const context = typeof data.context === 'string' ? data.context.trim() : '';

	return {
		context,
		outputs: (result.outputs ?? []).map((output) => ({
			...output,
			toolCallId: AUTO_SEARCH_CALL_ID,
			toolName: SEARCH_TOOL_NAME
		})),
		trace: [trace]
	};
}
