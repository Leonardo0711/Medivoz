
/**
 * Utility functions for blob handling and conversion
 */
import { logger } from "@/utils/logger";

/**
 * Converts a Blob to base64 string
 * @param blob - The audio blob to convert
 * @returns A promise that resolves to a base64 string
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Remove data URL prefix
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error("FileReader result is not a string"));
      }
    };
    reader.onerror = (event) => {
      logger.error("FileReader error:", reader.error);
      reject(new Error("FileReader error: " + (reader.error?.message || "Unknown error")));
    };
    reader.readAsDataURL(blob);
  });
};

/**
 * Validates an audio blob
 * @param blob - The audio blob to validate
 * @returns True if the blob is valid, false otherwise
 */
export const validateAudioBlob = (blob: Blob | null): boolean => {
  if (!blob) {
    logger.error("Audio blob is null");
    return false;
  }
  
  if (blob.size === 0) {
    logger.error("Audio blob size is 0");
    return false;
  }
  
  // Check if the MIME type is valid
  const validTypes = [
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/wav',
    'audio/mpeg'
  ];
  
  if (!validTypes.includes(blob.type) && blob.type !== '') {
    // Some browsers use codec-specific MIME types like "audio/webm;codecs=opus" which is valid
    // Only warn if it's truly unexpected
    if (!blob.type.includes('webm') && !blob.type.includes('ogg') && !blob.type.includes('mp4')) {
      logger.warn("Unexpected audio MIME type:", blob.type);
    }
  }
  
  // Use logger instead of direct console.log
  logger.log(`Audio blob validated: ${blob.size} bytes, type: ${blob.type}`);
  return true;
};

/**
 * Creates a blob URL from a blob
 * @param blob - The blob to create a URL for
 * @returns The created URL or null if the blob is invalid
 */
export const createBlobURL = (blob: Blob | null): string | null => {
  if (!validateAudioBlob(blob)) {
    return null;
  }
  
  const url = URL.createObjectURL(blob);
  logger.log("Created audio URL:", url);
  return url;
};

/**
 * Revokes a blob URL
 * @param url - The URL to revoke
 */
export const revokeBlobURL = (url: string | null): void => {
  if (url) {
    URL.revokeObjectURL(url);
    logger.log("Revoked audio URL:", url);
  }
};
