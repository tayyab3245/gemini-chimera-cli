/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChimeraEventBus } from '../event-bus/bus.js';
import type { AgentType } from '../event-bus/types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';

/**
 * Agent execution context with all necessary dependencies
 */
export interface AgentContext<TInput = unknown> {
  input: TInput;
  bus: ChimeraEventBus;
  dependencies?: {
    toolRegistry?: ToolRegistry;
  };
}

/**
 * Agent execution result
 */
export interface AgentResult<TOutput = unknown> {
  ok: boolean;          // success flag
  output?: TOutput;     // present when ok === true
  error?: string;       // present when ok === false
}

/**
 * Base interface for all Chimera agents
 */
export interface ChimeraAgent<TInput = unknown, TOutput = unknown> {
  /** Agent type identifier */
  readonly type: AgentType;
  
  /** Agent display name */
  readonly name: string;
  
  /** Agent description */
  readonly description: string;
  
  /**
   * Execute the agent with given input and context
   */
  run(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
  
  /**
   * Validate input before execution (optional)
   */
  validateInput?(input: TInput): boolean;
  
  /**
   * Cleanup resources (optional)
   */
  cleanup?(): Promise<void>;
}

/**
 * Context data that agents receive
 */
export interface WorkflowContext {
  /** Original user request */
  userRequest: string;
  /** Workflow session ID */
  sessionId: string;
  /** Current workflow state */
  state: Record<string, unknown>;
  /** Agent execution history */
  history: AgentExecutionRecord[];
  /** Tools available to agents */
  availableTools?: string[];
}

/**
 * Record of agent execution for history tracking
 */
export interface AgentExecutionRecord {
  agentType: AgentType;
  startTime: number;
  endTime?: number;
  input: unknown;
  result?: AgentResult;
  error?: string;
}
