import { browser } from "$app/environment";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const md = new MarkdownIt({
  html: false,
  linkify: true,
});

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener noreferrer");
  return self.renderToken(tokens, idx, options);
};

export function renderMarkdown(text = ""): string {
  const html = md.render(text.trim());
  if (!browser) return html;
  return DOMPurify.sanitize(html);
}
