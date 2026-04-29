
export const createTimeoutController = (timeoutMs: number = 30000): {
  controller: AbortController;
  timeoutId: number;
  clearTimeout: () => void;
} => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs) as unknown as number;
  
  return {
    controller,
    timeoutId,
    clearTimeout: () => clearTimeout(timeoutId)
  };
};
