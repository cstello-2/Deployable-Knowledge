<script lang="ts">
	import { MarkdownContent } from '$lib/components/app/content';
	import * as Empty from '$lib/components/ui/empty';
	import { ScrollArea } from '$lib/components/ui/scroll-area';

	interface Props {
		content: string;
		viewportRef?: HTMLDivElement | null;
	}

	let { content, viewportRef = $bindable(null) }: Props = $props();
</script>

<ScrollArea class="min-h-0 min-w-0" aria-label="Notebook preview" bind:viewportRef>
	<div class="p-4 pr-6">
		{#if content.trim()}
			<MarkdownContent {content} />
		{:else}
			<Empty.Root class="border border-dashed"
				><Empty.Header
					><Empty.Title>Nothing to preview</Empty.Title><Empty.Description
						>Write notes to render a Markdown preview.</Empty.Description
					></Empty.Header
				></Empty.Root
			>
		{/if}
	</div>
</ScrollArea>
