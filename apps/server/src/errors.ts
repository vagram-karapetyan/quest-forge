export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly params: Record<string, string | number | boolean>;

  constructor(
    statusCode: number,
    code: string,
    params: Record<string, string | number | boolean> = {},
  ) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
    this.params = params;
  }
}
