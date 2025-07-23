/**
 * Context filtering utilities for Chimera agents
 */

/**
 * Remove markdown formatting and keep only plain text sentences
 * Strips headings, code fences, blockquotes, tables, etc.
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  
  return text
    // Remove code blocks (```...```)
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code (`...`)
    .replace(/`[^`]*`/g, '')
    // Remove headings (# ## ### etc.)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove blockquotes (> ...)
    .replace(/^>\s*/gm, '')
    // Remove horizontal rules (--- or ***)
    .replace(/^[-*]{3,}$/gm, '')
    // Remove table separators (|---|---|)
    .replace(/^\|?[-\s:|]+\|?$/gm, '')
    // Remove table rows starting with |
    .replace(/^\|.*\|$/gm, '')
    // Remove bold/italic markers (**text** or *text*)
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    // Remove strikethrough (~~text~~)
    .replace(/~~([^~]+)~~/g, '$1')
    // Remove links [text](url)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove extra whitespace and empty lines
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * Return shallow copy of object containing only the specified keys
 */
export function pickFields<T>(obj: T, keys: (keyof T)[]): Partial<T> {
  if (!obj || typeof obj !== 'object') return {};
  
  const result: Partial<T> = {};
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

// Inline unit tests
function runTests() {
  // Test stripMarkdown
  const markdownText = `# Heading
Some **bold** text and *italic* text.
\`inline code\` here.

\`\`\`
code block
\`\`\`

> blockquote text

| col1 | col2 |
|------|------|
| data | more |

Regular sentence.`;

  const stripped = stripMarkdown(markdownText);
  const expected = 'Some bold text and italic text.\n\nRegular sentence.';
  
  if (!stripped.includes('bold text and italic text')) {
    throw new Error(`stripMarkdown failed: expected bold/italic text, got "${stripped}"`);
  }
  if (stripped.includes('#') || stripped.includes('`') || stripped.includes('|')) {
    throw new Error(`stripMarkdown failed: still contains markdown, got "${stripped}"`);
  }

  // Test pickFields
  const testObj = { a: 1, b: 2, c: 3, d: 4 };
  const picked = pickFields(testObj, ['a', 'c']);
  
  if (Object.keys(picked).length !== 2) {
    throw new Error(`pickFields failed: expected 2 keys, got ${Object.keys(picked).length}`);
  }
  if (picked.a !== 1 || picked.c !== 3) {
    throw new Error(`pickFields failed: expected {a:1,c:3}, got ${JSON.stringify(picked)}`);
  }
  if ('b' in picked || 'd' in picked) {
    throw new Error(`pickFields failed: should not contain b or d, got ${JSON.stringify(picked)}`);
  }

  // Test edge cases
  if (stripMarkdown('') !== '') {
    throw new Error('stripMarkdown failed on empty string');
  }
  if (Object.keys(pickFields({} as Record<string, any>, ['a'])).length !== 0) {
    throw new Error('pickFields failed on empty object');
  }
  if (Object.keys(pickFields(null as any, ['a'])).length !== 0) {
    throw new Error('pickFields failed on null');
  }

  console.log('✓ All filter utility tests passed');
}

// Run tests when module is imported
runTests();
