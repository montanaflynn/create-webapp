// Domain errors raised by the service layer. Adapters (server actions, REST,
// CLI, MCP) translate these into their own error shapes — HTTP status codes,
// form errors, MCP tool responses, etc. Services never know what surface
// called them.

export class NotFoundError extends Error {
  constructor(
    public readonly resource: string,
    public readonly id?: string,
  ) {
    super(id ? `${resource} ${id} not found` : `${resource} not found`);
    this.name = "NotFoundError";
  }
}

export type ValidationIssue = {
  path: string[];
  message: string;
};

export class ValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues[0]?.message ?? "Invalid input");
    this.name = "ValidationError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}
