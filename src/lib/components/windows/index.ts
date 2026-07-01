import AssistantSettings from "./AssistantSettings.svelte";
import ChatWindow from "./ChatWindow.svelte";
import DocumentsWindow from "./DocumentsWindow.svelte";
import ChatHistoryWindow from "./ChatHistoryWindow.svelte";
import NotebookWindow from "./NotebookWindow.svelte";
import SearchWindow from "./SearchWindow.svelte";

import type { Component } from "svelte";

export type WindowColumn = "left" | "right";

export type WindowInstanceProps = {
  id: string;
  title: string;
  closable?: boolean;
  height?: number | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
};

export type WindowDefinition = WindowInstanceProps & {
  column: WindowColumn;
  component: Component<WindowInstanceProps>;
};

export const windowDefinitions = [
  {
    id: "documents-window",
    title: "Documents",
    column: "left",
    component: DocumentsWindow,
  },
  {
    id: "chat-window",
    title: "Assistant Chat",
    column: "right",
    component: ChatWindow,
  },
  {
    id: "assistant-settings",
    title: "Assistant Settings",
    column: "right",
    component: AssistantSettings,
  },
  {
    id: "chat-history-window",
    title: "Chat History",
    column: "left",
    component: ChatHistoryWindow,
  },
  {
    id: "notebook-window",
    title: "Notebook",
    column: "right",
    component: NotebookWindow,
  },
  {
    id: "search-window",
    title: "Search",
    column: "right",
    component: SearchWindow,
  },
] satisfies WindowDefinition[];
