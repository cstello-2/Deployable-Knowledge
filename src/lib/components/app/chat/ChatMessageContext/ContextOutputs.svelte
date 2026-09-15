<script lang="ts">
	import type { AgentOutput } from '$lib/types';

	interface Props {
		outputs: Exclude<AgentOutput, { type: 'source' }>[];
	}

	let { outputs }: Props = $props();

	function formatData(value: unknown): string {
		try {
			return JSON.stringify(value, null, 2) ?? String(value);
		} catch {
			return String(value);
		}
	}
</script>

{#if outputs.length}
	<ul class="flex list-none flex-wrap items-start gap-1.5 p-0">
		{#each outputs as output (`${output.type}-${output.id}`)}
			<li
				class={[
					'min-w-0 max-w-full text-xs',
					output.type !== 'image' && 'w-full rounded-md border-l-2 bg-muted/40 p-2'
				]}
			>
				{#if output.type === 'image'}
					<img
						alt={output.data.alt}
						class="max-h-60 max-w-full rounded bg-white object-contain"
						loading="lazy"
						src={`data:${output.data.mimeType};base64,${output.data.base64}`}
					/>
				{:else if output.type === 'text'}
					{#if output.label}<strong
							class="mr-2 text-[0.65rem] tracking-wide text-muted-foreground uppercase"
							>{output.label}</strong
						>{/if}{output.data}
				{:else}
					{#if output.label}<strong
							class="text-[0.65rem] tracking-wide text-muted-foreground uppercase"
							>{output.label}</strong
						>{/if}
					<pre class="m-0 max-w-full overflow-auto whitespace-pre-wrap">{formatData(
							output.data
						)}</pre>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
