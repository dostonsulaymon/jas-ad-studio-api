export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Our own estimate, not the target generator's tokenizer, which is not published for
 * Veo. The ratio comes from the target config and is measured in Part 8a.
 */
export function estimateTokens(text: string, tokensPerWord: number): number {
  return Math.ceil(countWords(text) * tokensPerWord);
}
