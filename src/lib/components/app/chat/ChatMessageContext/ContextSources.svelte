<script lang="ts">
	import AudioLines from '@lucide/svelte/icons/audio-lines';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import FileText from '@lucide/svelte/icons/file-text';
	import Globe from '@lucide/svelte/icons/globe';
	import { documentViewerHref } from '$lib/constants';
	import type { AgentOutput } from '$lib/types';

	type SourceOutput = Extract<AgentOutput, { type: 'source' }>;

	interface Props {
		sources: SourceOutput[];
	}

	let { sources }: Props = $props();

	function hrefFor(output: SourceOutput): string | undefined {
		if (!output.data.documentId) return output.data.url;
		return documentViewerHref(output.data.sourceType, output.data.documentId, output.data);
	}

	function iconFor(output: SourceOutput) {
		if (!output.data.documentId) return Globe;
		return output.data.sourceType === 'AUDIO' ? AudioLines : FileText;
	}
</script>

{#snippet sourceLabel(source: SourceOutput)}
	{@const TypeIcon = iconFor(source)}
	<TypeIcon class="mt-0.5 size-3 shrink-0" />
	<span
		><strong class="text-foreground">{source.data.title || 'Document source'}</strong>{source.data
			.description
			? ` ${source.data.description}`
			: ''}</span
	>
{/snippet}

{#if sources.length}
	<ol class="grid list-inside gap-1 text-xs text-muted-foreground">
		{#each sources as source (`source-${source.id}`)}
			{@const href = hrefFor(source)}
			<li>
				{#if href}
					<a
						class="inline-flex items-start gap-1 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground"
						{href}
						rel="external noopener noreferrer"
						target="_blank"
					>
						{@render sourceLabel(source)}
						<ExternalLink class="mt-0.5 size-3 shrink-0" />
					</a>
				{:else}
					<span class="inline-flex items-start gap-1 px-1 py-0.5">
						{@render sourceLabel(source)}
					</span>
				{/if}
			</li>
		{/each}
	</ol>
{/if}
