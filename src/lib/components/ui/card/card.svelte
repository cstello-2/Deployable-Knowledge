<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/components/ui/utils';
	import { BOX_BORDER } from '$lib/constants';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card"
	class={cn(
		'dk-panel flex flex-col gap-3 rounded-xl py-3 text-card-foreground shadow-sm',
		BOX_BORDER,
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
