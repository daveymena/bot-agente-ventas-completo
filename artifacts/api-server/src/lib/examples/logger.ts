export const logger = {
  info: (meta: any, message: string) => {
    console.log(`[INFO] ${message}`, meta);
  },
  warn: (meta: any, message: string) => {
    console.warn(`[WARN] ${message}`, meta);
  },
  error: (meta: any, message: string) => {
    console.error(`[ERROR] ${message}`, meta);
  },
};