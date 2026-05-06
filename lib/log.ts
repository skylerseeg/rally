// lib/log.ts
//
// Single logging surface for Rally. Per CLAUDE.md privacy rules, NEVER
// log raw `members` rows or any prompt body — pass redacted/summarised
// fields only.
//
// v1: structured JSON to console. Server-side error reporting (with
// allowlist scrubbing) plugs in here later.

type LogFields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", fields: LogFields): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    };
  }
  return { error: { value: String(err) } };
}

export const log = {
  info(fields: LogFields): void {
    emit("info", fields);
  },
  warn(fields: LogFields): void {
    emit("warn", fields);
  },
  error(fields: LogFields & { err?: unknown }): void {
    const { err, ...rest } = fields;
    emit("error", err === undefined ? rest : { ...rest, ...serializeError(err) });
  },
};
