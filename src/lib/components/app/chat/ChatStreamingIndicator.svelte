<script lang="ts">
	import { MarkdownContent } from '$lib/components/app/content';
	import { ChatMessageContext } from './ChatMessageContext';
	import type { AgentTraceItem } from '$lib/types';

	interface Props {
		error?: string;
		status: string;
		streamedText?: string;
		trace?: AgentTraceItem[];
	}

	let { error = '', status, streamedText = '', trace = [] }: Props = $props();
</script>

<article class="w-full self-start py-2 text-sm" aria-live="polite">
	<ChatMessageContext {trace} />
	{#if !streamedText && !trace.some((item) => item.status === 'running')}
		<div class="flex items-center gap-2 text-xs text-muted-foreground" role="status">
			<span class="flex gap-1" aria-hidden="true"
				><span class="size-1.5 animate-bounce rounded-full bg-primary"></span><span
					class="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]"
				></span><span
					class="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]"
				></span></span
			>
			{status}
		</div>
	{/if}
	{#if error}<p class="text-xs text-destructive">{error}</p>{/if}
	{#if streamedText}<MarkdownContent content={streamedText} />{/if}
</article>
