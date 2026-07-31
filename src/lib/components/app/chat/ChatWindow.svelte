<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { WorkspaceWindow } from '$lib/components/app/workspace/WorkspaceWindow';
	import {
		chatStore,
		documentsStore,
		notebooksStore,
		sessionsStore,
		settingsStore
	} from '$lib/stores';
	import type { ApiChatMessageRequest, SessionMessage } from '$lib/types';
	import { CONTEXT_OVERHEAD_TOKENS, CONTEXT_WINDOW_TOKENS_MAX } from '$lib/constants';
	import {
		estimateHistoryTokens,
		estimateMessageTokens,
		estimateSystemPromptTokens,
		estimateTokens
	} from '$lib/utils';
	import ChatForm from './ChatForm.svelte';
	import ChatMessageList from './ChatMessageList.svelte';
	import { sourceChunkIds } from './chat-message';

	interface Props {
		collapsed?: boolean;
		closable?: boolean;
		height?: number | null;
		id: string;
		onClose?: () => void;
		onToggleCollapse?: () => void;
		title: string;
	}

	let {
		id,
		title,
		closable = false,
		height = null,
		collapsed = false,
		onToggleCollapse = () => {},
		onClose = () => {}
	}: Props = $props();

	let logElement = $state<HTMLDivElement | null>(null);
	let draft = $state('');
	let notebookMode = $state(false);

	let notebooksRequested = false;
	$effect(() => {
		if (!notebookMode || notebooksRequested) return;
		notebooksRequested = true;
		void notebooksStore.load();
	});

	let notebookContextTokens = $derived(
		notebookMode
			? estimateTokens(
					notebooksStore.activeNotebook?.pages
						.map(({ content }) => content)
						.filter(Boolean)
						.join('\n\n') ?? ''
				)
			: 0
	);

	let contextUsed = $derived(
		estimateSystemPromptTokens({ notebookMode, toolsEnabled: chatStore.toolsEnabled }) +
			estimateHistoryTokens(chatStore.messages) +
			notebookContextTokens +
			estimateMessageTokens(draft)
	);

	let contextReserved = $derived(
		settingsStore.config.maxTokens +
			Math.max(0, settingsStore.config.reasoningBudget) +
			CONTEXT_OVERHEAD_TOKENS
	);

	let retrievalPending = $derived(!notebookMode && chatStore.toolsEnabled);

	async function notebookContext(): Promise<string> {
		await notebooksStore.load();
		return (
			notebooksStore.activeNotebook?.pages
				.map(({ content }) => content)
				.filter(Boolean)
				.join('\n\n') ?? ''
		);
	}

	async function createSession(): Promise<void> {
		chatStore.session = await sessionsStore.create();
		chatStore.messages = [];
		chatStore.streamedText = '';
		chatStore.liveTrace = [];
		chatStore.error = null;
		chatStore.agentStatus = 'Thinking…';
	}

	async function startNewChat(): Promise<void> {
		try {
			await createSession();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to start a new chat');
		}
	}

	async function scrollToBottom(): Promise<void> {
		await tick();
		if (logElement) logElement.scrollTop = logElement.scrollHeight;
	}

	async function send(): Promise<void> {
		if (chatStore.isStreaming || !draft.trim()) return;
		const text = draft.trim();
		draft = '';
		settingsStore.lastQuery = text;
		try {
			if (!chatStore.session) await createSession();
			await scrollToBottom();
			const config = settingsStore.config;
			const requestBase = {
				message: text,
				model_id: config.model,
				provider_id: config.provider,
				max_tokens: config.maxTokens,
				temperature: config.temperature,
				top_k: config.topK,
				reasoning_budget: config.reasoningBudget,
				agent_max_turns: config.agentMaxTurns,
				tools_enabled: chatStore.toolsEnabled,
				enabled_tools: config.enabledTools
			};
			const request: ApiChatMessageRequest = notebookMode
				? {
						...requestBase,
						conversational: true,
						context: await notebookContext(),
						notebook_id: notebooksStore.activeNotebookId
					}
				: {
						...requestBase,
						conversational: false,
						prompt_template_id: config.promptTemplateId,
						persona: config.persona,
						document_ids: [...documentsStore.selectedIds],
						rag_top_k: config.ragTopK
					};
			await chatStore.sendMessage(request);
			await sessionsStore.refresh();
		} catch (error) {
			toast.error(`Chat failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			await scrollToBottom();
		}
	}

	async function sendToNotebook(message: SessionMessage): Promise<void> {
		try {
			await notebooksStore.load();
			await notebooksStore.appendToActivePage(message.content);
			const chunkIds = sourceChunkIds(message);
			await notebooksStore.addSources(chunkIds);
			toast.success(
				chunkIds.length
					? `Sent to notebook with ${chunkIds.length} source${chunkIds.length === 1 ? '' : 's'}`
					: 'Sent to notebook'
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to send to notebook');
		}
	}

	async function saveChunk(chunkId: string): Promise<void> {
		try {
			const notebookTitle = await notebooksStore.saveChunk(chunkId);
			toast.success(`Chunk saved to Loaded Sources in ${notebookTitle}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save chunk');
		}
	}
</script>

<WorkspaceWindow
	{id}
	{title}
	{closable}
	{height}
	{collapsed}
	{onToggleCollapse}
	{onClose}
	contentClass="overflow-hidden"
	contentLabel="Assistant chat"
>
	<div class="flex h-full min-h-0 flex-col overflow-hidden">
		<ChatMessageList
			bind:ref={logElement}
			messages={chatStore.messages}
			busy={chatStore.isStreaming}
			streamedText={chatStore.streamedText}
			trace={chatStore.liveTrace}
			status={chatStore.agentStatus}
			error={chatStore.error ?? ''}
			onSaveChunk={(chunkId) => void saveChunk(chunkId)}
			onSendToNotebook={(message) => void sendToNotebook(message)}
		/>
		<ChatForm
			bind:draft
			busy={chatStore.isStreaming}
			contextLimit={CONTEXT_WINDOW_TOKENS_MAX}
			{contextReserved}
			{contextUsed}
			{notebookMode}
			onNewChat={() => void startNewChat()}
			onSubmit={() => void send()}
			onToggleNotebookMode={() => (notebookMode = !notebookMode)}
			onToggleTools={() => (chatStore.toolsEnabled = !chatStore.toolsEnabled)}
			{retrievalPending}
			toolsEnabled={chatStore.toolsEnabled}
		/>
	</div>
</WorkspaceWindow>
