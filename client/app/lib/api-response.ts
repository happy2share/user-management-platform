import { NextResponse } from "next/server";

export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    totalItems?: number;
    totalPages?: number;
    hasNext?: boolean;
    requestId?: string;
    timestamp?: string;
    message?: string;
  };
  links?: {
    self?: string;
    next?: string | null;
    prev?: string | null;
  };
}

const ERROR_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "VALIDATION_ERROR",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_SERVER_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
};

type LegacyError = { error: string; code?: string; details?: unknown };

function envelope<T>(body: T | LegacyError, status = 200): ApiResponse<T> {
  const timestamp = new Date().toISOString();

  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    const { error, code, details, ...rest } = body as LegacyError &
      Record<string, unknown>;
    const extraDetails =
      details ?? (Object.keys(rest).length ? rest : undefined);
    return {
      error: {
        code: code || ERROR_CODES[status] || "REQUEST_FAILED",
        message: error,
        ...(extraDetails === undefined ? {} : { details: extraDetails }),
      },
      meta: { timestamp },
    };
  }

  return { data: body as T, meta: { timestamp } };
}

export const ApiNextResponse = {
  json<T>(body: T | LegacyError, init?: ResponseInit) {
    return NextResponse.json(envelope(body, init?.status), init);
  },
};

export async function readApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (body.error) {
    const details = body.error.details;
    return {
      ...(details && typeof details === "object" ? details : {}),
      error: body.error.message,
      errorCode: body.error.code,
      errorDetails: body.error.details,
      meta: body.meta,
    } as T;
  }
  return body.data as T;
}
