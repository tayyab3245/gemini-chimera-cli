import Ajv from 'ajv';
import addFormats from 'ajv-formats';                // ← NEW: adds date‑time etc.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */
export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}

/**
 * Validate `json` against a JSON‑Schema file.
 *
 * The helper tries two locations so it works **before** and **after** compilation:
 *   1.  <repo>/packages/core/src/schemas/…
 *   2.  <repo>/packages/core/dist/schemas/…
 *
 * @param json          Parsed JSON to validate
 * @param schemaFile    File name (e.g. `"chimeraPlan.schema.json"`)
 */
export function validateJson<T>(json: unknown,
                                schemaFile: string): ValidationResult {
  /* ---------- find the schema file ---------- */
  const here = dirname(fileURLToPath(import.meta.url));          // e.g. …/core/src/utils
  const candidatePaths = [
    resolve(here, '..', 'schemas', schemaFile),                  // src build
    resolve(here, '..', '..', 'schemas', schemaFile),            // dist build
  ];

  const schemaPath = candidatePaths.find(existsSync);
  if (!schemaPath) {
    return { ok: false, errors: [`Schema "${schemaFile}" not found`] };
  }

  /* ---------- compile & validate ---------- */
  const ajv = new (Ajv as any)({ allErrors: true, strict: false });
  (addFormats as any)(ajv);                                               // enables date‑time, uri, …

  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const validate = ajv.compile(schema);

  const valid = validate(json);
  return valid
    ? { ok: true }
    : {
        ok: false,
        errors: (validate.errors ?? []).map(
          (e: any) => `${e.instancePath || '(root)'} ${e.message}`
        ),
      };
}
