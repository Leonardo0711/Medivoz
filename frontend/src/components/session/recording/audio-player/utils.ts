
/**
 * Formats time in seconds to a string in the format MM:SS
 * @param time Time in seconds
 * @returns Formatted time string
 */
export const formatTime = (time: number): string => {
  if (isNaN(time) || !isFinite(time)) {
    return "00:00";
  }
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Creates a safe audio error listener
 * @param handler The handler function to call with error info
 * @returns Event listener function
 */
export const createAudioErrorListener = (handler: (event: Event) => void) => {
  return (event: Event) => {
    handler(event);
  };
};
