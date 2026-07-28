import type { Source } from "../parse-shared";
import type { TextExtractionResult } from "../text-extract";
import { TxtExtract } from "./txt-extract";

// Markdown's paragraphs/line numbers work exactly like TXT's, so this reuses TxtExtract
// as-is. Markdown syntax is left in the text rather than stripped - it's still useful
// signal for search, and stripping it would need a real markdown parser.
export async function MdExtract(file: Source): Promise<TextExtractionResult> {
  return TxtExtract(file);
}
