import * as Sentry from '@sentry/node';

let initialized = false;

export function initMonitoring(): void {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  });
}

export function captureServerException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) initMonitoring();
  if (!process.env.SENTRY_DSN) return;

  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(error);
  });
}
