export function stripMarkdown(str: string): string {
  return str.replace(/```[^]*?```/g, '')   // remove fenced blocks
            .replace(/`[^`]*`/g, '')       // remove inline code
            .trim();
}
