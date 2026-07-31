import BookOpen from '@lucide/svelte/icons/book-open';
import Files from '@lucide/svelte/icons/files';
import History from '@lucide/svelte/icons/history';
import MessageSquare from '@lucide/svelte/icons/message-square';
import Network from '@lucide/svelte/icons/network';
import Search from '@lucide/svelte/icons/search';
import ChatWindow from '$lib/components/app/chat/ChatWindow.svelte';
import ChatHistoryWindow from '$lib/components/app/chat/ChatHistory/ChatHistoryWindow.svelte';
import DocumentsWindow from '$lib/components/app/documents/DocumentsWindow.svelte';
import NotebookWindow from '$lib/components/app/notebook/NotebookWindow.svelte';
import SearchWindow from '$lib/components/app/search/SearchWindow.svelte';
import GraphGalaxyWindow from '$lib/components/windows/GraphGalaxyWindow.svelte';
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
		id: 'documents-window',
		title: 'Document Library',
		column: WindowColumn.LEFT,
		component: DocumentsWindow,
		icon: Files
	},
	{
		id: 'chat-window',
		title: 'Assistant Chat',
		column: WindowColumn.RIGHT,
		component: ChatWindow,
		icon: MessageSquare
	},
	{
		id: 'search-context-window',
		title: 'Search Context',
		column: WindowColumn.RIGHT,
		component: SearchWindow,
		icon: Search
	},
	{
		id: 'chat-history-window',
		title: 'Chat History',
		column: WindowColumn.LEFT,
		component: ChatHistoryWindow,
		icon: History
	},
	{
		id: 'graph-galaxy-window',
		title: 'Graph Galaxy',
		column: WindowColumn.LEFT,
		component: GraphGalaxyWindow,
		icon: Network
	},
	{
		id: 'notebook-window',
		title: 'Notebook',
		column: WindowColumn.RIGHT,
		component: NotebookWindow,
		icon: BookOpen
	}
] satisfies WindowDefinition[];

export const windowDefinitionsById = new Map(
	windowDefinitions.map((definition) => [definition.id, definition])
);
