/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock GeminiChat for development server use only.
 * Returns a fixed "ACK" response to enable offline testing.
 * 
 * This class implements only the essential sendMessage method
 * needed by KernelAgent for ACK handshake functionality.
 */
export class MockGeminiChat {
  async sendMessage(params: any, requestId?: string): Promise<any> {
    // Simulate a small delay to mimic real API call
    await new Promise(resolve => setTimeout(resolve, 100));

    // Return a properly structured GenerateContentResponse with "ACK"
    return {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'ACK'
              }
            ],
            role: 'model'
          },
          finishReason: 'STOP',
          index: 0
        }
      ],
      usageMetadata: {
        promptTokenCount: 5,
        candidatesTokenCount: 1,
        totalTokenCount: 6
      }
    };
  }
}
