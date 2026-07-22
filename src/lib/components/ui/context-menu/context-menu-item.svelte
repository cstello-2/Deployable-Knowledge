<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/components/ui/utils';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: ContextMenuPrimitive.ItemProps = $props();
</script>

<ContextMenuPrimitive.Item
	bind:ref
	data-slot="context-menu-item"
	class={cn(
		'relative flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs outline-none select-none data-highlighted:bg-muted data-highlighted:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
		className
	)}
	{...restProps}
/>
