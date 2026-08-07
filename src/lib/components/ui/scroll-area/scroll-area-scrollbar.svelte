<script lang="ts">
	import { ScrollArea as ScrollAreaPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '$lib/components/ui/utils';

	let {
		ref = $bindable(null),
		class: className,
		orientation = 'vertical',
		children,
		...restProps
	}: WithoutChild<ScrollAreaPrimitive.ScrollbarProps> = $props();
</script>

<ScrollAreaPrimitive.Scrollbar
	bind:ref
	data-slot="scroll-area-scrollbar"
	{orientation}
	class={cn(
		'flex touch-none bg-(--scrollbar-track) p-0.5 transition-colors select-none',
		orientation === 'vertical' && 'h-full w-(--scrollbar-size)',
		orientation === 'horizontal' && 'h-(--scrollbar-size) flex-col',
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<ScrollAreaPrimitive.Thumb
		data-slot="scroll-area-thumb"
		class="relative flex-1 rounded-(--scrollbar-radius) bg-(--scrollbar-thumb) group-hover:bg-(--scrollbar-thumb-hover)"
	/>
</ScrollAreaPrimitive.Scrollbar>
