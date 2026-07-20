import type {
  ProviderToolCall,
  ProviderToolDefinition,
} from "../providers/provider";
import type {
  AgentTool,
  ToolExecutionContext,
  ToolExecutionResult,
} from "./types";
import { createToolResult } from "./result";

export class ToolRegistry {
  readonly #tools = new Map<string, AgentTool>();

  constructor(tools: AgentTool[] = []) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: AgentTool): this {
    const name = tool.definition.function.name;

    if (!name || this.#tools.has(name)) {
      throw new Error(`Tool name is missing or already registered: ${name}`);
    }

    this.#tools.set(name, tool);
    return this;
  }

  definitions(names?: readonly string[]): ProviderToolDefinition[] {
    return this.select(names).map((tool) => tool.definition);
  }

  async execute(
    name: string,
    argumentsValue: unknown,
    context: ToolExecutionContext = {},
  ): Promise<ToolExecutionResult> {
    const tool = this.#tools.get(name);

    if (!tool) {
      return createToolResult(
        { error: `Unknown tool: ${name}` },
        { isError: true },
      );
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
    context: ToolExecutionContext = {},
  ): Promise<ToolExecutionResult> {
    let argumentsValue: unknown;

    try {
      argumentsValue = call.function.arguments
        ? JSON.parse(call.function.arguments)
        : {};
    } catch {
      return createToolResult(
        {
          error: `Invalid JSON arguments for ${call.function.name}`,
        },
        { isError: true },
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
