<script lang="ts">
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';
	import Wrench from '@lucide/svelte/icons/wrench';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Textarea } from '$lib/components/ui/textarea';

	interface Props {
		busy?: boolean;
		draft: string;
		notebookMode?: boolean;
		onNewChat: () => void;
		onSubmit: () => void;
		onToggleNotebookMode: () => void;
		onToggleTools: () => void;
		toolsEnabled?: boolean;
	}

	let {
		busy = false,
		draft = $bindable(),
		notebookMode = false,
		onNewChat,
		onSubmit,
		onToggleNotebookMode,
		onToggleTools,
		toolsEnabled = true
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
				<ActionIcon
					class={`size-8 rounded-full bg-transparent shadow-none hover:bg-transparent active:translate-y-0 ${notebookMode ? 'text-foreground hover:text-foreground' : 'text-foreground/40 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground'}`}
					disabled={busy}
					label={notebookMode
						? 'Notebook context enabled — click to use selected documents'
						: 'Use the active notebook as chat context'}
					onclick={onToggleNotebookMode}
					pressed={notebookMode}
					variant="ghost"
				>
					<BookOpen />
				</ActionIcon>
				<ActionIcon
					class={`size-8 rounded-full bg-transparent shadow-none hover:bg-transparent active:translate-y-0 ${toolsEnabled ? 'text-foreground hover:text-foreground' : 'text-foreground/40 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground'}`}
					disabled={busy}
					label={toolsEnabled
						? 'Tool calls enabled — click to answer without search or tools'
						: 'Tool calls disabled — click to allow search and other tools'}
					onclick={onToggleTools}
					pressed={toolsEnabled}
					variant="ghost"
				>
					<Wrench />
				</ActionIcon>
				<ActionIcon
					class="size-8 rounded-full bg-transparent text-foreground/40 shadow-none hover:bg-transparent hover:text-foreground active:translate-y-0 active:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
					disabled={busy}
					label="Start a new chat — the current chat stays in history"
					onclick={onNewChat}
					variant="ghost"
				>
					<MessageSquarePlus />
				</ActionIcon>
			</div>
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
</form>
