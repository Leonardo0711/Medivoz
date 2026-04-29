
/**
 * Determines the best supported audio MIME type for the browser
 * @returns The best supported MIME type or empty string if none is supported
 */
import { logger } from '@/utils/logger';

export const getBestSupportedMimeType = (): string => {
  const mimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg'
  ];
  
  for (const type of mimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      logger.log("Using MIME type:", type);
      return type;
    }
  }
  
  logger.warn("No supported MIME types found, using default");
  return '';  // Let browser choose default
};

/**
 * Creates a safe listener for audio elements that can be properly removed
 * @param handler - The event handler function
 * @returns A function that can be used as an event listener
 */
export const createSafeAudioErrorListener = (handler: (error: MediaError | null) => void) => {
  return (event: Event) => {
    const audioElement = event.target as HTMLAudioElement;
    handler(audioElement.error);
  };
};
