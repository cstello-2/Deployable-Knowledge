<script lang="ts">
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { Button } from '$lib/components/ui/button';
	import { API_DOCUMENT_FILES } from '$lib/constants';
	import type { ApiSearchMatch } from '$lib/types';

	interface Props {
		index?: number;
		result: ApiSearchMatch;
	}

	let { index = 0, result }: Props = $props();
</script>

<article class="dk-panel grid gap-2 rounded-xl border p-3 shadow-sm">
	<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
		<span class="font-semibold text-primary">#{index + 1}</span>
		<strong class="text-foreground">{result.sourceTitle}</strong>
		<span>Page {result.pageIndex + 1}</span>
	</div>
	<p class="m-0 whitespace-pre-wrap text-sm leading-relaxed">{result.content}</p>
	<div>
		<Button
			variant="outline"
			size="sm"
			href={`${API_DOCUMENT_FILES.byId(result.documentId)}#page=${result.pageIndex + 1}`}
			target="_blank"
			rel="noopener noreferrer"
		>
			<ExternalLink /> Show in PDF
		</Button>
	</div>
</article>
