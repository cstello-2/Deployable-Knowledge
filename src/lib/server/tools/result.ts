import { randomUUID } from "node:crypto";

import type { ImageArtifact } from "$lib/imageTypes";
import type { SourceArtifact, ToolOutput } from "$lib/agentTypes";
import type { ToolExecutionResult } from "./types";

export function createToolResult<TData>(
  data: TData,
  options: {
    outputs?: ToolOutput[];
    isError?: boolean;
    content?: string;
  } = {},
): ToolExecutionResult<TData> {
  return {
    content: options.content ?? JSON.stringify(data),
    data,
    ...(options.outputs?.length ? { outputs: options.outputs } : {}),
    ...(options.isError ? { isError: true } : {}),
  };
}

export function sourceOutput(source: SourceArtifact): ToolOutput {
  return {
    id: source.chunkId ?? randomUUID(),
    type: "source",
    data: source,
  };
}

export function imageOutput(image: ImageArtifact): ToolOutput {
  return { id: image.id, type: "image", data: image };
}

export function textOutput(
  id: string,
  data: string,
  label?: string,
): ToolOutput {
  return { id, type: "text", data, ...(label ? { label } : {}) };
}

export function dataOutput(
  id: string,
  data: unknown,
  label?: string,
): ToolOutput {
  return { id, type: "data", data, ...(label ? { label } : {}) };
}
