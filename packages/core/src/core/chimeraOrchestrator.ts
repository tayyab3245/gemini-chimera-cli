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
  FunctionCall,
} from '@google/genai';
import path from 'node:path';
import { promises as fsp } from 'node:fs';

import { GeminiChat } from './geminiChat.js';
import { Config } from '../config/config.js';
import { ContentGenerator } from './contentGenerator.js';

import {
  ChimeraPlan,
  CriticReview,
  PlanStep,
  PlanStatus,
} from '../interfaces/chimera.js';
import { ToolResult } from '../tools/tools.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { validateJson } from '../utils/jsonValidator.js';

/** Promise.race wrapper that rejects after `ms` milliseconds */
function withTimeout<T>(p: Promise<T>, ms = 60_000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timed‑out after ${ms} ms`)), ms)),
  ]);
}
import { getFunctionCalls } from '../utils/generateContentResponseUtilities.js';
import { chimeraLog } from '../utils/chimeraLogger.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Pulls out the *first* {...} or [...] block from a text string. */
function extractJsonBlock(text: string): string | null {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return match ? match[0] : null;
}

async function executeToolCalls(
  registry: ToolRegistry,
  calls: FunctionCall[] | undefined,
): Promise<ToolCallResult[]> {
  if (!calls?.length) return [];
  const out: ToolCallResult[] = [];

  for (const call of calls) {
    if (!call.name) {
      out.push({ name: 'unknown', success: false, error: 'missing name' });
      continue;
    }
    const tool = registry.getTool(call.name);
    if (!tool) {
      out.push({
        name: call.name,
        success: false,
        error: `Unknown tool "${call.name}"`,
      });
      continue;
    }
    try {
      const args =
        typeof call.args === 'string'
          ? JSON.parse(call.args || '{}')
          : call.args ?? {};
      const result = await tool.execute(args, AbortSignal.timeout(300_000));
      out.push({ name: call.name, success: true, result });
    } catch (err) {
      out.push({ name: call.name, success: false, error: String(err) });
    }
  }
  return out;
}

interface ToolCallResult {
  name: string;
  success: boolean;
  result?: ToolResult;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Example JSON shown to Architect to anchor output shape              */
/* ------------------------------------------------------------------ */
const EXAMPLE_CHIMERA_PLAN_JSON = `{
  "task_id": "demo-0001",
  "original_user_request": "Create hello.ts",
  "requirements": ["hello.ts prints Hello World"],
  "assumptions": [],
  "constraints": [],
  "plan": [{
    "step_id": "S1",
    "description": "write hello.ts file",
    "depends_on": [],
    "status": "pending",
    "artifacts": [],
    "attempts": 0,
    "max_attempts": 2
  }],
  "status": "pending",
  "created_at": "2025-07-23T00:00:00Z",
  "updated_at": "2025-07-23T00:00:00Z",
  "model_versions": {"architect": "gemini-2.5-flash"},
  "history": []
}`;

/* ======================================================================
   CHIMERA  ORCHESTRATOR
   ====================================================================== */
export class ChimeraOrchestrator extends GeminiChat {
  /* ───────── internal agent handles ───────── */
  private readonly masterChat: GeminiChat;
  private readonly architectChat: GeminiChat;
  private readonly implementerChat: GeminiChat;
  private readonly criticChat: GeminiChat;

  private currentPlan?: ChimeraPlan;
  private readonly cfg: Config;
  
  private readonly _masterSystemPrompt = {
    role: 'system' as const,
    parts: [{
      text: 'Rewrite the USER request as ONE sentence (<50 chars). ' +
            'Return ONLY that sentence; no commentary.',
    }],
  };

  private get planDir() {
    return path.join(process.cwd(), '.chimera');
  }
  private get planPath() {
    return path.join(this.planDir, 'plan.json');
  }

  constructor(
    cfg: Config,
    gen: ContentGenerator,
    gcfg: GenerateContentConfig = {},
  ) {
    super(cfg, gen, gcfg, []);
    this.cfg = cfg;

    /* ---------- spawn sub-chats ---------- */
    const mkChat = (systemPrompt: string) =>
      new GeminiChat(
        cfg,
        gen,
        { ...gcfg, systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] } },
        [],
      );

    this.masterChat = new GeminiChat(
      cfg,
      gen,
      {
        ...gcfg,
        systemInstruction: this._masterSystemPrompt,
      },
      [],
    );
    this.architectChat = mkChat(
      'You are the Architect. Output ONLY valid ChimeraPlan JSON – no prose.',
    );
    this.implementerChat = mkChat(
      'You are the Implementer. Execute exactly one PlanStep. Call tools as needed.',
    );
    this.criticChat = mkChat(
      'You are the Critic. Return ONLY CriticReview JSON.',
    );

    /* warm-start */
    this._loadPlan().catch(() => {});
  }

  /* ===== persistence ===== */
  private async _savePlan(plan: ChimeraPlan) {
    await fsp.mkdir(this.planDir, { recursive: true });
    await fsp.writeFile(this.planPath, JSON.stringify(plan, null, 2), 'utf-8');
    if (process.env.CHIMERA_DEBUG)
      chimeraLog('ARCHITECT', `📄 plan saved → ${this.planPath}`);
  }
  private async _loadPlan(): Promise<void> {
    try {
      const raw = await fsp.readFile(this.planPath, 'utf-8');
      this.currentPlan = JSON.parse(raw) as ChimeraPlan;
      chimeraLog('MASTER', '♻️  resumed existing plan');
    } catch {
      /* ignore */
    }
  }

  /* ====================================================================
     SINGLE-SHOT WORKFLOW
     ==================================================================== */
  async sendMessage(
    params: SendMessageParameters,
    promptId: string,
  ): Promise<GenerateContentResponse> {
    /* ─── hard‑reset master to its disciplined state ─── */
    chimeraLog('MASTER', 'workflow started - initializing agent state');
    chimeraLog('MASTER', 'clearing conversation history');
    this.masterChat.clearHistory();                               // NEW
    this.masterChat.addHistory(this._masterSystemPrompt);         // NEW
    chimeraLog('MASTER', 'agent state reset complete');

    /* ---------- 1. MASTER ---------- */
    chimeraLog('MASTER', 'complex task detected – activating workflow');
    
    // Bullet-proof message extraction to prevent malformed payloads
    const userText = (() => {
      if (typeof params.message === 'string') return params.message.trim();

      // PartListUnion → flatten all text parts
      if (Array.isArray(params.message)) {
        return params.message
          .filter((p) => p && typeof p === 'object' && 'text' in p)
          .map((p: any) => p.text)
          .join(' ')
          .trim();
      }

      // Handle {text:"..."} object form
      if (params.message && typeof params.message === 'object' && 'text' in params.message) {
        return String((params.message as any).text).trim();
      }

      // Fallback
      return JSON.stringify(params.message);
    })();

    try {
      chimeraLog('MASTER', `payload → '${userText.replace(/\n/g, '↵')}'`);
      const masterResp = await withTimeout(
        this.masterChat.sendMessage({ message: userText }, `${promptId}-master`),
        10_000,
      ).catch(e => {
        chimeraLog('MASTER', '⏱️ timeout / net-error ' + e.message);
        throw e;
      });
      const clarified = this._extractText(masterResp).trim();
      chimeraLog('MASTER', `clarified: "${clarified}"`);
      
      if (!clarified) {
        return this._simpleTextResponse('Master returned empty clarification');
      }

      /* ---------- 2. ARCHITECT ---------- */
      chimeraLog('ARCHITECT', 'starting plan generation phase');
      const plan = await this._getValidPlan(userText, clarified, promptId);
      if (!plan) {
        chimeraLog('ARCHITECT', 'FAILED - could not produce valid plan after retries');
        return this._simpleTextResponse(
          'Architect could not produce valid plan after retries.',
        );
      }
      this.currentPlan = plan;
      chimeraLog('ARCHITECT', `plan validated successfully - ${plan.plan.length} steps identified`);
      await this._savePlan(plan);
      chimeraLog('ARCHITECT', 'plan saved to disk');

      /* ---------- 3. IMPLEMENTER ---------- */
      chimeraLog('IMPLEMENTER', 'starting implementation phase');
      const implSummary = await this._executePlan(plan, params, promptId);
      chimeraLog('IMPLEMENTER', 'implementation phase complete');

      /* ---------- 4. CRITIC + RE-PLAN LOOP ---------- */
      chimeraLog('CRITIC', 'starting quality review and re-plan loop');
      const criticResult = await this._criticLoop(plan, implSummary, params, promptId);
      if (criticResult) {
        chimeraLog('CRITIC', 'workflow completed via critic result');
        return criticResult;
      }

      /* ---------- SUCCESS ---------- */
      chimeraLog('MASTER', 'workflow complete – all phases successful');
      return this._simpleTextResponse(implSummary);

    } catch (err) {
      chimeraLog('MASTER', `Gemini API error: ${String(err)}`);
      return this._simpleTextResponse(
        `Master agent failed: ${(err as Error).message}`,
      );
    }
  }

  /* ............................................................ ARCHITECT */
  private async _getValidPlan(
    original: string,
    clarified: string,
    promptId: string,
  ): Promise<ChimeraPlan | null> {
    const MAX = 3;
    chimeraLog('ARCHITECT', `initializing plan generation with ${MAX} max attempts`);
    
    for (let i = 1; i <= MAX; i++) {
      chimeraLog('ARCHITECT', `drafting plan (attempt ${i}/${MAX})`);
      const prompt = [
        'You are the **Architect**.',
        'Return ONLY a valid ChimeraPlan JSON object.',
        '',
        `Original request: ${original}`,
        `Clarified requirements: ${clarified}`,
        '',
        'Example (copy shape, change content):',
        EXAMPLE_CHIMERA_PLAN_JSON,
      ].join('\n');

      chimeraLog('ARCHITECT', 'sending plan generation request to Gemini API...');
      const resp = await this.architectChat.sendMessage(
        { message: prompt },
        `${promptId}-arch-${i}`,
      );
      
      chimeraLog('ARCHITECT', 'API response received, extracting JSON');
      const txt = this._extractText(resp).trim();

      chimeraLog('ARCHITECT', 'attempting to parse JSON response');
      const plan = this._tryParseJson<ChimeraPlan>(txt, 'ChimeraPlan');
      if (!plan) {
        chimeraLog('ARCHITECT', 'JSON parsing failed, retrying with next attempt');
        continue;
      }

      chimeraLog('ARCHITECT', 'JSON parsed successfully, validating against schema');
      const { ok, errors } = validateJson<ChimeraPlan>(
        plan,
        'chimeraPlan.schema.json',
      );
      if (ok) {
        chimeraLog('ARCHITECT', `plan validation successful – ${plan.plan.length} steps defined`);
        return plan;
      }

      chimeraLog('ARCHITECT', `schema validation failed (${errors?.length} errors), preparing retry`);
      if (errors && errors.length > 0) {
        chimeraLog('ARCHITECT', `validation errors: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`);
      }
      await this.architectChat.addHistory({
        role: 'system',
        parts: [
          {
            text:
              '❌ Your JSON failed validation:\n' +
              (errors ?? []).join('\n') +
              '\nReturn ONLY corrected JSON.',
          },
        ],
      });
    }
    chimeraLog('ARCHITECT', '❌ gave up after max retries');
    return null;
  }

  /* ........................................................ IMPLEMENTER */
  private async _executePlan(
    plan: ChimeraPlan,
    params: SendMessageParameters,
    promptId: string,
  ): Promise<string> {
    const registry = await this.cfg.getToolRegistry();
    chimeraLog('IMPLEMENTER', `initializing execution of ${plan.plan.length} step(s)`);

    for (const step of plan.plan) {
      if (step.status === 'done') {
        chimeraLog('IMPLEMENTER', `${step.step_id} already completed, skipping`);
        continue;
      }
      
      chimeraLog('IMPLEMENTER', `executing ${step.step_id}: ${step.description}`);
      chimeraLog('IMPLEMENTER', 'sending implementation request to Gemini API...');
      
      const implResp = await this.implementerChat.sendMessage(
        {
          ...params,
          message: [
            `Step ID: ${step.step_id}`,
            `Description: ${step.description}`,
            '',
            'If a tool is required, CALL it. Return plain text when finished.',
          ].join('\n'),
        },
        `${promptId}-${step.step_id}`,
      );

      chimeraLog('IMPLEMENTER', 'API response received, checking for tool calls');
      const toolCalls = getFunctionCalls(implResp);
      if (toolCalls && toolCalls.length > 0) {
        chimeraLog('IMPLEMENTER', `found ${toolCalls.length} tool call(s), executing...`);
      } else {
        chimeraLog('IMPLEMENTER', 'no tool calls found in response');
      }

      const toolResults = await executeToolCalls(
        registry,
        toolCalls,
      );

      if (toolResults && toolResults.length > 0) {
        chimeraLog('IMPLEMENTER', `tool execution complete - ${toolResults.length} result(s)`);
      }

      const failed = toolResults.find((r) => !r.success);
      step.status = failed ? 'failed' : 'done';
      
      if (failed) {
        chimeraLog('IMPLEMENTER', `${step.step_id} FAILED: ${failed.error || 'unknown error'}`);
      } else {
        chimeraLog('IMPLEMENTER', `${step.step_id} completed successfully`);
      }
      step.artifacts.push(
        ...toolResults
          .filter((r) => r.success && r.result?.llmContent)
          .map((r) => String(r.result!.llmContent).slice(0, 120)),
      );
      step.attempts += 1;
      if (failed) step.error_message = failed.error;

      await this._savePlan(plan);
      chimeraLog(
        'IMPLEMENTER',
        `${step.step_id} → ${step.status}${failed ? `: ${failed.error}` : ''}`,
      );
      if (failed) break;
    }
    return plan.plan
      .map((s) => `${s.step_id}:${s.status}`)
      .join(', ');
  }

  /* ............................................................ CRITIC */
  private readonly MAX_REPLANS = 3;
  private async _criticLoop(
    plan: ChimeraPlan,
    summary: string,
    params: SendMessageParameters,
    promptId: string,
  ): Promise<GenerateContentResponse | null> {
    chimeraLog('CRITIC', `starting review loop with max ${this.MAX_REPLANS} iterations`);
    
    for (let round = 0; round < this.MAX_REPLANS; round++) {
      chimeraLog('CRITIC', `review round ${round + 1}/${this.MAX_REPLANS} - analyzing implementation`);
      chimeraLog('CRITIC', 'sending review request to Gemini API...');
      
      const criticResp = await this.criticChat.sendMessage(
        {
          message: [
            'Return ONLY CriticReview JSON. If pass=false you may suggest updated_plan_modifications.',
            '',
            'Plan:',
            JSON.stringify(plan),
            '',
            'Implementer summary:',
            summary,
          ].join('\n'),
        },
        `${promptId}-critic-${round}`,
      );
      
      chimeraLog('CRITIC', 'API response received, parsing review JSON');
      const review = this._tryParseJson<CriticReview>(
        this._extractText(criticResp),
        'CriticReview',
      );
      if (!review) {
        chimeraLog('CRITIC', 'JSON parsing failed - returning raw response');
        return criticResp;
      }
      
      if (review.pass) {
        chimeraLog('CRITIC', 'review passed - implementation meets requirements');
        return null; // success
      }
      
      chimeraLog('CRITIC', `review failed - ${review.recommendation || 'no specific recommendation'}`);
      chimeraLog('CRITIC', `attempting plan modification (round ${round + 1})`);
      
      if (review.updated_plan_modifications) {
        chimeraLog('CRITIC', `found ${review.updated_plan_modifications.length} modification(s) to apply`);
      }

      if (
        !review.updated_plan_modifications?.length ||
        !this._applyMods(plan, review.updated_plan_modifications)
      ) {
        chimeraLog('CRITIC', 'could not apply modifications - aborting review loop');
        return criticResp;
      }
      
      chimeraLog('CRITIC', 'modifications applied successfully, saving updated plan');
      await this._savePlan(plan);

      chimeraLog('CRITIC', 're-executing modified plan steps');
      summary = await this._executePlan(plan, params, promptId);
      chimeraLog('CRITIC', 'plan re-execution complete, continuing review loop');
    }
    chimeraLog('CRITIC', `exceeded ${this.MAX_REPLANS} re-plan rounds - terminating review`);
    return this._simpleTextResponse('Critic failed after max retries.');
  }

  private _applyMods(plan: ChimeraPlan, mods: any[]): boolean {
    chimeraLog('CRITIC', `applying ${mods.length} plan modification(s)`);
    
    try {
      for (const m of mods) {
        chimeraLog('CRITIC', `processing ${m.action} modification`);
        
        switch (m.action) {
          case 'insert_after': {
            const idx = plan.plan.findIndex((s) => s.step_id === m.after_step_id);
            if (idx === -1 || !m.new_step) {
              chimeraLog('CRITIC', `insert_after failed - step ${m.after_step_id} not found or no new_step`);
              return false;
            }
            plan.plan.splice(idx + 1, 0, m.new_step);
            chimeraLog('CRITIC', `inserted new step ${m.new_step.step_id} after ${m.after_step_id}`);
            break;
          }
          case 'replace': {
            const idx = plan.plan.findIndex((s) => s.step_id === m.target_step_id);
            if (idx === -1 || !m.new_step) return false;
            plan.plan[idx] = m.new_step;
            break;
          }
          case 'remove': {
            const idx = plan.plan.findIndex((s) => s.step_id === m.target_step_id);
            if (idx === -1) return false;
            plan.plan.splice(idx, 1);
            break;
          }
          default:
            return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /* ................................................ STREAM ROUTER */
  async sendMessageStream(
    params: SendMessageParameters,
    promptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const txt =
      typeof params.message === 'string'
        ? params.message
        : JSON.stringify(params.message);
    const looksHard = /\b(create|write|generate|build|implement|refactor)\b/i.test(
      txt,
    );
    if (!looksHard) return this.masterChat.sendMessageStream(params, promptId);

    const resp = await this.sendMessage(params, promptId);
    async function* once() {
      yield resp;
    }
    return once();
  }

  /* ..................................................... utils */
  private _extractText(r?: GenerateContentResponse): string {
    return (
      r?.candidates
        ?.flatMap((c: any) => c.content?.parts || [])
        .map((p: any) => (p as any).text || '')
        .join('\n')
        .trim() || ''
    );
  }

  private _tryParseJson<T>(txt: string, label: string): T | null {
    try {
      return JSON.parse(txt) as T;
    } catch {
      const blk = extractJsonBlock(txt);
      if (!blk) return null;
      try {
        return JSON.parse(blk) as T;
      } catch {
        if (process.env.CHIMERA_DEBUG)
          chimeraLog('ARCHITECT', `⚠️  could not parse json block`);
        return null;
      }
    }
  }

  private _simpleTextResponse(text: string): GenerateContentResponse {
    return {
      candidates: [{ content: { parts: [{ text }] } }],
    } as GenerateContentResponse;
  }
}
