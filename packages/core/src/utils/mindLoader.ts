/**
 * Dynamic loader for mind prompts to decouple public code from private assets
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Dynamically loads a prompt file from the mind directory
 * @param promptPath Relative path to the prompt file
 * @returns The prompt content or null if file not found
 */
export async function loadPrompt(promptPath: string): Promise<string | null> {
  try {
    const fullPath = path.resolve(process.cwd(), promptPath);
    const content = await fs.readFile(fullPath, 'utf-8');
    
    // Extract the exported prompt constant from the TypeScript file
    // Support multiple prompt constant patterns
    const patterns = [
      /export const KERNEL_CONSULT_PROMPT = `([^`]+)`/s,
      /export const SYNTH_PLANNING_PROMPT = `([^`]+)`/s,
      /export const (\w+_PROMPT) = `([^`]+)`/s
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        // For generic pattern, return the second capture group (the prompt content)
        return pattern.source.includes('\\w+') ? match[2] : match[1];
      }
    }
    
    // Fallback: try to find any multi-line string
    const fallbackMatch = content.match(/`([^`]+)`/s);
    if (fallbackMatch && fallbackMatch[1]) {
      return fallbackMatch[1];
    }
    
    return null;
  } catch (error) {
    // File not found or other error - return null for graceful fallback
    return null;
  }
}
