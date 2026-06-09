import AssistantSettings from "./AssistantSettings.svelte";
import ChatWindow from "./ChatWindow.svelte";
import DocumentsWindow from "./DocumentsWindow.svelte";
import ChatHistoryWindow from "./ChatHistoryWindow.svelte";

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
    title: "Document Library",
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
] satisfies WindowDefinition[];
