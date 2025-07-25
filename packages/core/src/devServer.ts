/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChimeraEventBus } from './event-bus/bus.js';
import { WorkflowEngine } from './coordination/workflowEngine.js';
import { startEventBusGateway } from './event-bus/wsGateway.js';
import { Config, ApprovalMode } from './config/config.js';
import type { GeminiChat } from './core/geminiChat.js';
import { DEFAULT_GEMINI_MODEL } from './config/models.js';
import { sessionId } from './utils/session.js';

/**
 * Intelligent mock GeminiChat for development server.
 * Returns adaptive responses based on input complexity.
 */
class DevMockGeminiChat {
  async sendMessage(params: any, requestId?: string): Promise<any> {
    // Simulate a small delay to mimic real API call
    await new Promise(resolve => setTimeout(resolve, 100));

    // Extract the actual user input from the prompt
    const prompt = params.message || '';
    const userRequestMatch = prompt.match(/User request: "([^"]+)"/);
    const userInput = userRequestMatch ? userRequestMatch[1] : prompt;
    
    // Tokenize input (simple word split)
    const tokens = userInput.trim().split(/\s+/).filter((token: string) => token.length > 0);
    const tokenCount = tokens.length;
    
    let responseText: string;
    
    if (tokenCount < 6) {
      // Short input → Ask for clarification
      responseText = 'Could you clarify?';
      console.log(`MockGeminiChat called with: "${userInput.substring(0, 50)}" ⇒ "${responseText}"`);
    } else {
      // Longer input → Rewrite first ≤ 50 chars
      const truncated = userInput.length > 50 ? userInput.substring(0, 50) : userInput;
      responseText = `Rewritten: ${truncated}`;
      console.log(`MockGeminiChat called with: "${userInput.substring(0, 50)}" ⇒ "${responseText}"`);
    }

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

/**
 * Development server for Core package that starts the WorkflowEngine and wsGateway
 * for manual testing of the UI-to-Kernel handshake functionality.
 */
async function startDevServer() {
  console.log('🚀 Starting Core dev server...');
  
  try {
    // Create minimal config for dev server
    const config = new Config({
      sessionId: sessionId,
      targetDir: process.cwd(),
      debugMode: true,
      fullContext: false,
      model: DEFAULT_GEMINI_MODEL,
      approvalMode: ApprovalMode.DEFAULT,
      showMemoryUsage: false,
      cwd: process.cwd(),
      telemetry: { enabled: false },
      usageStatisticsEnabled: false,
    });

    // Initialize config
    await config.initialize();

    // Use mock GeminiChat for development to avoid authentication requirements
    console.log('Data collection is disabled.');
    const geminiChat = new DevMockGeminiChat() as unknown as GeminiChat;

    // Create event bus
    const bus = new ChimeraEventBus();

    // Create WorkflowEngine
    const workflowEngine = new WorkflowEngine(bus, geminiChat);

    // Start WebSocket gateway on port 4000
    const wss = startEventBusGateway(bus, 4000);

    // Log successful startup
    console.log('✅ Core dev server listening on ws://localhost:4000');
    console.log('📡 WebSocket gateway ready for Dashboard connections');
    console.log('🧠 WorkflowEngine ready to process chat messages');
    console.log('');
    console.log('💡 To test the UI-to-Kernel handshake:');
    console.log('   1. Start the Dashboard: cd packages/dashboard && npm run dev');
    console.log('   2. Open http://localhost:5173');
    console.log('   3. Type "hello" in the chat panel');
    console.log('   4. Expect "ACK" response within 2 seconds');
    console.log('');
    console.log('Press Ctrl+C to stop the server');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down Core dev server...');
      wss.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start Core dev server:', error);
    process.exit(1);
  }
}

// Start the dev server
startDevServer().catch((error) => {
  console.error('❌ Unhandled error in dev server:', error);
  process.exit(1);
});
