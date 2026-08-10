<script lang="ts">
	import { cn } from '$lib/components/ui/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import './markdown-content.css';

	interface Props {
		allowHtml?: boolean;
		class?: string;
		content: string;
	}

	let { allowHtml = false, class: className, content }: Props = $props();
</script>

<div class={cn('markdown-content prose prose-sm max-w-none dark:prose-invert', className)}>
	{@html renderMarkdown(content, { allowHtml })}
</div>
