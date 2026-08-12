import { WindowColumn } from '$lib/enums';
import type { WindowPlacement } from '$lib/types/workspace';

export const WORKSPACE_WINDOW_IDS = {
	CHAT: 'chat-window',
	CHAT_HISTORY: 'chat-history-window',
	DOCUMENTS: 'documents-window',
	NOTEBOOK: 'notebook-window',
	SEARCH_CONTEXT: 'search-context-window'
} as const;

export const DEFAULT_WINDOW_HEIGHT = 320;
export const DEFAULT_LAYOUT_NAME = 'Layout 1';
export const LAYOUT_NAME_MAX_LENGTH = 64;

export const DEFAULT_WINDOW_PLACEMENTS: WindowPlacement[] = [
	placement(WORKSPACE_WINDOW_IDS.DOCUMENTS, WindowColumn.LEFT),
	placement(WORKSPACE_WINDOW_IDS.CHAT_HISTORY, WindowColumn.LEFT),
	placement(WORKSPACE_WINDOW_IDS.CHAT, WindowColumn.RIGHT),
	placement(WORKSPACE_WINDOW_IDS.SEARCH_CONTEXT, WindowColumn.RIGHT),
	placement(WORKSPACE_WINDOW_IDS.NOTEBOOK, WindowColumn.RIGHT)
];

function placement(id: string, column: WindowColumn): WindowPlacement {
	return { id, column, visible: true, collapsed: false, height: DEFAULT_WINDOW_HEIGHT };
}
