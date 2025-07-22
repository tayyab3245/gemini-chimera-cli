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
        systemInstruction: { role: 'system', parts: [{ text: 'You are the Master Agent. Clarify user intent and rewrite explicitly.' }] },
      },
      [],
    ); // Create separate Master agent instead of circular reference
    this.architectAgentChat = mk(
      'You are the Architect Agent. Output ONLY ChimeraPlan JSON.',
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

  /* ------------------------------------------------------------------ */
  /* One‑shot banner so you can SEE which internal agents are alive     */
  /* ------------------------------------------------------------------ */
  private bannerShown = false;
  private logBanner() {
    if (this.bannerShown) return;
    this.bannerShown = true;

    const names = {
      master:        'You are the Master Agent. Clarify user intent and rewrite explicitly.',
      architect:     'You are the Architect Agent. Output ONLY ChimeraPlan JSON.',
      implementer:   'You are the Implementer Agent. Execute a single PlanStep.',
      critic:        'You are the Critic Agent. Return ONLY CriticReview JSON.',
    };
    console.log('\n🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲');
    console.log('┌─────────────────────────────────────────────────────────');
    console.log('│ 🐲  Project Chimera – internal agents online');
    for (const [k,v] of Object.entries(names)) {
      console.log(`│   • ${k.padEnd(12)} → ${v?.slice(0,60)}...`);
    }
    console.log('└─────────────────────────────────────────────────────────');
    console.log('🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲🐲\n');
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

  private log(tag: string, msg: string) {
    console.log(`[${tag}] ${msg}`);
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
    this.log('IMPLEMENTER', `Step ${step.step_id} → ${execResult.status}`);

    return execResult;
  }

  /* ------------------------------------------------------------------ */
  /* Orchestrated single‑shot message                                   */
  /* ------------------------------------------------------------------ */
  async sendMessage(
    params: SendMessageParameters,
    prompt_id: string,
  ): Promise<GenerateContentResponse> {
    this.logBanner();          // <‑‑‑ show agents banner once
    
    /* ---------- 1. Master clarification ---------- */
    const masterResp = await this.masterAgentChat.sendMessage(
      {
        ...params,
        message:
          'Clarify user intent and rewrite explicitly:\n' + params.message,
      },
      prompt_id,
    );
    const clarified = this._extractText(masterResp);

    /* ---------- 2. Architect plan with JSON‑schema validation & bounded retries ---------- */
    const MAX_TRIES = 3;
    let planObj: ChimeraPlan | null = null;
    let architectText = '';
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      const architectPrompt =
        [
          'You are the Architect agent.',
          'Return ONLY JSON matching the ChimeraPlan schema. Do not include prose.',
          `original_user_request: ${params.message}`,
          `clarified_requirements: ${clarified}`,
        ].join('\n');

      const archResp = await this.architectAgentChat.sendMessage(
        { ...params, message: architectPrompt },
        `${prompt_id}-arch-${attempt}`,
      );
      architectText = this._extractText(archResp);

      // Parse
      let parsed: unknown;
      try {
        parsed = JSON.parse(architectText);
      } catch {
        // Send schema error back to Architect
        await this.architectAgentChat.addHistory({
          role: 'system',
          parts: [{ text: '❌ Output was not valid JSON. Please output ONLY JSON.' }],
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
        this.log('ARCHITECT', '✅ valid ChimeraPlan saved to disk');
        break;
      }

      // Feed validation errors back to Architect (bounded retries)
      await this.architectAgentChat.addHistory({
        role: 'system',
        parts: [
          {
            text:
              '❌ Schema validation failed. Fix the following errors and output ONLY the corrected JSON:\n' +
              errors?.join('\n'),
          },
        ],
      });
    }

    if (!planObj) {
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
    for (const step of planObj.plan) {
      if (step.status === 'done') continue; // skip already‑done
      const execResult = await this._runImplementerStep(
        step,
        params,
        prompt_id,
      );
      step.status = execResult.status as PlanStatus;
      step.artifacts.push(...execResult.artifacts);
      if (execResult.status === 'failed') {
        step.error_message = execResult.error;
        break; // stop execution; Critic will handle
      }
    }

    const implementerSummary = planObj.plan
      .map((s) => `${s.step_id}:${s.status}${s.error_message ? ` (${s.error_message})` : ''}`)
      .join(', ');

    /* ---------- 4. Critic review ---------- */
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
      // when criticReview.pass === false and you mutate plan
      if (this.currentPlan) {
        await this._savePlan(this.currentPlan);
        this.log('CRITIC', '✏️  plan patched & re‑saved');
      }
      return criticResp; // bubble up issues/recommendation
    }

    /* ---------- 5. Success ---------- */
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
  /* Stream version – hand off to Master for now                        */
  /* ------------------------------------------------------------------ */
  async sendMessageStream(
    params: SendMessageParameters,
    prompt_id: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    this.logBanner();          // <‑‑‑ show agents banner once for stream too
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
