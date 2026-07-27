<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea';
	import type { TranscriptionResult } from '$lib/types';

	interface Props {
		result: TranscriptionResult | null;
	}

	let { result }: Props = $props();
</script>

<Textarea
	aria-label="Transcript"
	readonly
	rows={12}
	value={result?.text ?? ''}
	placeholder="The transcript will appear here."
/>
