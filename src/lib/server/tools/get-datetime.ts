import type { AgentTool } from './types';
import { createToolResult } from './result';
import { clampText, readObject } from '../utils/values';

type GetDatetimeResult = {
	iso: string;
	formatted: string;
	timeZone: string;
};

export const getDatetimeTool: AgentTool<GetDatetimeResult> = {
	id: 'get_datetime',
	label: 'Date & time',
	description: 'Reads the current date and time instead of guessing it.',
	modes: ['document', 'notebook'],
	definition: {
		description:
			'Get the current date and time. Use this instead of guessing whenever the request depends on the current date, time, day, or timezone.',
		parameters: {
			type: 'object',
			properties: {
				timezone: {
					type: 'string',
					description:
						'Optional IANA timezone such as America/New_York. Defaults to the server timezone.'
				}
			},
			additionalProperties: false
		}
	},

	async execute(argumentsValue, context) {
		const args = readObject(argumentsValue);
		const requestedTimeZone = clampText(args.timezone, 128);
		const timeZone =
			requestedTimeZone ||
			context.timeZone ||
			Intl.DateTimeFormat().resolvedOptions().timeZone ||
			'UTC';
		const now = context.now?.() ?? new Date();
		const formatted = new Intl.DateTimeFormat('en-US', {
			timeZone,
			dateStyle: 'full',
			timeStyle: 'long'
		}).format(now);
		const data = { iso: now.toISOString(), formatted, timeZone };

		return createToolResult(data);
	}
};
