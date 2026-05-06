// lib/errors.ts
//
// Typed error classes thrown across the app. Catchers should narrow on
// instanceof or on the static `code` property. Don't swallow these.

export class RallyError extends Error {
  static readonly code: string = "RALLY_ERROR";

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AuthorizationError extends RallyError {
  static readonly code = "AUTHORIZATION_ERROR";
}

export class NotFoundError extends RallyError {
  static readonly code = "NOT_FOUND";
}

export class ValidationError extends RallyError {
  static readonly code = "VALIDATION_ERROR";
}

export class AgentRefusalError extends RallyError {
  static readonly code = "AGENT_REFUSAL";
}

export class AgentSchemaError extends RallyError {
  static readonly code = "AGENT_SCHEMA";
}

export class AgentRateLimitError extends RallyError {
  static readonly code = "AGENT_RATE_LIMIT";
}

export type RedactionErrorCode =
  | "REDACTION_FAILED"
  | "UNREDACTABLE_INPUT"
  | "NAME_AND_DOB_PRESENT";

export class RedactionError extends RallyError {
  readonly code: RedactionErrorCode;

  constructor(message: string, code: RedactionErrorCode) {
    super(message);
    this.code = code;
  }
}
