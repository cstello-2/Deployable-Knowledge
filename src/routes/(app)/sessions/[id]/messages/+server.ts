import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { ApiChatMessageRequest, ApiChatStreamEvent } from '$lib/types';
import { db } from '$lib/server/database/database';
import {
	promptTemplates,
	type SessionMessage,
	sessions,
	sessionMessages
} from '$lib/server/database/schema';
import { seedLocalUser } from '$lib/server/database/seed';
import { getProvider } from '$lib/server/providers/registry';
import type { ProviderChatOptions } from '$lib/server/providers/provider';
import { runAgent } from '$lib/server/agent/runner';
import type { RagRetrievalMode } from '$lib/server/rag/search/retrieve-rag-context';
import { toolRegistry } from '$lib/server/tools';
import { DEFAULT_ASSISTANT_CONFIG } from '$lib/constants';
import { RetrievalMode } from '$lib/enums';
import { ProfilesRepository, SessionsRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';
import {
	createConversationalMessages,
	createDocumentMessages
} from '$lib/server/chat/build-chat-messages';
import { generateChatTitle } from '$lib/server/chat/generate-chat-title';
import { getNotebookSourceExcerpts } from '$lib/server/chat/notebook-context';
import { LOCAL_USER_ID } from '$lib/server/database/constants';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json()) as ApiChatMessageRequest;

	if (!body.message.trim() || !body.model_id.trim() || !body.provider_id.trim()) {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const user = await seedLocalUser();

	const profile = await ProfilesRepository.getActive(user);

	const message = body.message.trim();
	const modelId = body.model_id.trim();
	const providerId = body.provider_id.trim();
	const storedRetrievalMode = profile?.retrievalMode;
	const retrievalMode: RagRetrievalMode =
		storedRetrievalMode === RetrievalMode.SEMANTIC
			? RetrievalMode.SEMANTIC
			: storedRetrievalMode === RetrievalMode.BM25
				? RetrievalMode.BM25
				: storedRetrievalMode === RetrievalMode.HYBRID
					? RetrievalMode.HYBRID
					: DEFAULT_ASSISTANT_CONFIG.retrievalMode;

	const options: ProviderChatOptions = {
		temperature: body.temperature,
		topK: body.top_k,
		maxTokens: body.max_tokens,
		reasoningBudget:
			typeof body.reasoning_budget === 'number'
				? Math.max(-1, Math.floor(body.reasoning_budget))
				: undefined
	};

	const existing = await SessionsRepository.find(params.id);

	if (!existing) {
		const timestamp = new Date();
		await db.insert(sessions).values({
			id: params.id,
			userId: LOCAL_USER_ID,
			title: 'New Conversation',
			createdAt: timestamp,
			updatedAt: timestamp
		});
	}

	const messages: SessionMessage[] = await SessionsRepository.listMessages(params.id);
	const shouldGenerateTitle =
		messages.length === 0 &&
		(!existing || existing.title.trim().toLowerCase() === 'new conversation');

	const provider = getProvider(providerId);
	const promptTemplateId = body.conversational ? null : body.prompt_template_id;
	const promptTemplate = promptTemplateId
		? await db
				.select()
				.from(promptTemplates)
				.where(and(eq(promptTemplates.id, promptTemplateId), eq(promptTemplates.userId, user.id)))
				.get()
		: null;
	const persona = body.conversational ? '' : body.persona;
	const pageContext = body.conversational ? body.context : '';
	const notebookId = body.conversational ? body.notebook_id : null;

	// Notebook-mode context = the visible page text + the notebook's attached
	// sources (hidden from the notebook page, invisible to the user, but the
	// model sees the full excerpts).
	const sourceExcerpts =
		body.conversational && notebookId ? await getNotebookSourceExcerpts(notebookId) : '';

	const context = [pageContext, sourceExcerpts].filter(Boolean).join('\n\n');

	const chatMessages = body.conversational
		? createConversationalMessages(messages, message, context)
		: createDocumentMessages(messages, message, promptTemplate?.systemPrompt || '', persona);
	const toolsEnabled = body.tools_enabled !== false;
	const toolNames = toolsEnabled
		? body.conversational
			? ['get_datetime', 'python']
			: ['get_datetime', 'search', 'python']
		: [];
	const ragTopK = body.conversational
		? (profile?.ragTopK ?? DEFAULT_ASSISTANT_CONFIG.ragTopK)
		: body.rag_top_k;
	const documentIds = body.conversational ? undefined : body.document_ids;

	const timestamp = new Date();

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const send = (event: ApiChatStreamEvent) => {
				if (closed) return;
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			};

			try {
				const agentResult = await runAgent({
					provider,
					model: modelId,
					messages: chatMessages,
					chatOptions: options,
					registry: toolRegistry,
					toolNames,
					maxToolTurns: toolsEnabled ? body.agent_max_turns : 0,
					toolContext: {
						documentIds,
						retrievalMode,
						ragTopK
					},
					onProgress(progress) {
						send({ type: 'agent', progress });
					},
					onText(chunk) {
						send({ type: 'text', delta: chunk });
					},
					onTextReset() {
						send({ type: 'text-reset' });
					}
				});

				await db.insert(sessionMessages).values([
					{
						sessionId: params.id,
						role: 'user',
						content: message,
						metadata: null,
						createdAt: timestamp
					},
					{
						sessionId: params.id,
						role: 'assistant',
						content: agentResult.content,
						metadata: {
							agent: {
								providerId,
								modelId,
								modelTurns: agentResult.modelTurns,
								toolTurns: agentResult.toolTurns,
								trace: agentResult.trace
							},
							...(agentResult.outputs.length ? { outputs: agentResult.outputs } : {})
						},
						createdAt: timestamp
					}
				]);

				if (shouldGenerateTitle) {
					try {
						const title = await generateChatTitle(message, provider, modelId, options);
						await db
							.update(sessions)
							.set({ title, updatedAt: new Date() })
							.where(eq(sessions.id, params.id));
						send({ type: 'title', title });
					} catch (error) {
						console.error('Title generation error:', error);
					}
				}

				send({
					type: 'complete',
					modelTurns: agentResult.modelTurns,
					toolTurns: agentResult.toolTurns,
					toolCalls: agentResult.toolExecutions.length,
					contextItems: agentResult.outputs.length
				});
				controller.close();
				closed = true;
			} catch (error) {
				console.error('Streaming error:', error);
				const message = error instanceof Error ? error.message : String(error);
				send({ type: 'error', message });
			} finally {
				if (!closed) controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
