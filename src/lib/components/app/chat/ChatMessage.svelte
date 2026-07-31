<script lang="ts">
	import { MarkdownContent } from '$lib/components/app/content';
	import type { SessionMessage } from '$lib/types';
	import ChatMessageToolbar from './ChatMessageToolbar.svelte';
	import { ChatMessageContext } from './ChatMessageContext';
	import { messageMetadata, messageTrace } from './chat-message';

	interface Props {
		message: SessionMessage;
		onSaveChunk: (chunkId: string) => Promise<void> | void;
		onSendToNotebook: () => void;
	}

	let { message, onSaveChunk, onSendToNotebook }: Props = $props();
	const metadata = $derived(messageMetadata(message));
	const trace = $derived(messageTrace(metadata.agent));
</script>

<article
	class={[
		'text-sm',
		message.role === 'user'
			? 'dk-panel max-w-[92%] self-end rounded-xl border bg-primary/10 p-3 text-right shadow-sm'
			: 'w-full self-start py-2 text-left'
	]}
>
	{#if message.role === 'assistant'}
		<ChatMessageContext {trace} />
		<MarkdownContent content={message.content} />
		<ChatMessageContext outputs={metadata.outputs ?? []} {onSaveChunk} />
		<ChatMessageToolbar
			agent={metadata.agent}
			contextCount={metadata.outputs?.length ?? 0}
			{trace}
			{onSendToNotebook}
		/>
	{:else}
		<p class="m-0 whitespace-pre-wrap">{message.content}</p>
	{/if}
</article>
