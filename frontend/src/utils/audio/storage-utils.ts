import { logger } from "@/utils/logger";

const ephemeralAudioUrls = new Map<string, string>();

const getExtensionFromMimeType = (mimeType: string): string => {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
};

/**
 * Temporal client-side fallback for audio storage.
 * The production path is backend-managed ephemeral storage.
 */
export async function uploadAudioToStorage(
  audioBlob: Blob,
  sessionId: string,
  doctorId: string
): Promise<string | null> {
  if (!audioBlob || audioBlob.size === 0) {
    logger.warn("Skipping audio storage: empty blob");
    return null;
  }

  const extension = getExtensionFromMimeType(audioBlob.type || "");
  const key = `${doctorId}/${sessionId}.${extension}`;

  try {
    const previous = ephemeralAudioUrls.get(key);
    if (previous) URL.revokeObjectURL(previous);

    const objectUrl = URL.createObjectURL(audioBlob);
    ephemeralAudioUrls.set(key, objectUrl);
    return key;
  } catch (error) {
    logger.error("Failed to keep temporary audio URL in memory:", error);
    return null;
  }
}

export async function getAudioUrl(storagePath: string): Promise<string | null> {
  return ephemeralAudioUrls.get(storagePath) || null;
}
