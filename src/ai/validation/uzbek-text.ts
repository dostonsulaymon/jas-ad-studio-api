/**
 * Uzbek Latin writes o‘ and g‘ with U+02BB MODIFIER LETTER TURNED COMMA. Three
 * characters render almost identically and all three occur in practice: source 01 uses
 * U+2018, sellers type U+0027, and the standard is U+02BB. Normalising first means the
 * validator judges the text rather than the keyboard that produced it.
 */
export const UZBEK_APOSTROPHE = 'ʻ';

const APOSTROPHE_VARIANTS = /[‘’'´ʼ]/g;
const CYRILLIC = /\p{Script=Cyrillic}/u;

export function normalizeUzbek(text: string): string {
  return text.normalize('NFC').replace(APOSTROPHE_VARIANTS, UZBEK_APOSTROPHE);
}

export function hasCyrillic(text: string): boolean {
  return CYRILLIC.test(text);
}

/** Spans inside double quotes are exempt from English checks: source 01 §25 keeps
 * spoken Uzbek lines untranslated and quoted inside the English prompt. */
export function stripQuotedSpans(text: string): string {
  return text.replace(/"[^"]*"/g, ' ').replace(/“[^”]*”/g, ' ');
}

const ENGLISH_FUNCTION_WORDS = new Set([
  'the', 'and', 'of', 'with', 'a', 'to', 'in', 'on', 'as', 'that',
  'is', 'it', 'for', 'at', 'by', 'from', 'this', 'its', 'into', 'over',
]);

/**
 * Function-word share, which is a stable signature of English prose at the length these
 * prompts run to. It is reported as a ratio rather than a verdict: the caller decides
 * whether a low score is worth a warning, and nothing here ever triggers a paid repair
 * on its own (source 01 §28 says language checks apply "where practical").
 */
export function englishFunctionWordRatio(text: string): number {
  const words = stripQuotedSpans(text)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) return 0;

  const hits = words.filter((word) => ENGLISH_FUNCTION_WORDS.has(word)).length;

  return hits / words.length;
}
