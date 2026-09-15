<script lang="ts">
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Textarea } from '$lib/components/ui/textarea';
	import ChatContextMeter from './ChatContextMeter.svelte';
	import ChatModeMenu from './ChatModeMenu.svelte';

	interface Props {
		busy?: boolean;
		contextLimit: number;
		contextReserved: number;
		contextUsed: number;
		draft: string;
		notebookMode?: boolean;
		onNewChat: () => void;
		onNotebookModeChange: (enabled: boolean) => void;
		onSearchChange: (enabled: boolean) => void;
		onSubmit: () => void;
		onToolsChange: (enabled: boolean) => void;
		searchEnabled?: boolean;
		searchToolActive?: boolean;
		toolsEnabled?: boolean;
		toolsSupported?: boolean;
	}

	let {
		busy = false,
		contextLimit,
		contextReserved,
		contextUsed,
		draft = $bindable(),
		notebookMode = false,
		onNewChat,
		onNotebookModeChange,
		onSearchChange,
		onSubmit,
		onToolsChange,
		searchEnabled = false,
		searchToolActive = false,
		toolsEnabled = false,
		toolsSupported = true
	}: Props = $props();

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
		event.preventDefault();
		if (!busy && draft.trim()) onSubmit();
	}
</script>

<form
	class="mt-3 shrink-0 px-2 pb-2"
	onsubmit={(event) => {
		event.preventDefault();
		onSubmit();
	}}
>
	<div
		class="dk-panel overflow-hidden rounded-3xl border bg-card/90 shadow-md transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25"
	>
		<Textarea
			aria-label="Message"
			class="max-h-40 min-h-16 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-4 pt-3 pb-1 shadow-none focus-visible:border-transparent focus-visible:ring-0"
			disabled={busy}
			name="message"
			onkeydown={handleKeydown}
			placeholder="Type a message…"
			rows={2}
			bind:value={draft}
		/>
		<div class="flex items-center justify-between gap-2 px-2.5 pb-2">
			<div class="flex items-center gap-1">
				<ChatModeMenu
					disabled={busy}
					{notebookMode}
					{onNotebookModeChange}
					{onSearchChange}
					{onToolsChange}
					{searchEnabled}
					{searchToolActive}
					{toolsEnabled}
					{toolsSupported}
				/>
				<ActionIcon
					class="size-8 rounded-full bg-transparent text-foreground/40 shadow-none hover:bg-transparent hover:text-foreground active:translate-y-0 active:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
					label="Start a new chat — the current chat stays in history"
					onclick={onNewChat}
					variant="ghost"
				>
					<MessageSquarePlus />
				</ActionIcon>
			</div>
			<div class="flex items-center gap-2">
				<ChatContextMeter
					limit={contextLimit}
					reserved={contextReserved}
					retrievalPending={searchEnabled}
					used={contextUsed}
				/>
				<ActionIcon
					class="size-8 rounded-full shadow-sm"
					disabled={busy || !draft.trim()}
					label="Send message"
					type="submit"
				>
					<ArrowUp />
				</ActionIcon>
			</div>
		</div>
	</div>
</form>
