import type { SessionMessage } from "$lib/server/database/schema";

const CONVERSATIONAL_SYSTEM_PROMPT = `You are a helpful assistant that answers questions and completes tasks for the user.

The user may load reference material. Treat it as background knowledge — facts to draw on — not as a ready-made answer. Never copy, reprint, or restate the reference material or your earlier answers back to the user.
- If the user asks a question, answer it in your own words, adding explanation and detail beyond what the material literally says.
- If the user asks you to write, draft, summarize, or analyze something, do the task fully and originally.
- If the user asks you to expand, elaborate, explain further, or "go deeper" on a point, provide NEW detail, examples, and reasoning about that specific point. Do not repeat the point itself or reprint sentences already shown — assume the user has already read them and wants more.

If you notice you are about to repeat text that already appears above, stop and instead explain it, give an example, or add specifics. Always give a direct, helpful answer, and respond only to the user's most recent message.`;

export function createConversationalPrompt(
  messages: SessionMessage[],
  userMessage: string,
  context = "",
): string {
  const lines = [`system: ${CONVERSATIONAL_SYSTEM_PROMPT}`];

  for (const message of messages.slice(-20)) {
    lines.push(`${message.role}: ${message.content}`);
  }

  if (context) {
    lines.push(
      `Reference material (background knowledge — do not reprint it):\n\n${context}`,
    );
    lines.push(
      `user: Use the reference material above as background knowledge. Then respond to the request below in your own words:\n` +
        `- Answer or complete the request, adding explanation, detail, and reasoning that go beyond what the material literally says.\n` +
        `- If the request asks you to expand, elaborate, or "go deeper" on a point, give NEW information, examples, and specifics about it — do not restate the point or repeat sentences already shown above.\n` +
        `- Never copy or reprint the material or earlier answers. If you catch yourself repeating the source, stop and instead explain it, give an example, or add detail.\n\n` +
        `Request: ${userMessage}`,
    );
  } else {
    lines.push(`user: ${userMessage}`);
  }

  lines.push("assistant:");
  return lines.join("\n\n");
}
