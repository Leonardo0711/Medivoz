import { describe, it, expect } from 'vitest';
import type { MedicalRecordFormData, PatientData } from './types';

describe('MedicalRecordFormData type', () => {
  it('accepts a valid medical record form data object', () => {
    const formData: MedicalRecordFormData = {
      motivo_consulta: 'Cefalea intensa',
      tiempo_enfermedad: '3 días',
      forma_inicio: 'Súbito',
      curso_enfermedad: 'Progresivo',
      historia_cronologica: 'Paciente refiere cefalea de inicio súbito hace 3 días',
      antecedentes: 'HTA diagnosticada hace 5 años',
      sintomas_principales: 'Cefalea, náuseas',
      estado_funcional_basal: 'Autosuficiente',
      estudios_previos: 'TAC cerebral sin contraste: normal',
      notas_adicionales: 'Paciente ansioso',
    };

    expect(formData.motivo_consulta).toBe('Cefalea intensa');
    expect(Object.keys(formData)).toHaveLength(10);
  });

  it('accepts empty strings for all fields', () => {
    const emptyForm: MedicalRecordFormData = {
      motivo_consulta: '',
      tiempo_enfermedad: '',
      forma_inicio: '',
      curso_enfermedad: '',
      historia_cronologica: '',
      antecedentes: '',
      sintomas_principales: '',
      estado_funcional_basal: '',
      estudios_previos: '',
      notas_adicionales: '',
    };

    expect(Object.values(emptyForm).every(v => v === '')).toBe(true);
  });
});

describe('PatientData type', () => {
  it('accepts full patient data', () => {
    const patient: PatientData = {
      nombre: 'Juan Pérez',
      edad: 45,
      ocupacion: 'Ingeniero',
      procedencia: 'Lima',
    };

    expect(patient.nombre).toBe('Juan Pérez');
    expect(patient.edad).toBe(45);
  });

  it('accepts nullable fields as null', () => {
    const patient: PatientData = {
      nombre: 'María López',
      edad: null,
      ocupacion: null,
      procedencia: null,
    };

    expect(patient.nombre).toBe('María López');
    expect(patient.edad).toBeNull();
    expect(patient.ocupacion).toBeNull();
    expect(patient.procedencia).toBeNull();
  });
});
