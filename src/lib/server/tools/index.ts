import { getDatetimeTool } from "./get-datetime";
import { pythonTool } from "./python";
import { ToolRegistry } from "./registry";
import { searchTool } from "./search";

export const toolRegistry = new ToolRegistry([
  getDatetimeTool,
  pythonTool,
  searchTool,
]);

export { ToolRegistry } from "./registry";
export {
  createToolResult,
  dataOutput,
  imageOutput,
  sourceOutput,
  textOutput,
} from "./result";
export {
  clampInteger,
  clampText,
  compactText,
  readObject,
  toJsonValue,
} from "../utils/values";
export type {
  AgentTool,
  ToolExecutionContext,
  ToolExecutionResult,
} from "./types";
export type { AgentOutput, ToolOutput } from "$lib/agentTypes";
