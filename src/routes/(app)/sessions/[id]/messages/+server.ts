import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { DEFAULT_ASSISTANT_CONFIG, DEFAULT_PROMPT_TEMPLATE, NEW_CHAT_TITLE } from '$lib/constants';
import { RetrievalMode } from '$lib/enums';
import type {
	AgentProgressEvent,
	ApiChatMessageRequest,
	ApiChatStreamEvent,
	ApiNotebookChatMessageRequest,
	AssistantProfile
} from '$lib/types';
import { runAgent } from '$lib/server/agent/runner';
import { runAutoSearch } from '$lib/server/chat/auto-search';
import {
	createDocumentMessages,
	createNotebookMessages
} from '$lib/server/chat/build-chat-messages';
import { generateChatTitle } from '$lib/server/chat/generate-chat-title';
import { getNotebookSourceExcerpts } from '$lib/server/chat/notebook-context';
import { db } from '$lib/server/database/database';
import { promptTemplates } from '$lib/server/database/schema';
import { diagnosticEvents } from '$lib/server/diagnostics/events';
import { getActiveProfile } from '$lib/server/profiles/active-profile';
import { findProvider } from '$lib/server/providers/registry';
import type { Provider, ProviderChatOptions } from '$lib/server/providers/provider';
import { SessionsRepository } from '$lib/server/repositories';
import { toolRegistry } from '$lib/server/tools';
import { readGoals } from '$lib/server/tools/goals';
import type { ToolExecutionContext } from '$lib/server/tools/types';
import { ndjsonTaskResponse } from '$lib/server/utils/ndjson-response';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json()) as ApiChatMessageRequest;
	const message = body.message.trim();
	const modelId = body.model_id.trim();
	const providerId = body.provider_id.trim();
	if (!message || !modelId || !providerId) {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const provider = await findProvider(providerId);
	if (!provider) {
		return json(
			{ error: 'The selected provider no longer exists. Choose another model in settings.' },
			{ status: 404 }
		);
	}

	const profile = await getActiveProfile();
	const session = await SessionsRepository.find(params.id);
	if (!session) await SessionsRepository.create(params.id);
	const history = await SessionsRepository.listMessages(params.id);
	const shouldGenerateTitle =
		!history.length &&
		(!session || session.title.trim().toLowerCase() === NEW_CHAT_TITLE.toLowerCase());

	const toolNames = await resolveToolNames(body, provider, modelId, profile);

	const retrievalMode =
		Object.values(RetrievalMode).find((mode) => mode === profile?.retrievalMode) ??
		DEFAULT_ASSISTANT_CONFIG.retrievalMode;

	const toolContext: ToolExecutionContext = body.conversational
		? { retrievalMode, ragTopK: profile?.ragTopK ?? DEFAULT_ASSISTANT_CONFIG.ragTopK }
		: { retrievalMode, ragTopK: body.rag_top_k, documentIds: body.document_ids };

	const autoSearchEnabled =
		!body.conversational && body.search_enabled !== false && !toolNames.includes('search');

	const abortController = new AbortController();
	const options: ProviderChatOptions = {
		temperature: body.temperature,
		topK: body.top_k,
		maxTokens: body.max_tokens,
		reasoningBudget:
			typeof body.reasoning_budget === 'number'
				? Math.max(-1, Math.floor(body.reasoning_budget))
				: undefined,
		gpuMode: profile?.gpuMode ?? 'auto',
		signal: abortController.signal
	};

	const createdAt = new Date();
	let partialContent = '';
	let finished = false;
	let persistence: Promise<boolean> | undefined;
	// Runs at most once: either when the answer completes or, if the client
	// disconnects first, with whatever text had streamed by then.
	const persistTurn = (assistantContent: string, metadata: unknown) =>
		(persistence ??= SessionsRepository.appendTurn({
			sessionId: params.id,
			userMessage: message,
			assistantContent,
			metadata,
			createdAt
		}).catch(() => {
			console.error('Failed to persist chat turn.');
			diagnosticEvents.chatPersistenceFailed();
			return false;
		}));

	const generate = async (emit: (event: ApiChatStreamEvent) => void): Promise<void> => {
		const started = Date.now();
		const send = (event: ApiChatStreamEvent) => {
			if (event.type === 'text') partialContent += event.delta;
			if (event.type === 'text-reset') partialContent = '';
			emit(event);
		};
		const onProgress = (progress: AgentProgressEvent) => {
			send({ type: 'agent', progress });
			if (
				progress.kind === 'tool' &&
				progress.status === 'completed' &&
				progress.name === 'goals'
			) {
				send({ type: 'goals', goals: readGoals(toolContext) });
			}
		};

		const autoSearch = autoSearchEnabled
			? await runAutoSearch(message, toolContext, onProgress)
			: null;
		const chat = { history, userMessage: message, toolNames };
		const messages = body.conversational
			? createNotebookMessages({ ...chat, context: await notebookContext(body) })
			: createDocumentMessages({
					...chat,
					context: autoSearch?.context ?? '',
					systemPrompt: await promptTemplateSystemPrompt(body.prompt_template_id),
					persona: body.persona,
					autoSearch: autoSearchEnabled
				});

		const result = await runAgent({
			provider,
			model: modelId,
			messages,
			chatOptions: options,
			toolNames,
			toolContext,
			maxToolTurns: body.agent_max_turns,
			onProgress,
			onText: (delta) => send({ type: 'text', delta }),
			onTextReset: () => send({ type: 'text-reset' })
		});
		abortController.signal.throwIfAborted();

		const trace = [...(autoSearch?.trace ?? []), ...result.trace];
		const outputs = [...(autoSearch?.outputs ?? []), ...result.outputs];
		const toolCalls = trace.filter((item) => item.kind === 'tool').length;
		const saved = await persistTurn(result.content, {
			agent: {
				providerId,
				modelId,
				modelTurns: result.modelTurns,
				toolTurns: result.toolTurns,
				trace
			},
			...(outputs.length ? { outputs } : {})
		});

		send({ type: 'complete', modelTurns: result.modelTurns, toolCalls, saved });
		diagnosticEvents.chatCompleted({
			durationMs: Date.now() - started,
			modelTurns: result.modelTurns,
			toolCalls,
			toolTurns: result.toolTurns
		});

		if (!shouldGenerateTitle || !saved || abortController.signal.aborted) return;
		try {
			const title = await generateChatTitle(message, provider, modelId, options);
			await SessionsRepository.rename(params.id, title);
			send({ type: 'title', title });
		} catch {
			console.error('Title generation error.');
			diagnosticEvents.chatTitleFailed();
		}
	};

	return ndjsonTaskResponse<ApiChatStreamEvent>(
		'Chat generation',
		async (emit) => {
			try {
				await generate(emit);
			} catch (error) {
				if (abortController.signal.aborted) return;
				diagnosticEvents.chatGenerationFailed();
				throw error;
			} finally {
				finished = true;
			}
		},
		(error) => ({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
		() => {
			if (!finished) diagnosticEvents.chatCancelled();
			abortController.abort();
			void persistTurn(partialContent, null);
		}
	);
};

async function resolveToolNames(
	body: ApiChatMessageRequest,
	provider: Provider,
	modelId: string,
	profile: AssistantProfile | null
): Promise<string[]> {
	if (body.tools_enabled === false || !(await provider.supportsTools(modelId))) return [];
	const enabled = toolRegistry.filterIds(body.enabled_tools ?? profile?.enabledTools);
	const names = toolRegistry
		.idsForMode(body.conversational ? 'notebook' : 'document')
		.filter((name) => enabled.includes(name));

	if (names.includes('python') && !names.includes('corpus_details')) names.push('corpus_details');
	return names;
}

async function notebookContext(body: ApiNotebookChatMessageRequest): Promise<string> {
	const sources = body.notebook_id ? await getNotebookSourceExcerpts(body.notebook_id) : '';
	return [body.context, sources].filter(Boolean).join('\n\n');
}

async function promptTemplateSystemPrompt(id: string | null): Promise<string> {
	const template = id
		? await db.select().from(promptTemplates).where(eq(promptTemplates.id, id)).get()
		: undefined;
	return template?.systemPrompt ?? DEFAULT_PROMPT_TEMPLATE.systemPrompt;
}
