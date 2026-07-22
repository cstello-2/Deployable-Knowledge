<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import type { AgentTraceItem } from '$lib/types';

	interface Props {
		trace: AgentTraceItem[];
	}

	let { trace }: Props = $props();
</script>

{#if trace.length}
	<div class="mb-2 grid w-full gap-1 text-xs text-muted-foreground" aria-label="Agent activity">
		{#each trace as item (`${item.kind}-${item.id}`)}
			<details
				class="dk-panel group overflow-hidden rounded-lg border"
				class:border-destructive={item.isError || item.status === 'error'}
			>
				<summary
					class="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-1.5 hover:bg-muted/60"
				>
					<span class="min-w-0 overflow-wrap-anywhere"
						>{item.title}{item.isError || item.status === 'error' ? ' (failed)' : ''}</span
					>
					<ChevronDown class="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
				</summary>
				<pre
					class="m-0 max-h-80 overflow-auto border-t bg-muted/40 p-2 text-[0.7rem] whitespace-pre-wrap text-foreground">{item.output}</pre>
			</details>
		{/each}
	</div>
{/if}
