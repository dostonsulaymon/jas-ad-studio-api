import { z } from 'zod';

/**
 * OpenAI's strict Structured Outputs accepts a narrow subset of JSON Schema. zod emits
 * valid JSON Schema that the subset rejects, so the document is downgraded before it is
 * sent:
 *
 *   - length and size keywords are dropped (`maxItems`, `maxLength`, `minimum`, ...)
 *   - every property must appear in `required`
 *   - every object must set `additionalProperties: false`
 *
 * Dropping the bounds means they are no longer enforced by the provider. They are still
 * enforced by our own parse of the response, so a violation becomes one repair call
 * (source 01 §28) rather than a provider-side rejection. That is the trade, and it is
 * why `assertStrictCompatible` exists: a silent bound would be worse than a loud one.
 */

const UNSUPPORTED_KEYWORDS = [
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'pattern',
  'format',
  'default',
  'minProperties',
  'maxProperties',
  'patternProperties',
  'unevaluatedProperties',
  'contains',
  'propertyNames',
  'if',
  'then',
  'else',
  'not',
  'dependentSchemas',
  'dependentRequired',
] as const;

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Keys inside a `properties` map are property names, not schema keywords. Walking them
 * as keywords would strip a field legitimately named `pattern` or `default` and silently
 * change the contract, so the two cases are separated everywhere below.
 */
function downgradeProperties(properties: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(properties).map(([name, subschema]) => [name, downgradeSchema(subschema)]),
  );
}

function downgradeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(downgradeSchema);
  if (!isPlainObject(node)) return node;

  const out: JsonObject = {};

  for (const [key, value] of Object.entries(node)) {
    if ((UNSUPPORTED_KEYWORDS as readonly string[]).includes(key)) continue;

    out[key] = key === 'properties' && isPlainObject(value) ? downgradeProperties(value) : downgradeSchema(value);
  }

  if (isPlainObject(out['properties'])) {
    out['additionalProperties'] = false;
    out['required'] = Object.keys(out['properties']);
  }

  return out;
}

export function toStrictJsonSchema(schema: z.ZodType): JsonObject {
  const raw = z.toJSONSchema(schema, { target: 'draft-7', io: 'output' });
  const downgraded = downgradeSchema(raw);

  if (!isPlainObject(downgraded)) {
    throw new Error('Schema did not downgrade to an object');
  }

  return downgraded;
}

/** Returns every violation found, so a failure names all of them at once. */
export function findStrictViolations(schema: unknown, path = '#'): string[] {
  if (Array.isArray(schema)) {
    return schema.flatMap((item, i) => findStrictViolations(item, `${path}/${String(i)}`));
  }
  if (!isPlainObject(schema)) return [];

  const violations: string[] = [];

  for (const keyword of UNSUPPORTED_KEYWORDS) {
    if (keyword in schema) violations.push(`${path}: unsupported keyword "${keyword}"`);
  }

  const properties = isPlainObject(schema['properties']) ? schema['properties'] : undefined;

  if (properties) {
    if (schema['additionalProperties'] !== false) {
      violations.push(`${path}: additionalProperties must be false`);
    }

    const names = Object.keys(properties);
    const required = Array.isArray(schema['required']) ? schema['required'] : [];
    const missing = names.filter((name) => !required.includes(name));

    if (missing.length > 0) {
      violations.push(`${path}: every property must be required, missing ${missing.join(', ')}`);
    }

    for (const [name, subschema] of Object.entries(properties)) {
      violations.push(...findStrictViolations(subschema, `${path}/properties/${name}`));
    }
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key === 'required' || key === 'enum' || key === 'properties') continue;
    violations.push(...findStrictViolations(value, `${path}/${key}`));
  }

  return violations;
}

export function assertStrictCompatible(schema: unknown): void {
  const violations = findStrictViolations(schema);

  if (violations.length > 0) {
    throw new Error(`Schema is not strict-mode compatible:\n  ${violations.join('\n  ')}`);
  }
}
