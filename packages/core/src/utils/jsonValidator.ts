import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}

/**
 * Validates an unknown JSON value against a JSON‑Schema file.
 * @param json          parsed JSON to validate
 * @param schemaRelPath path *relative to the core package root*
 */
export function validateJson<T>(
  json: unknown,
  schemaRelPath: string,
): ValidationResult {
  const ajv = new (Ajv as any)({ allErrors: true, strict: false });

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const schemaAbs = join(__dirname, '../../../schemas', schemaRelPath);
  const schemaRaw = readFileSync(schemaAbs, 'utf-8');
  const schema = JSON.parse(schemaRaw);
  const validate = ajv.compile(schema);

  const ok = validate(json);
  if (ok) return { ok: true };
  return {
    ok: false,
    errors: (validate.errors ?? []).map((e: any) => `${e.instancePath} ${e.message}`),
  };
}
