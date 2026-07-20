export type DocumentTagRequest = {
  tag: string;
};

export type DocumentTagAssignmentRequest = DocumentTagRequest & {
  documentIds: string[];
  assigned: boolean;
};

export type DocumentIngestProgress = {
  percent: number;
  label: string;
  message: string;
};

export type DocumentIngestResult = {
  documentId: string;
  title: string;
  sourcePath: string;
  pageCount: number;
  chunkCount: number;
};

export type DocumentIngestEvent =
  | ({ status: "progress" } & DocumentIngestProgress)
  | { status: "complete"; result: DocumentIngestResult }
  | { status: "error"; message: string };

export type NotebookTitleRequest = {
  title: string;
};

export type NotebookPageTitleRequest = {
  title: string;
};

export type NotebookPageContentRequest = {
  content: string;
};

export type NotebookSourcesRequest = {
  chunk_ids: string[];
};

export type PromptTemplateRequest = {
  name: string;
  description: string;
  systemPrompt: string;
};

export type ProviderApiKeyRequest = {
  apiKey: string;
};

export type SessionTitleRequest = {
  title: string;
};

export type SettingsUpdateRequest = {
  provider: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topK: number;
  retrievalMode: "semantic" | "bm25" | "hybrid" | "graph";
  ragTopK: number;
  promptTemplateId: string | null;
  persona: string;
};

export type EmbeddingModelStatus = {
  installed: boolean;
  model: string;
  dtype: string;
};

export type EmbeddingModelInstallEvent =
  | {
      status: "progress";
      progress: number;
      loaded: number;
      total: number;
    }
  | { status: "ready" }
  | { status: "error"; message: string };

type ChatMessageBase = {
  message: string;
  model_id: string;
  provider_id: string;
  retrieval_mode: "semantic" | "bm25" | "hybrid" | "graph";
  max_tokens: number;
  temperature: number;
  top_k: number;
};

type DocumentChatMessageRequest = ChatMessageBase & {
  conversational: false;
  prompt_template_id: string | null;
  persona: string;
  document_ids: string[];
  rag_top_k: number;
};

type NotebookChatMessageRequest = ChatMessageBase & {
  conversational: true;
  context?: string;
  notebook_id: string | null;
  notebook_context_notebook_ids?: string[];
  notebook_context_page_ids?: string[];
  notebook_context_pages?: Array<{
    notebookId: string;
    notebookTitle: string;
    pageId: string;
    pageTitle: string;
  }>;
  document_ids: string[];
  rag_top_k: number;
};

export type ChatMessageRequest =
  | DocumentChatMessageRequest
  | NotebookChatMessageRequest;
