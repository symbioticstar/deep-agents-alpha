export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

function format(message: string, data?: unknown): string {
  if (data === undefined) {
    return message;
  }

  try {
    return `${message} ${JSON.stringify(data)}`;
  } catch {
    return `${message} [unserializable-data]`;
  }
}

export function createLogger(debugEnabled: boolean): Logger {
  return {
    debug(message, data) {
      if (!debugEnabled) {
        return;
      }
      console.error(`[DEBUG] ${format(message, data)}`);
    },
    info(message, data) {
      console.error(`[INFO] ${format(message, data)}`);
    },
    warn(message, data) {
      console.error(`[WARN] ${format(message, data)}`);
    },
    error(message, data) {
      console.error(`[ERROR] ${format(message, data)}`);
    },
  };
}
