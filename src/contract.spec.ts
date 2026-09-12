import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/**
 * Guards the contract the web repo generates its client from (D-031).
 *
 * T-09 found `openapi.json` documenting 15 routes with no shapes at all, and the fix was
 * per-route DTOs. This is the same failure one level down: a route can carry a documented
 * body and still describe its most important field as `{}`, which a generated client
 * renders as `any`. `GenerationDetailDto.package.result` was exactly that until P5's
 * backend pass — the ad package, on the one screen the studio exists to show.
 *
 * A schema-shaped assertion rather than a list of known-good fields, so a field added
 * later cannot quietly arrive untyped.
 */

interface Node {
  properties?: Record<string, Node>;
  items?: Node;
  anyOf?: Node[];
  oneOf?: Node[];
  allOf?: Node[];
}

function untypedFields(schemas: Record<string, Node>): string[] {
  const found: string[] = [];

  const walk = (node: Node | undefined, path: string): void => {
    if (!node || typeof node !== 'object') return;

    for (const [key, value] of Object.entries(node.properties ?? {})) {
      // An empty schema object is "anything": no type, no ref, no composition.
      if (Object.keys(value).length === 0) {
        found.push(`${path}.${key}`);
      } else {
        walk(value, `${path}.${key}`);
      }
    }

    walk(node.items, `${path}[]`);
    for (const branch of ['anyOf', 'oneOf', 'allOf'] as const) {
      node[branch]?.forEach((child, index) => {
        walk(child, `${path}.${branch}${String(index)}`);
      });
    }
  };

  for (const [name, schema] of Object.entries(schemas)) walk(schema, name);
  return found;
}

function contract(): { components: { schemas: Record<string, Node> }; paths: Record<string, Record<string, unknown>> } {
  return JSON.parse(readFileSync('openapi.json', 'utf8')) as ReturnType<typeof contract>;
}

it('describes every field of every schema, with nothing left as `any`', () => {
  const untyped = untypedFields(contract().components.schemas);

  expect(untyped, `untyped fields would reach the web client as \`any\`: ${untyped.join(', ')}`).toEqual(
    [],
  );
});

it('types the ad package itself — the payload P5 renders', () => {
  const schemas = contract().components.schemas;
  const result = schemas.GenerationDetailDto?.properties?.package?.properties?.result;

  // Not a smoke test: these are the fields the inline result screen reads.
  expect(Object.keys(result?.properties ?? {})).toEqual(
    expect.arrayContaining(['status', 'concept', 'shots', 'promptEn', 'product']),
  );
  expect(Object.keys(result?.properties?.shots?.items?.properties ?? {})).toEqual(
    expect.arrayContaining(['startSeconds', 'endSeconds', 'descriptionUz', 'cameraUz']),
  );
});

/**
 * Routes whose only inputs are the path and the headers. Listed explicitly rather than
 * matched by a pattern, so adding one is a decision somebody made rather than a regex
 * quietly widening.
 */
const BODYLESS_WRITES = new Set([
  'POST /api/auth/logout',
  'POST /api/orders/{id}/cancel',
  'POST /api/owner/orders/{id}/confirm',
  // Takes the project from the path and the retry key from Idempotency-Key (§32).
  'POST /api/projects/{id}/generations',
]);

it('gives every state-changing route a documented request body', () => {
  const missing: string[] = [];

  for (const [path, methods] of Object.entries(contract().paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!['post', 'patch', 'put'].includes(method)) continue;

      const route = `${method.toUpperCase()} ${path}`;
      const op = operation as { requestBody?: unknown };
      if (!op.requestBody && !BODYLESS_WRITES.has(route)) missing.push(route);
    }
  }

  expect(missing, `no request body documented: ${missing.join(', ')}`).toEqual([]);
});

/**
 * Every field that is nullable in a zod schema must reach the client as a nullable
 * scalar, not as an array.
 *
 * zod 4 emits a nullable as JSON Schema's `type: ["string","null"]`, which OpenAPI 3.0
 * cannot express, and the conversion read that type array as `type: "array"`. So
 * `messageUz`, `errorCode`, `payerReference` and `rejectionReason` were all `string[]`
 * in the contract — `payerReference` since P3 merged — and a generated client would have
 * rendered a nullable string as a list. `repairNullableFields` in bootstrap.ts undoes it;
 * this is what stops it coming back.
 */
const MUST_BE_NULLABLE_SCALARS: [string, string][] = [
  ['GenerationDetailDto', 'messageUz'],
  ['GenerationDetailDto', 'errorCode'],
  ['GenerationDetailDto', 'finishedAt'],
  ['CreditOrderSummaryDto', 'payerReference'],
  ['CreditOrderSummaryDto', 'rejectionReason'],
  ['CreditOrderSummaryDto', 'confirmedAt'],
  ['OwnerOrderDto', 'payerReference'],
  ['AdminPackDto', 'priceUzs'],
];

it('spells a nullable field as a nullable scalar, never as an array', () => {
  const schemas = contract().components.schemas as Record<
    string,
    { properties?: Record<string, { type?: unknown; nullable?: boolean }> }
  >;

  const wrong: string[] = [];
  for (const [dto, field] of MUST_BE_NULLABLE_SCALARS) {
    const property = schemas[dto]?.properties?.[field];
    if (!property) {
      wrong.push(`${dto}.${field} is missing`);
    } else if (property.type === 'array') {
      wrong.push(`${dto}.${field} is an array`);
    } else if (property.nullable !== true) {
      wrong.push(`${dto}.${field} is not marked nullable`);
    }
  }

  expect(wrong, wrong.join('; ')).toEqual([]);
});

it('leaves genuine arrays alone', () => {
  const schemas = contract().components.schemas as Record<
    string,
    { properties?: Record<string, { type?: unknown; items?: unknown; nullable?: boolean }> }
  >;

  // The repair keys on a marker nestjs-zod leaves only on what it mangled, so a real
  // array must come through untouched — otherwise the fix would be worse than the bug.
  const questions = schemas.GenerationDetailDto?.properties?.questionsUz;
  expect(questions?.type).toBe('array');
  expect(questions?.items).toBeDefined();
  expect(questions?.nullable).toBeUndefined();
});
