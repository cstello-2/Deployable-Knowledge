<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Layers3 from '@lucide/svelte/icons/layers-3';
	import Repeat2 from '@lucide/svelte/icons/repeat-2';
	import Wrench from '@lucide/svelte/icons/wrench';
	import { ActionIcon } from '$lib/components/app/actions';
	import type { AgentTraceItem, StoredAgentRun } from '$lib/types';

	interface Props {
		agent?: StoredAgentRun;
		contextCount?: number;
		onSendToNotebook: () => void;
		trace?: AgentTraceItem[];
	}

	let { agent, contextCount = 0, onSendToNotebook, trace = [] }: Props = $props();
	const toolCount = $derived(trace.filter(({ kind }) => kind === 'tool').length);
</script>

<div
	class="mt-2 flex min-h-7 items-center gap-2 overflow-x-auto border-t pt-1 text-[0.65rem] text-muted-foreground"
	aria-label="Response actions"
>
	{#if agent}
		<span class="inline-flex shrink-0 items-center gap-1"
			><Wrench class="size-3" /> {toolCount} tool{toolCount === 1 ? '' : 's'}</span
		>
		<span class="inline-flex shrink-0 items-center gap-1"
			><Layers3 class="size-3" /> {contextCount} context</span
		>
		<span class="inline-flex shrink-0 items-center gap-1"
			><Repeat2 class="size-3" />
			{agent.modelTurns ?? 0} turn{agent.modelTurns === 1 ? '' : 's'}</span
		>
	{/if}

	<ActionIcon
		variant="ghost"
		size="icon-sm"
		class="ml-auto size-6"
		label="Send to notebook"
		onclick={onSendToNotebook}><BookOpen /></ActionIcon
	>
</div>
