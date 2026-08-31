import type { AgentTool, ToolExecutionContext } from './types';
import { createToolResult } from './result';
import { clampText, readObject } from '../utils/values';
import type { AgentGoal } from '$lib/types';

const MAX_GOALS = 30;
const MAX_GOAL_LENGTH = 300;

type GoalsToolData = {
	goals: AgentGoal[];
	remaining: number;
};

export function readGoals(context: ToolExecutionContext): AgentGoal[] {
	return Array.isArray(context.goals) ? (context.goals as AgentGoal[]) : [];
}

export function unfinishedGoals(context: ToolExecutionContext): AgentGoal[] {
	return readGoals(context).filter((goal) => !goal.done);
}

const MAX_ANSWER_LENGTH = 500;
const MAX_NUDGES = 3;

// Called by the agent runner when the model tries to give a final answer while
// goals remain unfinished. Nudges at most once per distinct goal-list state:
// if the model comes back without updating its goals, it has decided the list
// is stale and its answer stands.
export function createGoalNudger(): (context: ToolExecutionContext) => string | null {
	let nudges = 0;
	let lastSnapshot = '';

	return (context) => {
		const unfinished = unfinishedGoals(context);
		if (!unfinished.length || nudges >= MAX_NUDGES) return null;
		const snapshot = JSON.stringify(readGoals(context));
		if (snapshot === lastSnapshot) return null;
		lastSnapshot = snapshot;
		nudges += 1;
		return [
			'Do not answer yet. These goals are still unfinished:',
			...unfinished.map((goal) => `- ${goal.text}`),
			'Continue now: work on the next unfinished goal using tools. When a goal is complete, update the goals tool with done: true and record what you found in its answer field. If a goal cannot be completed or is no longer relevant, mark it done with an answer explaining why. Give the final answer once every goal is done.'
		].join('\n');
	};
}

function parseGoals(value: unknown, previous: AgentGoal[]): AgentGoal[] {
	if (!Array.isArray(value)) return [];

	const previousByText = new Map(previous.map((goal) => [goal.text.toLowerCase(), goal]));
	const goals: AgentGoal[] = [];
	for (const item of value.slice(0, MAX_GOALS)) {
		let text = '';
		let done = false;
		let doneSpecified = false;
		let answer = '';
		if (typeof item === 'string') {
			text = clampText(item, MAX_GOAL_LENGTH);
		} else {
			const record = readObject(item);
			text = clampText(record.text, MAX_GOAL_LENGTH);
			done = record.done === true || record.done === 'true';
			doneSpecified = record.done !== undefined;
			answer = clampText(record.answer, MAX_ANSWER_LENGTH);
		}
		if (!text) continue;
		const prior = previousByText.get(text.toLowerCase());
		if (!doneSpecified) done = prior?.done === true;
		if (!answer) answer = prior?.answer ?? '';
		goals.push({ text, done, ...(answer ? { answer } : {}) });
	}
	return goals;
}

export const goalsTool: AgentTool<GoalsToolData> = {
	id: 'goals',
	label: 'Goal tracking',
	description: 'Tracks a checklist of goals so multi-step requests are completed fully.',
	modes: ['document', 'notebook'],
	defaultEnabled: false,
	keepResultOnCompact: true,
	instructions: `GOAL TRACKING POLICY:
- When a request has multiple parts, questions, or steps, call goals FIRST with one entry per part before doing anything else. Copy each part faithfully.
- The call replaces the whole list: send every goal each time, setting done: true on the ones you have completed and done: false on the rest.
- After finishing work on each part, call goals again with that entry marked done and its answer field filled with what you found. Older tool results may be trimmed from the conversation, so the answer fields are your memory — write the concrete facts there, not just "found it".
- Give the final answer only after every goal is done, so keep the list accurate.
- If a goal turns out to be impossible, out of scope, or no longer relevant, mark it done with an answer explaining why instead of leaving it unfinished.
- Build the final answer from the goals' answer fields plus the most recent tool results.
- For a single, simple request, do not use this tool.`,
	definition: {
		description:
			'Create or update your goal checklist for the current request. Sending a list replaces the previous list. Use one goal per question, part, or step of the user request; mark each done: true as you complete it.',
		parameters: {
			type: 'object',
			properties: {
				goals: {
					type: 'array',
					description: 'The complete goal list, one entry per part of the request.',
					items: {
						type: 'object',
						properties: {
							text: {
								type: 'string',
								description: 'Short description of the goal, such as the question it answers.'
							},
							done: {
								type: 'boolean',
								description: 'true once this goal is fully completed.'
							},
							answer: {
								type: 'string',
								description:
									'The concrete answer or key finding for this goal, filled in when marking it done.'
							}
						}
					}
				}
			},
			required: ['goals'],
			additionalProperties: false
		}
	},

	async execute(argumentsValue, context) {
		const args = readObject(argumentsValue);
		const goals = parseGoals(args.goals, readGoals(context));

		if (!goals.length) {
			throw new Error('goals requires a non-empty goals array of {text, done} entries');
		}

		context.goals = goals;
		const remaining = goals.filter((goal) => !goal.done).length;

		const data: GoalsToolData = { goals, remaining };
		return createToolResult(data, {
			content: JSON.stringify({
				goals,
				remaining,
				note:
					remaining > 0
						? `${remaining} goal(s) unfinished. Continue working on them with tools.`
						: 'All goals complete. Give the final answer now.'
			})
		});
	}
};
