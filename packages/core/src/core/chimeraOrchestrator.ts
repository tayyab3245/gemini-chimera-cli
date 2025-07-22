/* eslint-disable max-lines */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
  SendMessageParameters,
  PartListUnion,
  FunctionCall,
} from '@google/genai';
import path from 'node:path';
import { promises as fsp } from 'node:fs';

import { GeminiChat } from './geminiChat.js';
import { Config } from '../config/config.js';
import { ContentGenerator } from './contentGenerator.js';

import { ChimeraPlan, CriticReview, PlanStep, PlanStatus } from '../interfaces/chimera.js';
import { ServerGeminiStreamEvent, Turn } from './turn.js';
import { ToolResult } from '../tools/tools.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { validateJson } from '../utils/jsonValidator.js';
import { getFunctionCalls } from '../utils/generateContentResponseUtilities.js';
import { chimeraLog } from '../utils/chimeraLogger.js';

// -----------------------------------------------------------------------------
// 🛠️  Tool‑call execution helper
// -----------------------------------------------------------------------------
interface ToolCallResult {
  name: string;
  success: boolean;
  result?: ToolResult;
  error?: string;
}

async function executeToolCalls(
  toolRegistry: ToolRegistry,
  calls: FunctionCall[] | undefined,
): Promise<ToolCallResult[]> {
  if (!calls || calls.length === 0) return [];
  const results: ToolCallResult[] = [];
  for (const call of calls) {
    if (!call.name) {
      results.push({
        name: 'unknown',
        success: false,
        error: `Tool call has no name`,
      });
      continue;
    }
    
    const tool = toolRegistry.getTool(call.name);
    if (!tool) {
      results.push({
        name: call.name,
        success: false,
        error: `Unknown tool \`${call.name}\``,
      });
      continue;
    }
    try {
      const argsString = typeof call.args === 'string' ? call.args : JSON.stringify(call.args || {});
      const parsedArgs = JSON.parse(argsString);
      const result = await tool.execute(parsedArgs, AbortSignal.timeout(300_000));
      results.push({ name: call.name, success: true, result });
    } catch (err: any) {
      results.push({ name: call.name, success: false, error: String(err) });
    }
  }
  return results;
}

/**
 * ChimeraOrchestrator – a GeminiChat *sub‑class* that internally coordinates
 * Master → Architect → Implementer → Critic agents.
 *
 * Because it extends GeminiChat, the rest of the CLI/test‑suite can keep
 * treating it as a normal chat session (history helpers, sendMessageStream,
 * etc.) without type errors.
 */
export class ChimeraOrchestrator extends GeminiChat {
  private readonly masterAgentChat: GeminiChat;
  private readonly architectAgentChat: GeminiChat;
  private readonly implementerAgentChat: GeminiChat;
  private readonly criticAgentChat: GeminiChat;
  private toolRegistry?: ToolRegistry;
  private readonly configRef: Config;

  /** last persisted plan (nullable until first save) */
  private currentPlan?: ChimeraPlan;

  /** .chimera directory under the CWD */
  private get planDir(): string {
    return path.join(process.cwd(), '.chimera');
  }
  private get planPath(): string {
    return path.join(this.planDir, 'plan.json');
  }

