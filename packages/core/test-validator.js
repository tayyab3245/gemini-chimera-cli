import { validateJson } from '../src/utils/jsonValidator.js';
import { ChimeraPlan } from '../src/interfaces/chimera.js';

// Test valid ChimeraPlan
const validPlan: ChimeraPlan = {
  task_id: "test-123",
  original_user_request: "Create a simple function",
  requirements: ["Must be TypeScript", "Must include types"],
  assumptions: ["User has Node.js installed"],
  constraints: ["Keep it under 50 lines"],
  plan: [
    {
      step_id: "step-1",
      description: "Create the function",
      depends_on: [],
      status: "pending",
      artifacts: ["function.ts"],
      attempts: 0,
      max_attempts: 3
    }
  ],
  status: "pending",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  model_versions: {
    "architect": "gemini-2.0-flash",
    "implementer": "gemini-2.0-flash"
  },
  history: []
};

// Test the validator
console.log("Testing JSON Schema Validation...");
const result = validateJson<ChimeraPlan>(validPlan, 'chimeraPlan.schema.json');
console.log("Validation result:", result);

// Test invalid JSON
const invalidPlan = { task_id: "test", missing_required_fields: true };
const invalidResult = validateJson<ChimeraPlan>(invalidPlan, 'chimeraPlan.schema.json');
console.log("Invalid plan result:", invalidResult);
