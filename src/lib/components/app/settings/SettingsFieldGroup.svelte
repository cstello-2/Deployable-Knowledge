<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		hint?: string;
		icon: Component;
		title: string;
	}

	let { children, hint = '', icon: Icon, title }: Props = $props();
</script>

<section class="grid gap-3 rounded-xl border bg-linear-to-b from-card to-elevated p-4 shadow-sm">
	<header class="grid gap-1">
		<div class="flex items-center gap-2">
			<Icon class="size-4 shrink-0 text-muted-foreground" />
			<h3 class="m-0 text-sm font-semibold">{title}</h3>
		</div>
		{#if hint}
			<p class="m-0 text-xs text-muted-foreground">{hint}</p>
		{/if}
	</header>
	{@render children()}
</section>