  constructor(
    config: Config,
    contentGenerator: ContentGenerator,
    generationConfig: GenerateContentConfig = {},
  ) {
    // super() session represents the *public* Master history
    super(config, contentGenerator, generationConfig, []);
    
    this.configRef = config;
    
    /* ---------- dedicated internal agents ---------- */
    const mk = (roleText: string) =>
      new GeminiChat(
        config,
        contentGenerator,
        {
          ...generationConfig,
          systemInstruction: { role: 'system', parts: [{ text: roleText }] },
        },
        [],
      );

    this.masterAgentChat = new GeminiChat(
      config,
      contentGenerator,
      {
        ...generationConfig,
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text:
                'You are the Master agent. Your ONLY task is to restate the user\'s ' +
                'request as one concise, explicit sentence – no commentary, no "thoughts".'
            },
          ],
        },
      },
      [],
    ); // Create separate Master agent instead of circular reference
    this.architectAgentChat = mk(
      'You are the Architect agent. Produce ONLY valid ChimeraPlan JSON – nothing else.',
    );
    this.implementerAgentChat = mk(
      'You are the Implementer Agent. Execute a single PlanStep.',
    );
    this.criticAgentChat = mk(
      'You are the Critic Agent. Return ONLY CriticReview JSON.',
    );

    // ⇢ attempt warm‑start
    this._loadPlan().then(plan => {
      if (plan) {
        console.log('[ORCH] Resuming from .chimera/plan.json');
        this.currentPlan = plan;
      }
    }).catch(() => { /* silent */ });
  }



  private async _savePlan(plan: ChimeraPlan): Promise<void> {
    await fsp.mkdir(this.planDir, { recursive: true });
    await fsp.writeFile(this.planPath, JSON.stringify(plan, null, 2), 'utf-8');
  }

  private async _loadPlan(): Promise<ChimeraPlan | null> {
    try {
      const raw = await fsp.readFile(this.planPath, 'utf-8');
      return JSON.parse(raw) as ChimeraPlan;
    } catch { return null; }
  }

  /**
   * Runs a single PlanStep via the Implementer agent and executes any tool calls it issues.
   */
  private async _runImplementerStep(
    step: PlanStep,
    params: SendMessageParameters,
    prompt_id: string,
  ): Promise<{status: 'done'|'failed'; artifacts: string[]; error?: string}> {
    const toolRegistry = await this.configRef.getToolRegistry();

    const implResp = await this.implementerAgentChat.sendMessage(
      {
        ...params,
        message: {
          text:
            `You are executing plan step \`${step.step_id}\`: ${step.description}\n` +
            `If a tool is required, CALL the tool. Do NOT explain the call.\n` +
            `Return plain text once done.`
        },
      },
      `${prompt_id}-${step.step_id}`,
    );

    // 1️⃣  Capture any tool calls the LLM emitted and execute them.
    const toolCalls = getFunctionCalls(implResp);
    const toolResults = await executeToolCalls(toolRegistry, toolCalls);
    const artifacts: string[] = [];

    for (const r of toolResults) {
      if (r.success && r.result?.llmContent) {
        // Handle llmContent which could be a string or PartListUnion
        const content = r.result.llmContent;
        if (typeof content === 'string') {
          artifacts.push(content);
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (typeof part === 'string') {
              artifacts.push(part);
            } else if (part && typeof part === 'object' && 'text' in part && part.text) {
              artifacts.push(part.text);
            }
          }
        } else if (content && typeof content === 'object' && 'text' in content && content.text) {
          artifacts.push(content.text);
        }
      }
    }

    // 2️⃣  Determine success
    const hasFailure = toolResults.some(r => !r.success);
    const execResult = {
      status: (hasFailure ? 'failed' : 'done') as 'done'|'failed',
      artifacts,
      error: hasFailure ? JSON.stringify(toolResults) : undefined,
    };

    if (this.currentPlan) await this._savePlan(this.currentPlan);
    // Note: step-level logging is now handled in the main sendMessage loop

    return execResult;
  }

  /* ------------------------------------------------------------------ */
  /* Orchestrated single‑shot message                                   */
  /* ------------------------------------------------------------------ */
  async sendMessage(
    params: SendMessageParameters,
    prompt_id: string,
  ): Promise<GenerateContentResponse> {
    chimeraLog('MASTER', `🎯 complex task detected – activating workflow`);
    chimeraLog('MASTER', '🟢 clarifying user intent…');

    const masterResp = await this.masterAgentChat.sendMessage(
      { message: params.message },
      prompt_id,
    );

    const clarified = this._extractText(masterResp).trim();
    chimeraLog('MASTER', `✅ clarified: "${clarified.slice(0, 60)}"`);

    /* ---------- 2. Architect plan with JSON‑schema validation & bounded retries ---------- */
    const MAX_TRIES = 3;
    let planObj: ChimeraPlan | null = null;
    let architectText = '';
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      chimeraLog('ARCHITECT', `🟢 drafting plan (attempt ${attempt}/${MAX_TRIES})`);
      
      const architectPrompt = JSON.stringify({
        original_user_request: params.message,
        clarified_requirements: clarified,
      });

      const archResp = await this.architectAgentChat.sendMessage(
        { message: architectPrompt },
        `${prompt_id}-arch-${attempt}`,
      );
      architectText = this._extractText(archResp);

      // Clean up the response - remove markdown formatting if present
      let cleanedText = architectText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      // Parse
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleanedText);
      } catch (parseError) {
        const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        chimeraLog('ARCHITECT', `❌ invalid JSON (${errorMsg}), retrying…`);
        
        // Send more specific error back to Architect
        await this.architectAgentChat.addHistory({
          role: 'system',
          parts: [{ 
            text: `❌ JSON Parse Error: ${errorMsg}. Please return ONLY valid JSON, no markdown or explanatory text.` 
          }],
        });
        continue;
      }

      // Validate
      const { ok, errors } = validateJson<ChimeraPlan>(
        parsed,
        'chimeraPlan.schema.json',
      );
      if (ok) {
        planObj = parsed as ChimeraPlan;
        this.currentPlan = planObj;
        await this._savePlan(planObj);
        chimeraLog('ARCHITECT', `✅ plan OK – ${planObj.plan.length} step(s)`);
        break;
      } else {
        chimeraLog('ARCHITECT', `❌ invalid JSON (${errors?.length} error[s]), retrying…`);
        
        // Feed validation errors back to Architect (bounded retries)
        await this.architectAgentChat.addHistory({
          role: 'system',
          parts: [
            {
              text: [
                '❌ Schema validation failed. Your JSON structure is incorrect.',
                `Validation errors: ${errors?.join(', ')}`,
                'Please fix these errors and return ONLY corrected JSON:'
              ].join('\n')
            },
          ],
        });
      }
    }

    if (!planObj) {
      chimeraLog('ARCHITECT', '❌ failed to create valid plan after all attempts');
      return {
        candidates: [
          {
            content: {
              parts: [
                {
                  text:
                    'Architect never produced a valid ChimeraPlan after ' +
                    MAX_TRIES +
                    ' attempts. Last output:\n' +
                    architectText,
                },
              ],
            },
          },
        ],
      } as unknown as GenerateContentResponse;
    }

    // 3. Implementer executes each step (NEW runner)
    chimeraLog('IMPLEMENTER', `🟢 starting execution of ${planObj.plan.length} steps...`);
    for (const step of planObj.plan) {
      if (step.status === 'done') continue; // skip already‑done
      chimeraLog('IMPLEMENTER', `🟢 ${step.step_id}: ${step.description.slice(0, 50)}...`);
      const execResult = await this._runImplementerStep(
        step,
        params,
        prompt_id,
      );
      step.status = execResult.status as PlanStatus;
      step.artifacts.push(...execResult.artifacts);
      if (execResult.status === 'failed') {
        step.error_message = execResult.error;
        chimeraLog('IMPLEMENTER', `❌ ${step.step_id} failed`);
        break; // stop execution; Critic will handle
      } else {
        chimeraLog('IMPLEMENTER', `✅ ${step.step_id} done (artifacts: ${execResult.artifacts.length})`);
      }
    }

    const implementerSummary = planObj.plan
      .map((s) => `${s.step_id}:${s.status}${s.error_message ? ` (${s.error_message})` : ''}`)
      .join(', ');

    /* ---------- 4. Critic review ---------- */
    chimeraLog('CRITIC', '🟢 reviewing implementation quality...');
    this.criticAgentChat.clearHistory(); // unbiased review
    const criticResp = await this.criticAgentChat.sendMessage(
      {
        message:
          'You are the Critic agent. Return ONLY CriticReview JSON evaluating implementer output.\n' +
          'Plan JSON:\n' + JSON.stringify(planObj) + '\n' +
          'Implementer Summary:\n' + implementerSummary,
      },
      `${prompt_id}-critic`,
    );
    const review = this._safeJson<CriticReview>(criticResp, 'CriticReview');
    if (review && review.pass === false) {
      chimeraLog('CRITIC', '❌ quality review failed - plan needs revision');
      // when criticReview.pass === false and you mutate plan
      if (this.currentPlan) {
        await this._savePlan(this.currentPlan);
        chimeraLog('CRITIC', '✏️ plan patched & re‑saved');
      }
      return criticResp; // bubble up issues/recommendation
    }
    chimeraLog('CRITIC', '✅ quality review passed');

    /* ---------- 5. Success ---------- */
    chimeraLog('MASTER', '🎯 multi-agent workflow completed successfully');
    return {
      candidates: [
        {
          content: {
            parts: [{ text: implementerSummary }],
          },
        },
      ],
    } as GenerateContentResponse;
  }

  /* ------------------------------------------------------------------ */
  /* Stream version – routes complex tasks to full workflow             */
  /* ------------------------------------------------------------------ */
  async sendMessageStream(
    params: SendMessageParameters,
    prompt_id: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // Detect if this looks like a complex task that would benefit from multi-agent workflow
    let message = '';
    if (typeof params.message === 'string') {
      message = params.message;
    } else if (params.message && typeof params.message === 'object') {
      // Handle case where message might be an object with text property
      if ('text' in params.message && typeof params.message.text === 'string') {
        message = params.message.text;
      }
      // Also check for other possible structures
      if (Array.isArray(params.message)) {
        // If it's an array, extract text from all text parts
        message = params.message
          .filter((part: any) => part && typeof part === 'object' && 'text' in part)
          .map((part: any) => part.text)
          .join(' ');
      }
    }
    
    const isComplexTask = /create|write|build|implement|develop|generate|make|file/i.test(message);
    
    if (isComplexTask) {
      chimeraLog('MASTER', '🎯 complex task detected - activating multi-agent workflow');
      
      // Route to full multi-agent workflow and convert result to stream
      const response = await this.sendMessage(params, prompt_id);
      
      // Convert the single response to a stream format
      async function* singleResponseToStream() {
        yield response;
      }
      
      return singleResponseToStream();
    }
    
    // For simple tasks, delegate to Master agent directly
    return this.masterAgentChat.sendMessageStream(params, prompt_id);
  }

  public getHistory(curated = false) {
    return this.masterAgentChat.getHistory(curated);
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */
  private _extractText(resp?: GenerateContentResponse): string {
    return (
      resp?.candidates
        ?.flatMap((c: any) => c.content?.parts || [])
        .map((p: any) => (p as any).text || '')
        .join('\n')
        .trim() || ''
    );
  }

  private _safeJson<T>(
    resp: GenerateContentResponse,
    label: string,
  ): T | null {
    try {
      return JSON.parse(this._extractText(resp)) as T;
    } catch {
      // Let caller decide how to surface invalid JSON
      return null;
    }
  }
}
