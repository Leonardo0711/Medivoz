/**
 * Logger utility that only logs in development mode
 * In production, errors are sent to Sentry
 */
import * as Sentry from '@sentry/react';

interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

class LoggerService implements Logger {
  private isDev = import.meta.env.DEV;
  private isProd = import.meta.env.PROD;

  log(...args: unknown[]): void {
    if (this.isDev) {
      console.log(...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.isDev) {
      console.error(...args);
    } else if (this.isProd) {
      console.error('[Error]', ...args);
      // Send to Sentry in production
      const error = args.find(arg => arg instanceof Error);
      if (error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(args.map(String).join(' '), 'error');
      }
    }
  }

  warn(...args: unknown[]): void {
    if (this.isDev) {
      console.warn(...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.isDev) {
      console.info(...args);
    }
  }

  debug(...args: unknown[]): void {
    if (this.isDev) {
      console.debug(...args);
    }
  }

  // Helper for structured logging
  group(label: string, collapsed = false): void {
    if (this.isDev) {
      if (collapsed) {
        console.groupCollapsed(label);
      } else {
        console.group(label);
      }
    }
  }

  groupEnd(): void {
    if (this.isDev) {
      console.groupEnd();
    }
  }

  // Helper for timing operations
  time(label: string): void {
    if (this.isDev) {
      console.time(label);
    }
  }

  timeEnd(label: string): void {
    if (this.isDev) {
      console.timeEnd(label);
    }
  }
}

export const logger = new LoggerService();

// Export default for convenience
export default logger;
