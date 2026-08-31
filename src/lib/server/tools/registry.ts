import type { ProviderToolCall, ProviderToolDefinition } from '../providers/provider';
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from './types';
import type { ApiAgentTool, ChatMode } from '$lib/types';
import { createToolResult } from './result';

export class ToolRegistry {
	readonly #tools = new Map<string, AgentTool>();

	constructor(tools: AgentTool[] = []) {
		for (const tool of tools) this.register(tool);
	}

	register(tool: AgentTool): this {
		if (!tool.id || this.#tools.has(tool.id)) {
			throw new Error(`Tool id is missing or already registered: ${tool.id}`);
		}

		this.#tools.set(tool.id, tool);
		return this;
	}

	catalog(): ApiAgentTool[] {
		return [...this.#tools.values()].map(({ id, label, description, modes, defaultEnabled }) => ({
			id,
			label,
			description,
			modes,
			defaultEnabled: defaultEnabled !== false
		}));
	}

	ids(): string[] {
		return [...this.#tools.keys()];
	}

	defaultIds(): string[] {
		return [...this.#tools.values()]
			.filter((tool) => tool.defaultEnabled !== false)
			.map(({ id }) => id);
	}

	compactExemptIds(): Set<string> {
		return new Set(
			[...this.#tools.values()].filter((tool) => tool.keepResultOnCompact).map(({ id }) => id)
		);
	}

	idsForMode(mode: ChatMode): string[] {
		return [...this.#tools.values()]
			.filter((tool) => tool.modes.includes(mode))
			.map(({ id }) => id);
	}

	filterIds(value: unknown): string[] {
		if (!Array.isArray(value)) return this.defaultIds();
		return this.ids().filter((id) => value.includes(id));
	}

	definitions(names?: readonly string[]): ProviderToolDefinition[] {
		return this.select(names).map((tool) => ({
			type: 'function',
			function: {
				name: tool.id,
				description: tool.definition.description,
				parameters: tool.definition.parameters
			}
		}));
	}

	instructions(names?: readonly string[]): string[] {
		return this.select(names).flatMap((tool) => (tool.instructions ? [tool.instructions] : []));
	}

	async execute(
		name: string,
		argumentsValue: unknown,
		context: ToolExecutionContext = {}
	): Promise<ToolExecutionResult> {
		const tool = this.#tools.get(name);

		if (!tool) {
			return createToolResult({ error: `Unknown tool: ${name}` }, { isError: true });
		}

		try {
			return await tool.execute(argumentsValue, context);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			return createToolResult({ error: message }, { isError: true });
		}
	}

	async executeCall(
		call: ProviderToolCall,
		context: ToolExecutionContext = {}
	): Promise<ToolExecutionResult> {
		let argumentsValue: unknown;

		try {
			argumentsValue = call.function.arguments ? JSON.parse(call.function.arguments) : {};
		} catch {
			return createToolResult(
				{
					error: `Invalid JSON arguments for ${call.function.name}`
				},
				{ isError: true }
			);
		}

		return this.execute(call.function.name, argumentsValue, context);
	}

	private select(names?: readonly string[]): AgentTool[] {
		if (!names) return [...this.#tools.values()];

		return names.flatMap((name) => {
			const tool = this.#tools.get(name);
			return tool ? [tool] : [];
		});
	}
}
