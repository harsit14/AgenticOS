// Application-level errors that map to HTTP responses in the global error handler.

export class NotFoundError extends Error {
  constructor(message: string, public resource?: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class InvalidInputError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'InvalidInputError';
  }
}
