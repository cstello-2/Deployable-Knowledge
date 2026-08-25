import BookOpen from '@lucide/svelte/icons/book-open';
import Bug from '@lucide/svelte/icons/bug';
import Files from '@lucide/svelte/icons/files';
import History from '@lucide/svelte/icons/history';
import MessageSquare from '@lucide/svelte/icons/message-square';
import Search from '@lucide/svelte/icons/search';
import ChatWindow from '$lib/components/app/chat/ChatWindow.svelte';
import ChatHistoryWindow from '$lib/components/app/chat/ChatHistory/ChatHistoryWindow.svelte';
import { DiagnosticsWindow } from '$lib/components/app/diagnostics';
import DocumentsWindow from '$lib/components/app/documents/DocumentsWindow.svelte';
import NotebookWindow from '$lib/components/app/notebook/NotebookWindow.svelte';
import SearchWindow from '$lib/components/app/search/SearchWindow.svelte';
import { WORKSPACE_WINDOW_IDS } from '$lib/constants';
import { WindowColumn } from '$lib/enums';
import type { Component } from 'svelte';

export interface WindowInstanceProps {
	collapsed?: boolean;
	closable?: boolean;
	height?: number | null;
	id: string;
	onClose?: () => void;
	onToggleCollapse?: () => void;
	title: string;
}

export interface WindowDefinition {
	column: WindowColumn;
	component: Component<WindowInstanceProps>;
	icon: Component;
	id: string;
	title: string;
}

export const windowDefinitions = [
	{
		id: WORKSPACE_WINDOW_IDS.DOCUMENTS,
		title: 'Document Library',
		column: WindowColumn.LEFT,
		component: DocumentsWindow,
		icon: Files
	},
	{
		id: WORKSPACE_WINDOW_IDS.CHAT,
		title: 'Assistant Chat',
		column: WindowColumn.RIGHT,
		component: ChatWindow,
		icon: MessageSquare
	},
	{
		id: WORKSPACE_WINDOW_IDS.SEARCH_CONTEXT,
		title: 'Search Context',
		column: WindowColumn.RIGHT,
		component: SearchWindow,
		icon: Search
	},
	{
		id: WORKSPACE_WINDOW_IDS.CHAT_HISTORY,
		title: 'Chat History',
		column: WindowColumn.LEFT,
		component: ChatHistoryWindow,
		icon: History
	},
	{
		id: WORKSPACE_WINDOW_IDS.NOTEBOOK,
		title: 'Notebook',
		column: WindowColumn.RIGHT,
		component: NotebookWindow,
		icon: BookOpen
	},
	{
		id: WORKSPACE_WINDOW_IDS.DIAGNOSTICS,
		title: 'Diagnostics',
		column: WindowColumn.RIGHT,
		component: DiagnosticsWindow,
		icon: Bug
	}
] satisfies WindowDefinition[];

export const windowDefinitionsById = new Map<string, WindowDefinition>(
	windowDefinitions.map((definition) => [definition.id, definition])
);
