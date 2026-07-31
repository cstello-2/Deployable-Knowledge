import AssistantChatWindow from "./AssistantChatWindow.svelte";
import AssistantSettings from "./AssistantSettings.svelte";
import DocumentsWindow from "./DocumentsWindow.svelte";
import GraphGalaxyWindow from "./GraphGalaxyWindow.svelte";
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
  defaultVisible?: boolean;
};

export const windowDefinitions = [
  {
    id: "documents-window",
    title: "Document Library",
    column: "left",
    component: DocumentsWindow,
  },
  {
    id: "chat-window",
    title: "Assistant Chat",
    column: "right",
    component: AssistantChatWindow,
  },
  {
    id: "assistant-settings",
    title: "Settings",
    column: "right",
    component: AssistantSettings,
  },
  {
    id: "graph-galaxy-window",
    title: "Graph Galaxy",
    column: "right",
    component: GraphGalaxyWindow,
    defaultVisible: true,
  },
  {
    id: "search-context-window",
    title: "Search Context",
    column: "right",
    component: SearchWindow,
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
] satisfies WindowDefinition[];
