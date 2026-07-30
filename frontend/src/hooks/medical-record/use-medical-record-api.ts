
// This file re-exports all the medical record API functions for backward compatibility
import { MedicalRecordFormData, PatientData, RecordSummaryData, SectionMetaMap } from "./types";
import { fetchTranscriptionData } from "./transcription-api";
import { fetchPatientData } from "./patient-api";
import {
  checkRecordExists,
  fetchExistingRecord,
  fetchRecordValidation,
  refineMedicalRecordSection,
  retryMedicalRecordSection,
  reviewMedicalRecordSection,
} from "./record-operations-api";
import { saveMedicalRecord } from "./save-record-api";

// Re-export all types and functions
export type { MedicalRecordFormData, PatientData, RecordSummaryData, SectionMetaMap };
export {
  fetchTranscriptionData,
  checkRecordExists,
  fetchExistingRecord,
  fetchRecordValidation,
  fetchPatientData,
  refineMedicalRecordSection,
  retryMedicalRecordSection,
  reviewMedicalRecordSection,
  saveMedicalRecord
};
