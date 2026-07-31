<script lang="ts">
	import type { AgentOutput } from '$lib/types';

	interface Props {
		outputs: Exclude<AgentOutput, { type: 'source' }>[];
	}

	let { outputs }: Props = $props();

	function imageSource(output: Extract<AgentOutput, { type: 'image' }>): string {
		return `data:${output.data.mimeType};base64,${output.data.base64}`;
	}

	function formatData(value: unknown): string {
		try {
			return JSON.stringify(value, null, 2) ?? String(value);
		} catch {
			return String(value);
		}
	}
</script>

{#if outputs.length}
	<ul class="grid list-none gap-1.5 p-0">
		{#each outputs as output (`${output.type}-${output.id}`)}
			<li
				class={[
					'min-w-0 text-xs',
					output.type !== 'image' && 'rounded-md border-l-2 bg-muted/40 p-2'
				]}
			>
				{#if output.type === 'image'}
					<img
						class="max-h-60 max-w-full rounded bg-white object-contain"
						src={imageSource(output)}
						alt={output.data.alt}
						loading="lazy"
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
