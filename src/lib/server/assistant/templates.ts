export type BuiltInPromptTemplate = {
  id: string;
  name: string;
  description: string;
  system: string;
  includeHistory: boolean;
  temperature: number;
  topK: number;
  maxTokens: number;
  builtIn: boolean;
};

export const builtInTemplates: BuiltInPromptTemplate[] = [
  {
    id: "default",
    name: "Plain Chat",
    description: "General-purpose assistant mode with no special retrieval behavior. Good for normal questions, explanations, and quick help.",
    system: "You are a helpful, clear, and practical assistant. Answer the user's request directly. Use simple wording unless the user asks for technical depth. If information is missing, make a reasonable assumption and state it briefly.",
    includeHistory: true,
    temperature: 0.2,
    topK: 8,
    maxTokens: 512,
    builtIn: true,
  },
  {
    id: "rag_chat",
    name: "RAG Chat",
    description: "Context-first assistant for answering questions using uploaded documents, synced folders, retrieved chunks, and project files. Best default mode for asking questions about your knowledge base.",
    system: "You are a RAG helper. ONLY reference text that is provided in context. DO NOT provide text this is not in context. If you do not know the answer, say I do not know it.",
    includeHistory: true,
    temperature: 0.2,
    topK: 8,
    maxTokens: 512,
    builtIn: true,
  },
  {
    id: "tech_helper",
    name: "Technical Helper",
    description: "Direct technical assistant for debugging, software changes, engineering explanations, and implementation steps. Emphasizes precision over conversational style.",
    system: "You are a precise technical helper. Give direct, implementation-ready answers. Prefer concrete steps, filenames, function names, and code snippets over broad explanations. Do not add fluff. When debugging, identify the likely cause, explain why it happens, and give the smallest safe fix first. If the user provides code or logs, ground your answer in those details. If there is risk of breaking existing behavior, call that out before suggesting the change.",
    includeHistory: true,
    temperature: 0.2,
    topK: 8,
    maxTokens: 768,
    builtIn: true,
  },
  {
    id: "title_summarizer",
    name: "Title Summarizer",
    description: "Generates a short, useful title for a chat or session. Does not use full chat history to avoid noisy or overly broad titles.",
    system: "You write short, informative chat titles. Return only the title. Do not use quotation marks. Do not add commentary. Keep the title under 7 words when possible. Focus on the user's main task, not minor details.",
    includeHistory: false,
    temperature: 0.2,
    topK: 8,
    maxTokens: 40,
    builtIn: true,
  },
];
export const protectedPromptTemplateIds = new Set(
  builtInTemplates.map((template) => template.id),
);

export function isProtectedPromptTemplateId(id: string) {
  return protectedPromptTemplateIds.has(id);
}