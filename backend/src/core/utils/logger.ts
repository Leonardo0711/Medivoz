export const logger = {
  log: (...args: any[]) => console.log(`[LOG] ${new Date().toISOString()}:`, ...args),
  error: (...args: any[]) => console.error(`[ERROR] ${new Date().toISOString()}:`, ...args),
  warn: (...args: any[]) => console.warn(`[WARN] ${new Date().toISOString()}:`, ...args),
  info: (...args: any[]) => console.info(`[INFO] ${new Date().toISOString()}:`, ...args),
};
