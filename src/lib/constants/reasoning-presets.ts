export const REASONING_PRESETS = {
	low: { label: 'Low', budget: 512 },
	medium: { label: 'Medium', budget: 2_048 },
	high: { label: 'High', budget: 8_192 },
	xhigh: { label: 'Extra High', budget: 16_384 }
} as const;

export type ReasoningEffort = keyof typeof REASONING_PRESETS;

export function reasoningEffortForBudget(budget: number): ReasoningEffort {
	if (budget < 0) return 'xhigh';
	for (const effort of Object.keys(REASONING_PRESETS) as ReasoningEffort[]) {
		if (budget <= REASONING_PRESETS[effort].budget) return effort;
	}
	return 'xhigh';
}
