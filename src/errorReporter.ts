type LogLevel = 'warn' | 'error';

type NotifyType = 'info' | 'warning' | 'error';

export type NotifyFn = (message: string, type?: NotifyType) => void;

type ContextValue = string | number | boolean | null | undefined;

interface ReportOptions {
  context?: Record<string, ContextValue>;
  onceKey?: string;
  includeStack?: boolean;
  notify?: NotifyFn;
}

const reportedKeys = new Set<string>();

function isDebugEnabled(): boolean {
  const flag = process.env.REPO_MAP_DEBUG ?? process.env.PI_DEBUG ?? process.env.DEBUG;
  return flag === '1' || flag === 'true';
}

function stringifyUnknown(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatContext(context?: Record<string, ContextValue>): string {
  if (!context) return '';

  const entries = Object.entries(context).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return '';

  return entries
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ');
}

function writeLog(level: LogLevel, message: string, details?: string): void {
  const suffix = details ? ` | ${details}` : '';
  console.error(`[repo-map] ${level.toUpperCase()}: ${message}${suffix}`);
}

function shouldSkip(onceKey?: string): boolean {
  if (!onceKey) return false;
  if (reportedKeys.has(onceKey)) return true;

  reportedKeys.add(onceKey);
  return false;
}

function toNotifyType(level: LogLevel): NotifyType {
  return level === 'warn' ? 'warning' : 'error';
}

function toNotifyMessage(message: string, details?: string): string {
  return details ? `${message} (${details})` : message;
}

function report(level: LogLevel, message: string, error?: unknown, options?: ReportOptions): void {
  if (shouldSkip(options?.onceKey)) {
    return;
  }

  const parts: string[] = [];
  const contextText = formatContext(options?.context);
  if (contextText) {
    parts.push(contextText);
  }

  if (error !== undefined) {
    const includeStack = options?.includeStack ?? (options?.notify ? false : isDebugEnabled());
    if (error instanceof Error && includeStack && error.stack) {
      parts.push(error.stack);
    } else {
      parts.push(`error=${stringifyUnknown(error)}`);
    }
  }

  const details = parts.join(' | ');
  if (options?.notify) {
    options.notify(toNotifyMessage(message, details), toNotifyType(level));
    return;
  }

  writeLog(level, message, details);
}

export function errorSignature(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}:${error.message}`;
  }

  return stringifyUnknown(error);
}

export function reportWarning(message: string, error?: unknown, options?: ReportOptions): void {
  report('warn', message, error, options);
}

export function reportError(message: string, error?: unknown, options?: ReportOptions): void {
  report('error', message, error, options);
}
