import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { ApiChatMessageRequest, ApiChatStreamEvent } from '$lib/types';
import { db } from '$lib/server/database/database';
import { promptTemplates, type SessionMessage, sessions } from '$lib/server/database/schema';
import { seedLocalUser } from '$lib/server/database/seed';
import { getProvider } from '$lib/server/providers/registry';
import type { ProviderChatOptions } from '$lib/server/providers/provider';
import { runAgent } from '$lib/server/agent/runner';
import type { RagRetrievalMode } from '$lib/server/rag/search/retrieve-rag-context';
import { toolRegistry } from '$lib/server/tools';
import type { ToolExecutionContext } from '$lib/server/tools/types';
import { DEFAULT_ASSISTANT_CONFIG } from '$lib/constants';
import { RetrievalMode } from '$lib/enums';
import { ProfilesRepository, SessionsRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';
import { runAutoSearch } from '$lib/server/chat/auto-search';
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
	const supportedRetrievalModes: readonly RagRetrievalMode[] = [
		RetrievalMode.SEMANTIC,
		RetrievalMode.BM25,
		RetrievalMode.HYBRID,
		RetrievalMode.KNOWLEDGE_GRAPH
	];
	const storedRetrievalMode = profile?.retrievalMode as RagRetrievalMode | undefined;
	const retrievalMode: RagRetrievalMode =
		storedRetrievalMode && supportedRetrievalModes.includes(storedRetrievalMode)
			? storedRetrievalMode
			: DEFAULT_ASSISTANT_CONFIG.retrievalMode;

	const abortController = new AbortController();
	const options: ProviderChatOptions = {
		temperature: body.temperature,
		topK: body.top_k,
		maxTokens: body.max_tokens,
		reasoningBudget:
			typeof body.reasoning_budget === 'number'
				? Math.max(-1, Math.floor(body.reasoning_budget))
				: undefined,
		signal: abortController.signal
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

	const modeTools = toolRegistry.idsForMode(body.conversational ? 'notebook' : 'document');
	const enabledTools = toolRegistry.filterIds(body.enabled_tools ?? profile?.enabledTools);
	const toolNames =
		body.tools_enabled !== false ? modeTools.filter((name) => enabledTools.includes(name)) : [];
	const toolsEnabled = toolNames.length > 0;
	const searchToolEnabled = toolNames.includes('search');
	const toolInstructions = toolRegistry.instructions(toolNames);
	const ragTopK = body.conversational
		? (profile?.ragTopK ?? DEFAULT_ASSISTANT_CONFIG.ragTopK)
		: body.rag_top_k;
	const documentIds = body.conversational ? undefined : body.document_ids;
	const toolContext: ToolExecutionContext = { documentIds, retrievalMode, ragTopK };
	// Document chat without the search tool still has to reach the corpus, so
	// the search runs automatically for every prompt.
	const autoSearchEnabled = !body.conversational && !searchToolEnabled;

	const timestamp = new Date();

	let closed = false;

	const persistTurn = (assistantContent: string, metadata: unknown) =>
		SessionsRepository.appendTurn({
			sessionId: params.id,
			userMessage: message,
			assistantContent,
			metadata,
			createdAt: timestamp
		});

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const send = (event: ApiChatStreamEvent) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				} catch {
					// The client is gone; stop emitting and let the abort below
					// wind down the generation.
					closed = true;
					abortController.abort();
				}
			};

			try {
				const autoSearch = autoSearchEnabled
					? await runAutoSearch({
							query: message,
							toolContext,
							onProgress(progress) {
								send({ type: 'agent', progress });
							}
						})
					: null;

				const chatMessages = body.conversational
					? createConversationalMessages({
							messages,
							userMessage: message,
							context,
							toolsEnabled,
							toolInstructions
						})
					: createDocumentMessages({
							messages,
							userMessage: message,
							systemPrompt: promptTemplate?.systemPrompt || '',
							persona,
							context: autoSearch?.context ?? '',
							toolsEnabled,
							toolInstructions,
							searchToolEnabled
						});

				const agentResult = await runAgent({
					provider,
					model: modelId,
					messages: chatMessages,
					chatOptions: options,
					registry: toolRegistry,
					toolNames,
					maxToolTurns: toolsEnabled ? body.agent_max_turns : 0,
					toolContext,
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

				const trace = [...(autoSearch?.trace ?? []), ...agentResult.trace];
				const outputs = [...(autoSearch?.outputs ?? []), ...agentResult.outputs];
				const toolCallCount = agentResult.toolExecutions.length + (autoSearch ? 1 : 0);

				let saved = false;
				try {
					saved = await persistTurn(agentResult.content, {
						agent: {
							providerId,
							modelId,
							modelTurns: agentResult.modelTurns,
							toolTurns: agentResult.toolTurns,
							trace
						},
						...(outputs.length ? { outputs } : {})
					});
				} catch (error) {
					console.error('Failed to persist chat turn:', error);
				}

				// The turn is over for the user once the messages are persisted. Title
				// generation is a second model call, so `complete` has to go out
				// before it — otherwise the client holds the composer disabled for
				// the length of another generation with the answer already on screen.
				send({
					type: 'complete',
					modelTurns: agentResult.modelTurns,
					toolTurns: agentResult.toolTurns,
					toolCalls: toolCallCount,
					contextItems: outputs.length,
					saved
				});

				if (shouldGenerateTitle && saved) {
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
			} catch (error) {
				if (!abortController.signal.aborted) {
					console.error('Streaming error:', error);
					const message = error instanceof Error ? error.message : String(error);
					send({ type: 'error', message });
				}
			} finally {
				if (!closed) {
					closed = true;
					try {
						controller.close();
					} catch {
						// The stream was cancelled between the last send and here.
					}
				}
			}
		},
		cancel() {
			// The client disconnected. Abort the generation so it stops consuming
			// the model runtime instead of blocking every following request.
			closed = true;
			abortController.abort();
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
