<script lang="ts">
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { API_DOCUMENT_FILES } from '$lib/constants';
	import type { AgentOutput } from '$lib/types';

	interface Props {
		sources: Extract<AgentOutput, { type: 'source' }>[];
	}

	let { sources }: Props = $props();

	// Only PDF sources have a file to open; transcripts live in the library as chunks
	function hrefFor(output: Extract<AgentOutput, { type: 'source' }>): string | undefined {
		if (output.data.documentId && output.data.sourceType !== 'AUDIO') {
			const page = (output.data.pageIndex ?? 0) + 1;
			return `${API_DOCUMENT_FILES.byId(output.data.documentId)}#page=${page}`;
		}
		return output.data.url;
	}
</script>

{#if sources.length}
	<ol class="grid list-inside gap-1 text-xs text-muted-foreground">
		{#each sources as source (`source-${source.id}`)}
			{@const href = hrefFor(source)}
			<li>
				{#if href}
					<a
						class="inline-flex items-start gap-1 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground"
						{href}
						target="_blank"
						rel="external noopener noreferrer"
					>
						<span
							><strong class="text-foreground">{source.data.title || 'Document source'}</strong
							>{source.data.description ? ` — ${source.data.description}` : ''}</span
						>
						<ExternalLink class="mt-0.5 size-3 shrink-0" />
					</a>
				{:else}
					<span
						><strong class="text-foreground">{source.data.title || 'Document source'}</strong
						>{source.data.description ? ` — ${source.data.description}` : ''}</span
					>
				{/if}
			</li>
		{/each}
	</ol>
{/if}
