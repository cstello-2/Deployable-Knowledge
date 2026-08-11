<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		label: string;
	}

	let { children, label }: Props = $props();
</script>

<section class="mt-2 grid min-w-0 gap-1.5" aria-label={label}>
	{@render children?.()}
</section>
