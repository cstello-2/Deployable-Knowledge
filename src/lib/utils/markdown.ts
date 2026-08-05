import { browser } from '$app/environment';
import MarkdownIt from 'markdown-it';
import markdownItMark from 'markdown-it-mark';
import DOMPurify from 'dompurify';

const md = new MarkdownIt({
	// Raw HTML (<span style="color:...">, <mark>, <u>, etc.) needs this on to render at
	// all - markdown-it escapes it otherwise. Safe here because DOMPurify.sanitize below
	// is the actual security boundary, not this flag; markdown-it's own docs recommend
	// exactly this combination over leaving html off.
	html: true,
	linkify: true
}).use(markdownItMark);

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
	tokens[idx].attrSet('target', '_blank');
	tokens[idx].attrSet('rel', 'noopener noreferrer');
	return self.renderToken(tokens, idx, options);
};

// Tag each top-level block with the source line it starts at, so callers
// (the notebook's edit/preview scroll sync) can map a position in the
// rendered output back to a position in the raw text, and vice versa.
md.core.ruler.push('anchor_source_lines', (state) => {
	for (const token of state.tokens) {
		if (token.block && token.nesting !== -1 && token.map) {
			token.attrSet('data-line', String(token.map[0]));
		}
	}
});

export function renderMarkdown(text = ''): string {
	const html = md.render(text.trim());
	if (!browser) return html;
	return DOMPurify.sanitize(html);
}
