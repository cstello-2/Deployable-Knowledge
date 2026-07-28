<script lang="ts">
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import type { AgentTraceItem, SessionMessage } from '$lib/types';
	import ChatMessage from './ChatMessage.svelte';
	import ChatStreamingIndicator from './ChatStreamingIndicator.svelte';

	interface Props {
		busy?: boolean;
		error?: string;
		messages: SessionMessage[];
		onSaveChunk: (chunkId: string) => Promise<void> | void;
		onSendToNotebook: (message: SessionMessage) => void;
		ref?: HTMLDivElement | null;
		status?: string;
		streamedText?: string;
		trace?: AgentTraceItem[];
	}

	let {
		busy = false,
		error = '',
		messages,
		onSaveChunk,
		onSendToNotebook,
		ref = $bindable(null),
		status = 'Thinking…',
		streamedText = '',
		trace = []
	}: Props = $props();
</script>

<ScrollArea
	class="min-h-0 flex-1 rounded-xl"
	scrollbarYClasses="hidden"
	bind:viewportRef={ref}
	aria-live="polite"
>
	<div class="flex min-h-full flex-col gap-2 p-2">
		{#each messages as message (message.id)}
			<ChatMessage {message} {onSaveChunk} onSendToNotebook={() => onSendToNotebook(message)} />
		{:else}
			{#if !busy}
				<Empty.Root class="my-auto"
					><Empty.Header
						><Empty.Title>Start a conversation</Empty.Title><Empty.Description
							>Ask about selected documents or switch to notebook context.</Empty.Description
						></Empty.Header
					></Empty.Root
				>
			{/if}
		{/each}
		{#if busy}<ChatStreamingIndicator {error} {status} {streamedText} {trace} />{/if}
	</div>
</ScrollArea>
