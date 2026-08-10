<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/components/ui/utils';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		...restProps
	}: ContextMenuPrimitive.ContentProps = $props();
</script>

<ContextMenuPrimitive.Portal>
	<ContextMenuPrimitive.Content
		bind:ref
		data-slot="context-menu-content"
		{sideOffset}
		class={cn(
			'dk-panel z-50 min-w-44 origin-(--bits-context-menu-content-transform-origin) overflow-hidden rounded-xl border bg-linear-to-b from-card to-elevated p-1.5 text-popover-foreground shadow-lg outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
			className
		)}
		{...restProps}
	/>
</ContextMenuPrimitive.Portal>
