// workslo/fleet#9. The V1 input decoders checked primitive types but not content or size:
// empty and whitespace-only required fields, unbounded text and arrays, and an
// `Idempotency-Key` checked only for presence. Every limit lives here once, so the HTTP
// contract, the Worker boundary and the D1 floor cannot drift apart.
//
// Sizes are UTF-8 bytes, because bytes are what D1 stores and what a trigger can measure
// with length(CAST(value AS BLOB)). A decoder returns the TRIMMED value and callers store
// that: a floor that requires trim(value) <> '' can only hold if the Worker writes the
// trimmed bytes it validated.

export const V1_LIMITS = {
  idempotency_key: 255,
  identifier: 64,
  slug: 64,
  title: 200,
  summary: 500,
  detail: 4_000,
  plan: 20_000,
  uri: 2_000,
  envelope_items: 50,
  evidence_items: 20,
} as const;

// Canonical V1 slug syntax: lowercase alphanumeric words joined by single hyphens, with
// no leading, trailing or doubled hyphen. The trigger in migration 0008 enforces the same
// shape with GLOB and instr(); the two are asserted against each other in
// worker/test/bounded-inputs.spec.ts.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const encoder = new TextEncoder();

export function byteLength(value: string): number {
  return encoder.encode(value).length;
}

/** A required human field: a string that is non-blank once trimmed and within `max` bytes. */
export function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && byteLength(trimmed) <= max ? trimmed : null;
}

export function boundedIdentifier(value: unknown): string | null {
  return boundedText(value, V1_LIMITS.identifier);
}

export function boundedSlug(value: unknown): string | null {
  const slug = boundedText(value, V1_LIMITS.slug);
  return slug !== null && SLUG_PATTERN.test(slug) ? slug : null;
}

/** An array of required human fields. Empty is allowed; blank entries are not. */
export function boundedTextArray(value: unknown, maxItems: number, maxBytes: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const entries: string[] = [];
  for (const entry of value) {
    const text = boundedText(entry, maxBytes);
    if (text === null) return null;
    entries.push(text);
  }
  return entries;
}

/** An evidence or artifact link: http/https only, bounded, and returned trimmed. */
export function boundedHttpUri(value: unknown): string | null {
  const uri = boundedText(value, V1_LIMITS.uri);
  if (uri === null) return null;
  try {
    const protocol = new URL(uri).protocol;
    return protocol === "http:" || protocol === "https:" ? uri : null;
  } catch {
    return null;
  }
}

/** The logical-operation key. Bounded here because it is a primary-key column an
 *  authenticated seat can grow without limit. */
export function idempotencyKey(request: Request): string | null {
  return boundedText(request.headers.get("Idempotency-Key"), V1_LIMITS.idempotency_key);
}

export const IDEMPOTENCY_KEY_MESSAGE =
  `Idempotency-Key is required and must be non-blank and at most ${V1_LIMITS.idempotency_key} bytes`;
