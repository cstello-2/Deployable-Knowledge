<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		hint?: string;
		icon: Component;
		title: string;
	}

	let { children, hint = '', icon: Icon, title }: Props = $props();

	const headingId = $props.id();
</script>

<section aria-labelledby={headingId} class="grid gap-4">
	<header class="flex items-center gap-3">
		<Icon class="size-5 shrink-0" />
		<div class="grid gap-1">
			<h3 class="m-0 text-base font-semibold" id={headingId}>{title}</h3>
			{#if hint}
				<p class="m-0 text-xs text-muted-foreground">{hint}</p>
			{/if}
		</div>
	</header>
	{@render children()}
</section>
