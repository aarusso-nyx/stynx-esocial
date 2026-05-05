import { Injectable } from '@nestjs/common';

export type SubmissionRetryStatus = 'RETRY' | 'TIMEOUT' | 'REJECTED';

export interface RetryDecision {
  transient: boolean;
  status: SubmissionRetryStatus;
  reason: string;
  httpStatus: number | null;
  countsForCircuit: boolean;
}

interface ErrorLike {
  code?: string;
  message?: string;
  response?: {
    status?: number;
    statusCode?: number;
    data?: unknown;
  };
  status?: number;
  statusCode?: number;
  body?: unknown;
}

const TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNABORTED',
  'EAI_AGAIN',
]);

@Injectable()
export class RetryStrategyService {
  classify(error: unknown): RetryDecision {
    const errorLike = this.toErrorLike(error);
    const code = errorLike.code?.toUpperCase();
    const message = this.errorText(errorLike);
    const httpStatus = this.httpStatus(errorLike);

    if (code && TIMEOUT_CODES.has(code)) {
      return {
        transient: true,
        status: 'TIMEOUT',
        reason: message || code,
        httpStatus,
        countsForCircuit: true,
      };
    }

    if (httpStatus && (httpStatus === 429 || httpStatus >= 500)) {
      return {
        transient: true,
        status: 'RETRY',
        reason: message || `HTTP ${httpStatus}`,
        httpStatus,
        countsForCircuit: true,
      };
    }

    if (
      /\b(processamento|tempor[aá]ri[ao]|indispon[ií]vel|timeout)\b/i.test(
        message,
      )
    ) {
      return {
        transient: true,
        status: 'RETRY',
        reason: message,
        httpStatus,
        countsForCircuit: true,
      };
    }

    return {
      transient: false,
      status: 'REJECTED',
      reason: message || 'Definitive SOAP submission fault',
      httpStatus,
      countsForCircuit: false,
    };
  }

  nextAttemptAt(
    attempts: number,
    now = new Date(),
    jitterUnit = Math.random(),
  ): Date {
    const boundedAttempts = Math.max(1, Math.min(attempts, 8));
    const baseDelayMs = Math.min(1000 * 2 ** (boundedAttempts - 1), 300_000);
    const jitterMs = Math.trunc(
      baseDelayMs * 0.2 * Math.max(0, Math.min(jitterUnit, 1)),
    );
    return new Date(now.getTime() + baseDelayMs + jitterMs);
  }

  private toErrorLike(error: unknown): ErrorLike {
    if (error && typeof error === 'object') return error as ErrorLike;
    return { message: this.unknownText(error) };
  }

  private httpStatus(error: ErrorLike): number | null {
    const candidate =
      error.response?.status ??
      error.response?.statusCode ??
      error.status ??
      error.statusCode;
    return typeof candidate === 'number' ? candidate : null;
  }

  private errorText(error: ErrorLike): string {
    const fragments = [
      error.message,
      this.bodyText(error.body),
      this.bodyText(error.response?.data),
    ].filter(Boolean);
    return fragments.join(' ').slice(0, 1000);
  }

  private bodyText(body: unknown): string {
    if (typeof body === 'string') return body;
    if (!body || typeof body !== 'object') return '';
    try {
      return JSON.stringify(body);
    } catch {
      return '';
    }
  }

  private unknownText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return this.bodyText(value);
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value.toString();
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'symbol') return value.description ?? '';
    return '';
  }
}
