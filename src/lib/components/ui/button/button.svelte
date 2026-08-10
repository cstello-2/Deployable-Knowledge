<script lang="ts" module>
	import { cn, type WithElementRef } from '$lib/components/ui/utils';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { type VariantProps, tv } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] text-xs font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform] active:translate-y-px focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				default:
					'border border-primary/55 bg-linear-to-b from-primary/10 to-primary/25 text-foreground shadow-sm hover:border-primary/75 hover:from-primary/20 hover:to-primary/35',
				destructive:
					'border border-destructive/70 bg-linear-to-b from-destructive/15 to-destructive/35 text-foreground shadow-sm hover:from-destructive/30 hover:to-destructive/50 focus-visible:ring-destructive/25 dark:focus-visible:ring-destructive/40',
				outline:
					'border bg-linear-to-b from-card to-elevated text-foreground shadow-sm hover:border-primary/40 hover:from-muted hover:to-elevated',
				secondary:
					'border bg-linear-to-b from-secondary to-muted text-secondary-foreground shadow-sm hover:border-primary/35 hover:from-muted hover:to-elevated',
				ghost: 'text-foreground hover:bg-muted/80',
				link: 'text-primary underline-offset-4 hover:underline'
			},
			size: {
				default: 'h-8 px-3 py-1.5 has-[>svg]:px-2.5',
				sm: 'h-7 gap-1 rounded-lg px-2.5 has-[>svg]:px-2',
				lg: 'h-9 px-5 has-[>svg]:px-3.5',
				'icon-lg': 'size-9',
				icon: 'size-9',
				'icon-sm': 'size-6 rounded-md'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		rel="external"
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
