<script lang="ts">
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Brain from '@lucide/svelte/icons/brain';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';
	import Square from '@lucide/svelte/icons/square';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Textarea } from '$lib/components/ui/textarea';
	import { REASONING_PRESETS, type ReasoningEffort } from '$lib/constants';
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
		onReasoningEffortChange: (effort: ReasoningEffort) => void;
		onSearchChange: (enabled: boolean) => void;
		onStop: () => void;
		onSubmit: () => void;
		onToolsChange: (enabled: boolean) => void;
		reasoningEffort: ReasoningEffort;
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
		onReasoningEffortChange,
		onSearchChange,
		onStop,
		onSubmit,
		onToolsChange,
		reasoningEffort,
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
				<DropdownMenu.Root>
					<DropdownMenu.Trigger disabled={busy}>
						{#snippet child({ props })}
							<Button
								{...props}
								aria-label={`Reasoning effort: ${REASONING_PRESETS[reasoningEffort].label}`}
								class="h-8 rounded-full text-muted-foreground hover:text-foreground aria-expanded:text-foreground"
								disabled={busy}
								size="sm"
								variant="ghost"
							>
								<Brain aria-hidden="true" class="size-3.5" />
								{REASONING_PRESETS[reasoningEffort].label}
								<ChevronDown class="size-3" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="w-40" side="top" sideOffset={8}>
						<DropdownMenu.Label>Reasoning effort</DropdownMenu.Label>
						<DropdownMenu.RadioGroup
							onValueChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}
							value={reasoningEffort}
						>
							{#each Object.entries(REASONING_PRESETS) as [value, preset] (value)}
								<DropdownMenu.RadioItem {value}>{preset.label}</DropdownMenu.RadioItem>
							{/each}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
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
					disabled={!busy && !draft.trim()}
					label={busy ? 'Stop generation' : 'Send message'}
					onclick={(event) => {
						if (!busy) return;
						event.preventDefault();
						onStop();
					}}
					type={busy ? 'button' : 'submit'}
				>
					{#if busy}
						<Square aria-hidden="true" class="size-3.5 fill-current" />
					{:else}
						<ArrowUp />
					{/if}
				</ActionIcon>
			</div>
		</div>
	</div>
</form>
