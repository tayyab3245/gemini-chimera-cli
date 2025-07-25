/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ClearcutLogger } from './clearcut-logger.js';
import { StartSessionEvent } from '../types.js';
import { Config } from '../../config/config.js';

describe('ClearcutLogger regression tests', () => {
  it('should handle null/undefined boolean fields in StartSessionEvent', () => {
    // Mock config that returns undefined for telemetry fields
    const mockConfig = {
      getUsageStatisticsEnabled: () => true,
      getSessionId: () => 'test-session',
      getModel: () => 'test-model',
      getEmbeddingModel: () => 'test-embedding',
      getSandbox: () => undefined,
      getCoreTools: () => [],
      getApprovalMode: () => 'auto',
      getDebugMode: () => undefined,
      getMcpServers: () => null,
      getTelemetryEnabled: () => undefined,
      getTelemetryLogPromptsEnabled: () => undefined,
      getFileFilteringRespectGitIgnore: () => undefined,
      getContentGeneratorConfig: () => null,
    } as unknown as Config;

    const event = new StartSessionEvent(mockConfig);
    const logger = ClearcutLogger.getInstance(mockConfig);

    expect(() => {
      logger?.logStartSessionEvent(event);
    }).not.toThrow();

    // Verify boolean fields are properly handled
    expect(event.sandbox_enabled).toBe(false);
    expect(event.api_key_enabled).toBe(false);
    expect(event.vertex_ai_enabled).toBe(false);
    expect(event.debug_enabled).toBe(false);
    expect(event.telemetry_enabled).toBe(false);
    expect(event.telemetry_log_user_prompts_enabled).toBe(false);
  });

  it('should handle toString() calls on null/undefined fields', () => {
    const mockConfig = {
      getUsageStatisticsEnabled: () => true,
      getSessionId: () => null,
    } as unknown as Config;

    const logger = ClearcutLogger.getInstance(mockConfig);
    
    // Create an event with potentially undefined fields
    const event = {
      sandbox_enabled: undefined,
      api_key_enabled: null,
      vertex_ai_enabled: undefined,
      debug_enabled: null,
      telemetry_enabled: undefined,
      telemetry_log_user_prompts_enabled: null,
    } as any;

    expect(() => {
      logger?.logStartSessionEvent(event);
    }).not.toThrow();
  });

  it('should handle empty session ID gracefully', () => {
    const mockConfig = {
      getUsageStatisticsEnabled: () => true,
      getSessionId: () => undefined,
    } as unknown as Config;

    const logger = ClearcutLogger.getInstance(mockConfig);
    const event = {} as any;

    expect(() => {
      logger?.logStartSessionEvent(event);
    }).not.toThrow();
  });

  it('should not create logger when telemetry is disabled', () => {
    const mockConfig = {
      getUsageStatisticsEnabled: () => false,
    } as unknown as Config;

    const logger = ClearcutLogger.getInstance(mockConfig);
    expect(logger).toBeUndefined();
  });
});