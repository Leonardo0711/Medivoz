
// This file re-exports all the medical record API functions for backward compatibility
import { MedicalRecordFormData, PatientData } from "./types";
import { fetchTranscriptionData } from "./transcription-api";
import { fetchPatientData } from "./patient-api";
import { checkRecordExists, fetchExistingRecord } from "./record-operations-api";
import { saveMedicalRecord } from "./save-record-api";

// Re-export all types and functions
export type { MedicalRecordFormData, PatientData };
export {
  fetchTranscriptionData,
  checkRecordExists,
  fetchExistingRecord,
  fetchPatientData,
  saveMedicalRecord
};
