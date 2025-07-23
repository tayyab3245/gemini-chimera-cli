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
    this.masterChat.clearHistory();                               // NEW
    this.masterChat.addHistory(this._masterSystemPrompt);         // NEW

    /* ---------- 1. MASTER ---------- */
    chimeraLog('MASTER', '🎯 complex task detected – activating workflow');
    const userText =
      typeof params.message === 'string'
        ? params.message
        : JSON.stringify(params.message);

    const masterResp = await this.masterChat.sendMessage(
      { message: userText },
      `${promptId}-master`,
    );
    const clarified = this._extractText(masterResp).trim();
    chimeraLog('MASTER', `✅ clarified: "${clarified}"`);

    /* ---------- 2. ARCHITECT ---------- */
    const plan = await this._getValidPlan(userText, clarified, promptId);
    if (!plan) {
      return this._simpleTextResponse(
        'Architect could not produce valid plan after retries.',
      );
    }
    this.currentPlan = plan;
    await this._savePlan(plan);

    /* ---------- 3. IMPLEMENTER ---------- */
    const implSummary = await this._executePlan(plan, params, promptId);

    /* ---------- 4. CRITIC + RE-PLAN LOOP ---------- */
    const criticResult = await this._criticLoop(plan, implSummary, params, promptId);
    if (criticResult) return criticResult;

    /* ---------- SUCCESS ---------- */
    chimeraLog('MASTER', '🎯 workflow complete – all good');
    return this._simpleTextResponse(implSummary);
  }

  /* ............................................................ ARCHITECT */
  private async _getValidPlan(
    original: string,
    clarified: string,
    promptId: string,
  ): Promise<ChimeraPlan | null> {
    const MAX = 3;
    for (let i = 1; i <= MAX; i++) {
      chimeraLog('ARCHITECT', `🟢 drafting plan (attempt ${i}/${MAX})`);
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

      const resp = await this.architectChat.sendMessage(
        { message: prompt },
        `${promptId}-arch-${i}`,
      );
      const txt = this._extractText(resp).trim();

      const plan = this._tryParseJson<ChimeraPlan>(txt, 'ChimeraPlan');
      if (!plan) continue;

      const { ok, errors } = validateJson<ChimeraPlan>(
        plan,
        'chimeraPlan.schema.json',
      );
      if (ok) {
        chimeraLog('ARCHITECT', `✅ plan OK – ${plan.plan.length} steps`);
        return plan;
      }

      chimeraLog(
        'ARCHITECT',
        `❌ schema errors (${errors?.length}). retrying…`,
      );
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
    chimeraLog('IMPLEMENTER', `🟢 executing ${plan.plan.length} step(s)…`);

    for (const step of plan.plan) {
      if (step.status === 'done') continue;
      chimeraLog('IMPLEMENTER', `→ ${step.step_id}: ${step.description}`);
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

      const toolResults = await executeToolCalls(
        registry,
        getFunctionCalls(implResp),
      );

      const failed = toolResults.find((r) => !r.success);
      step.status = failed ? 'failed' : 'done';
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
    for (let round = 0; round < this.MAX_REPLANS; round++) {
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
      const review = this._tryParseJson<CriticReview>(
        this._extractText(criticResp),
        'CriticReview',
      );
      if (!review) {
        chimeraLog('CRITIC', '⚠️  invalid JSON – giving up');
        return criticResp;
      }
      if (review.pass) {
        chimeraLog('CRITIC', '✅ review passed');
        return null; // success
      }
      chimeraLog('CRITIC', `✏️  review failed – patching plan (round ${round + 1})`);

      if (
        !review.updated_plan_modifications?.length ||
        !this._applyMods(plan, review.updated_plan_modifications)
      ) {
        chimeraLog('CRITIC', '❌ could not apply modifications – aborting');
        return criticResp;
      }
      await this._savePlan(plan);

      // re-execute modified / remaining steps
      summary = await this._executePlan(plan, params, promptId);
    }
    chimeraLog('CRITIC', `⚠️  exceeded ${this.MAX_REPLANS} re-plan rounds`);
    return this._simpleTextResponse('Critic failed after max retries.');
  }

  private _applyMods(plan: ChimeraPlan, mods: any[]): boolean {
    try {
      for (const m of mods) {
        switch (m.action) {
          case 'insert_after': {
            const idx = plan.plan.findIndex((s) => s.step_id === m.after_step_id);
            if (idx === -1 || !m.new_step) return false;
            plan.plan.splice(idx + 1, 0, m.new_step);
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
