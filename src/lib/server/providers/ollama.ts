import { cachedCapability } from './capability-cache';
import { createChatCodec } from './chat-codec';
import { OpenAiCompatible } from './openai-compatible';
import { readObject } from '$lib/server/utils/values';

const OLLAMA_URL = 'http://localhost:11434';

export class Ollama extends OpenAiCompatible {
	protected override readonly chatCodec = createChatCodec({ reasoningField: 'reasoning' });

	constructor() {
		super({ id: 'ollama', name: 'Ollama', baseUrl: `${OLLAMA_URL}/v1`, apiKey: '' });
	}

	override supportsTools(model: string): Promise<boolean> {
		return cachedCapability(`ollama:${model}`, async () => {
			const resp = await fetch(`${OLLAMA_URL}/api/show`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model }),
				signal: AbortSignal.timeout(2500)
			});

			if (!resp.ok) return true;
			const data = readObject(await resp.json());

			if (!Array.isArray(data.capabilities)) return true;
			return data.capabilities.includes('tools');
		});
	}
}
