/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock GeminiChat for development server use only.
 * Implements consultative behavior to mirror KernelAgent's logic for manual testing.
 * 
 * This class implements only the essential sendMessage method
 * needed by KernelAgent for adaptive rewrite/follow-up functionality.
 */
export class MockGeminiChat {
  async sendMessage(params: any, requestId?: string): Promise<any> {
    // Simulate a small delay to mimic real API call
    await new Promise(resolve => setTimeout(resolve, 100));

    // Extract user input from the prompt
    const prompt = params.message || '';
    const userRequestMatch = prompt.match(/User request: "([^"]+)"/);
    const userInput = userRequestMatch ? userRequestMatch[1] : '';
    
    // Determine response based on input length and content (mirrors KernelAgent logic)
    let responseText: string;
    
    if (userInput) {
      // Tokenize input (simple word split)
      const tokens = userInput.trim().split(/\s+/).filter((token: string) => token.length > 0);
      const tokenCount = tokens.length;
      
      // Check for vague phrases (but be careful about false positives)
      const vaguePatterns = [
        'help me', 'do something', 'make it', 'fix this', 'fix it',
        'help with', 'work on', 'deal with', 'take care',
        'make better', 'improve', 'optimize', 'enhance', 'update',
        'something', 'anything', 'stuff', 'things', 'whatever',
        'make my', 'make app better', 'better'
      ];
      
      // More nuanced vague phrase detection
      const lowercaseInput = userInput.toLowerCase();
      const hasVaguePhrase = vaguePatterns.some(pattern => {
        if (pattern === 'handle') {
          // "handle" is only vague when standalone, not in "handles authentication"
          return /\bhandle\b(?!\s+(authentication|user|data|error|request))/.test(lowercaseInput);
        }
        return lowercaseInput.includes(pattern);
      });
      
      if (tokenCount < 6 || hasVaguePhrase) {
        // Vague input → Follow-up question
        responseText = 'Could you clarify?';
        console.log(`📝 MockGeminiChat: Vague input (${tokenCount} tokens, vague=${hasVaguePhrase}) → Follow-up`);
      } else {
        // Detailed input → Rewrite
        const truncated = userInput.length > 50 ? userInput.substring(0, 47) + '...' : userInput;
        responseText = `Rewritten: ${truncated}`;
        console.log(`📝 MockGeminiChat: Detailed input (${tokenCount} tokens) → Rewrite`);
      }
    } else {
      // Fallback for malformed prompts
      responseText = 'ACK';
      console.log('📝 MockGeminiChat: No user input detected → Fallback ACK');
    }

    console.log(`📝 MockGeminiChat: "${userInput}" → "${responseText}"`);

    // Return a properly structured GenerateContentResponse
    return {
      candidates: [
        {
          content: {
            parts: [
              {
                text: responseText
              }
            ],
            role: 'model'
          },
          finishReason: 'STOP',
          index: 0
        }
      ],
      usageMetadata: {
        promptTokenCount: Math.max(userInput.length / 4, 5),
        candidatesTokenCount: Math.max(responseText.length / 4, 1),
        totalTokenCount: Math.max((userInput.length + responseText.length) / 4, 6)
      }
    };
  }
}
