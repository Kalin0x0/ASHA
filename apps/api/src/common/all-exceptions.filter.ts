import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { BugReportsService } from '../modules/bug-reports/bug-reports.service';

interface ReqLike {
  url?: string;
  method?: string;
  headers?: Record<string, string | undefined>;
  user?: { sub?: string; orgId?: string; email?: string };
}

/**
 * Catches every unhandled exception. Expected 4xx HttpExceptions pass straight
 * through with their normal response. Anything 5xx / non-HTTP is an unexpected
 * crash: we best-effort record an AUTOMATIC bug report (error code + log +
 * fingerprint) and return a clean JSON 500 carrying the quotable error code.
 *
 * The filter never throws — recording a crash must not cause another one.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly bugs: BugReportsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // Only HTTP requests have a response to reply to. For WS/RPC contexts, log
    // and let the framework's default handling take over.
    if (host.getType() !== 'http') {
      this.logger.error(`Non-HTTP exception: ${(exception as Error)?.message ?? exception}`);
      throw exception;
    }

    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<ReqLike>();
    const res = ctx.getResponse();

    const isHttp = exception instanceof HttpException;
    const statusCode = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Expected client errors (4xx) are part of normal operation — relay as-is.
    if (isHttp && statusCode < HttpStatus.INTERNAL_SERVER_ERROR) {
      httpAdapter.reply(res, exception.getResponse(), statusCode);
      return;
    }

    const err = exception as Error;
    this.logger.error(`${req?.method ?? ''} ${req?.url ?? ''} → ${err?.message ?? exception}`, err?.stack);

    // Best-effort capture into the fix-memory pipeline; returns the quotable code
    // synchronously while the row is written in the background.
    let errorCode: string | undefined;
    try {
      errorCode = this.bugs.recordAutomatic(
        req?.user?.orgId ?? null,
        {
          errorName: err?.name ?? 'Error',
          message: err?.message ?? 'Unhandled exception',
          stack: err?.stack,
          route: req?.url,
          component: 'api',
          httpStatus: statusCode,
          userAgent: req?.headers?.['user-agent'],
        },
        req?.user?.sub ? { id: req.user.sub, email: req.user.email } : undefined,
      ).errorCode;
    } catch {
      /* never let capture failures escape the filter */
    }

    const body = {
      statusCode,
      error: 'Internal Server Error',
      message:
        'An unexpected error occurred and has been reported automatically. Reference this code when contacting support.',
      ...(errorCode ? { errorCode } : {}),
      timestamp: new Date().toISOString(),
      path: req?.url,
    };
    httpAdapter.reply(res, body, statusCode);
  }
}
