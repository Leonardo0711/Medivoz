
import api from "@/lib/api";
import { logger } from "@/utils/logger";

// Fetch transcription data from the session
export const fetchTranscriptionData = async (sessionId: string) => {
  try {
    const response = await api.get(`/clinical/consultations/${sessionId}`);
    const data = response.data;

    if (data && data.transcripcion) {
      return data.transcripcion;
    }
    return null;
  } catch (error) {
    logger.error("Error fetching transcription:", error);
    return null;
  }
};
