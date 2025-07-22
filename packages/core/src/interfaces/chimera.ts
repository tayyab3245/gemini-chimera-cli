// --- Start ChimeraPlan Interfaces ---
export type PlanStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface PlanStep {
  step_id: string;             // unique within plan
  description: string;         // imperative instruction
  rationale?: string;          // why this step exists
  tools?: string[];            // suggested tool names
  inputs?: Record<string, any>;// file names, symbols, etc.
  depends_on: string[];        // step_ids that must be done first
  status: PlanStatus;          // current state
  artifacts: string[];         // file paths or identifiers created
  attempts: number;            // how many times Implementer tried
  max_attempts: number;        // guard against infinite loops
  error_message?: string;      // set if failed
}

export interface ChimeraPlan {
  task_id: string;
  original_user_request: string;
  requirements: string[];      // normalized from Master clarification
  assumptions: string[];       // inferred details
  constraints: string[];       // invariants to enforce
  plan: PlanStep[];            // ordered list
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  created_at: string;          // ISO timestamps
  updated_at: string;
  model_versions: Record<string,string>; // e.g., {\"architect\": \"gemini-1.5-pro\"}
  history: any[];              // free-form events (critic notes, etc.)
}

export interface CriticIssue {
  type: 'bug'|'regression'|'style'|'security'|'performance'|'contradiction'|'vision_deviation';
  message: string;
}

export interface PlanModification {
  action: 'insert_after'|'replace'|'remove';
  after_step_id?: string;
  target_step_id?: string;
  new_step?: PlanStep;
}

export interface CriticReview {
  review_id: string;
  task_id: string;
  scope: 'step'|'plan'; // Whether the review is for a single step or the whole plan
  target_step_id?: string; // If scope is 'step', which step
  pass: boolean;
  issues: CriticIssue[];
  recommendation: string;             // human-readable summary
  updated_plan_modifications?: PlanModification[]; // optional patch to the plan
}
// --- End CriticReview Interfaces ---
