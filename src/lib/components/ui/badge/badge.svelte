<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const badgeVariants = tv({
		base: 'focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-[color,box-shadow] focus-visible:ring-2 [&>svg]:pointer-events-none [&>svg]:size-3',
		variants: {
			variant: {
				default: 'border-primary/50 bg-primary/15 text-foreground [a&]:hover:bg-primary/25',
				secondary:
					'border-border bg-card text-muted-foreground [a&]:hover:border-primary/40 [a&]:hover:text-foreground',
				tertiary: 'border-border bg-muted text-foreground [a&]:hover:bg-accent',
				destructive:
					'border-destructive/60 bg-destructive/20 text-destructive [a&]:hover:bg-destructive/30 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
				outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/components/ui/utils';

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
	} = $props();
</script>

<svelte:element
	this={href ? 'a' : 'span'}
	bind:this={ref}
	data-slot="badge"
	{href}
	class={cn(badgeVariants({ variant }), className, 'backdrop-blur-sm')}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
