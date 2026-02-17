type LogLevel = 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function writeLog(level: LogLevel, message: string, context?: LogContext): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(message: string, context?: LogContext): void {
  writeLog('info', message, context);
}

export function logWarn(message: string, context?: LogContext): void {
  writeLog('warn', message, context);
}

export function logError(message: string, context?: LogContext): void {
  writeLog('error', message, context);
}
