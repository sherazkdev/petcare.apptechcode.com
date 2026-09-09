export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function jsonError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(errorBody(error.code, error.message), { status: error.status });
  }
  console.error(error);
  return Response.json(errorBody("INTERNAL", "Unexpected"), { status: 500 });
}
