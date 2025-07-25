/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChimeraEventBus } from './event-bus/bus.js';
import { WorkflowEngine } from './coordination/workflowEngine.js';
import { startEventBusGateway } from './event-bus/wsGateway.js';
import { Config, ApprovalMode } from './config/config.js';
import { GeminiChat } from './core/geminiChat.js';
import { createContentGenerator, AuthType } from './core/contentGenerator.js';
import { DEFAULT_GEMINI_MODEL } from './config/models.js';
import { sessionId } from './utils/session.js';

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

    // Create content generator (try different auth methods)
    let contentGenerator;
    try {
      // Try with Gemini API key first
      contentGenerator = await createContentGenerator({
        model: DEFAULT_GEMINI_MODEL,
        authType: AuthType.USE_GEMINI,
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      }, config, config.getSessionId());
    } catch (error) {
      console.warn('⚠️  Failed to initialize with API key, trying with Google auth...');
      // Fallback to Google auth
      contentGenerator = await createContentGenerator({
        model: DEFAULT_GEMINI_MODEL,
        authType: AuthType.LOGIN_WITH_GOOGLE,
      }, config, config.getSessionId());
    }

    // Create GeminiChat instance
    const geminiChat = new GeminiChat(config, contentGenerator);

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
