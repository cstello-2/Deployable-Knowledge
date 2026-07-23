<script lang="ts">
	let { class: className = '' }: { class?: string } = $props();
	const uid = $props.id();
</script>

<svg
	class={className}
	viewBox="0 0 24 24"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
>
	<defs>
		<linearGradient id="gemma-{uid}" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
			<stop stop-color="#446EFF" />
			<stop offset="1" stop-color="#2E96FF" />
		</linearGradient>
	</defs>
	<path
		fill="url(#gemma-{uid})"
		d="M12 1c1.1 4.9 3.6 8.3 11 11-7.4 2.7-9.9 6.1-11 11-1.1-4.9-3.6-8.3-11-11 7.4-2.7 9.9-6.1 11-11Z"
	/>
</svg>
