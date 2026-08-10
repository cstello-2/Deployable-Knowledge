import { browser } from '$app/environment';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

function createEngine(html: boolean): MarkdownIt {
	const engine = new MarkdownIt({ html, linkify: true });
	engine.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
		tokens[idx].attrSet('target', '_blank');
		tokens[idx].attrSet('rel', 'noopener noreferrer');
		return self.renderToken(tokens, idx, options);
	};
	return engine;
}

const md = createEngine(false);
// Inline HTML passthrough for user-authored content (notebooks); the rendered
// output is always DOMPurify-sanitized, so only harmless markup like
// <span style="color:…"> survives.
const mdWithHtml = createEngine(true);

export interface RenderMarkdownOptions {
	allowHtml?: boolean;
}

export function renderMarkdown(text = '', options: RenderMarkdownOptions = {}): string {
	// Raw HTML is only ever rendered where DOMPurify can sanitize it (browser)
	const allowHtml = options.allowHtml === true && browser;
	const html = (allowHtml ? mdWithHtml : md).render(text.trim());
	if (!browser) return html;
	return DOMPurify.sanitize(html);
}
