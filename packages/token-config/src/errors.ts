export class TokenConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenConfigError";
  }
}

export function fail(message: string): never {
  throw new TokenConfigError(message);
}
