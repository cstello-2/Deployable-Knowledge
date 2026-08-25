import { BotGuardClient, getChallenge } from 'bgutils-js/botguard';
import { WebPoMinter } from 'bgutils-js/webpo';
import { buildURL, getHeaders } from 'bgutils-js/utils';
import { JSDOM } from 'jsdom';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
const ATTESTATION_TIMEOUT_MS = 30_000;
const TTL_SAFETY_MARGIN_MS = 60_000;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export class YoutubeAttestationError extends Error {
	constructor(cause: unknown) {
		super(
			'YouTube changed its caption protection, so transcripts cannot be imported right now. ' +
				'Updating the app may restore this.'
		);
		this.name = 'YoutubeAttestationError';
		this.cause = cause;
	}
}

type CachedMinter = {
	minter: WebPoMinter;
	expiresAt: number;
};

let cached: Promise<CachedMinter> | undefined;

function installBrowserGlobals(): void {
	if (Reflect.has(globalThis, 'window')) return;

	const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
		url: 'https://www.youtube.com/',
		referrer: 'https://www.youtube.com/',
		pretendToBeVisual: true
	});

	Object.defineProperties(globalThis, {
		window: { value: dom.window, configurable: true },
		document: { value: dom.window.document, configurable: true },
		location: { value: dom.window.location, configurable: true },
		origin: { value: dom.window.origin, configurable: true },
		self: { value: dom.window, configurable: true }
	});
}

async function requestIntegrityToken(botguardResponse: string): Promise<string> {
	const response = await fetch(buildURL('GenerateIT', true), {
		method: 'POST',
		headers: getHeaders(),
		body: JSON.stringify([REQUEST_KEY, botguardResponse]),
		signal: AbortSignal.timeout(ATTESTATION_TIMEOUT_MS)
	});

	if (!response.ok) {
		throw new Error(
			`Integrity token request failed (${response.status}): ${await response.text()}`
		);
	}

	const payload = (await response.json()) as unknown;
	const token = Array.isArray(payload) ? payload[0] : null;
	if (typeof token !== 'string' || !token) {
		throw new Error('Integrity token response did not contain a token.');
	}

	return token;
}

async function createMinter(): Promise<CachedMinter> {
	installBrowserGlobals();

	const challenge = await getChallenge({
		requestKey: REQUEST_KEY,
		fetchFunction: fetch,
		useYouTubeAPI: true
	});

	const interpreter =
		challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
	if (!interpreter) throw new Error('Attestation challenge did not include an interpreter.');

	new Function(interpreter)();

	const client = await BotGuardClient.create({
		program: challenge.program,
		globalName: challenge.globalName,
		globalObject: globalThis
	});

	const webPoSignalOutput: Parameters<typeof WebPoMinter.create>[1] = [];
	const botguardResponse = await client.snapshot({ webPoSignalOutput });
	const integrityToken = await requestIntegrityToken(botguardResponse);
	const minter = await WebPoMinter.create({ integrityToken }, webPoSignalOutput);

	return { minter, expiresAt: Date.now() + DEFAULT_TTL_MS - TTL_SAFETY_MARGIN_MS };
}

async function activeMinter(): Promise<WebPoMinter> {
	const pending = cached;
	if (pending) {
		const existing = await pending.catch(() => null);
		if (existing && existing.expiresAt > Date.now()) return existing.minter;
	}

	cached = createMinter();

	try {
		return (await cached).minter;
	} catch (error) {
		cached = undefined;
		throw new YoutubeAttestationError(error);
	}
}

export async function mintVideoPoToken(videoId: string): Promise<string> {
	const minter = await activeMinter();

	try {
		return await minter.mintAsWebsafeString(videoId);
	} catch (error) {
		cached = undefined;
		throw new YoutubeAttestationError(error);
	}
}
