import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MedicalRecordForm } from "./MedicalRecordForm";
import { MedicalRecordFormData, SectionMetaMap } from "@/hooks/medical-record/types";

const formData: MedicalRecordFormData = {
  motivo_consulta: "Dolor de cabeza",
  tiempo_enfermedad: "",
  forma_inicio: "",
  curso_enfermedad: "",
  historia_cronologica: "",
  antecedentes: "",
  sintomas_principales: "",
  estado_funcional_basal: "",
  estudios_previos: "",
  notas_adicionales: "",
};

const reviewedSection: SectionMetaMap = {
  motivo_consulta: {
    nombre: "motivo_consulta",
    textoActual: "Dolor de cabeza",
    textoSugeridoIa: null,
    resumenActual: "Dolor de cabeza",
    resumenSugeridoIa: null,
    estado: "revisada",
    confianza: null,
    origenDato: "paciente",
  },
};

describe("MedicalRecordForm validation state", () => {
  it("muestra por separado los tiempos de edición y validación", () => {
    render(
      <MedicalRecordForm
        formData={formData}
        onChange={vi.fn()}
        editElapsedMs={65_000}
        isEditTiming={false}
        validationElapsedMs={125_000}
        isValidationTiming
        hasValidationStarted
      />
    );

    expect(screen.getByText(/Edición pausada 01:05/)).toBeInTheDocument();
    expect(screen.getByText(/Validando 02:05/)).toBeInTheDocument();
    expect(screen.queryByText(/Tiempo ESSI/i)).not.toBeInTheDocument();
  });

  it("muestra una sección revisada como Validado y evita validarla otra vez", () => {
    render(
      <MedicalRecordForm
        formData={formData}
        sectionMeta={reviewedSection}
        onChange={vi.fn()}
        onAcceptSuggestion={vi.fn(async () => true)}
      />
    );

    expect(screen.getByRole("button", { name: "Validado" })).toBeDisabled();
  });

  it("permite validar nuevamente cuando el médico modificó el campo", async () => {
    let resolveValidation: (value: boolean) => void = () => undefined;
    const onAcceptSuggestion = vi.fn(
      () => new Promise<boolean>((resolve) => { resolveValidation = resolve; })
    );

    render(
      <MedicalRecordForm
        formData={{ ...formData, motivo_consulta: "Dolor de cabeza intenso" }}
        sectionMeta={reviewedSection}
        modifiedFields={new Set(["motivo_consulta"])}
        onChange={vi.fn()}
        onAcceptSuggestion={onAcceptSuggestion}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Validar cambios" }));
    expect(screen.getByRole("button", { name: "Validando..." })).toBeDisabled();

    resolveValidation(true);
    await waitFor(() =>
      expect(onAcceptSuggestion).toHaveBeenCalledWith("motivo_consulta", undefined)
    );
  });

  it("permite marcar un campo vacío como no referido", async () => {
    const onAcceptSuggestion = vi.fn(async () => true);

    render(
      <MedicalRecordForm
        formData={formData}
        onChange={vi.fn()}
        onAcceptSuggestion={onAcceptSuggestion}
        validationWarnings={["Falta completar Tiempo de enfermedad"]}
      />
    );

    const buttons = screen.getAllByRole("button", { name: "No referido" });
    expect(buttons[0]).toBeEnabled();
    fireEvent.click(buttons[0]);

    await waitFor(() =>
      expect(onAcceptSuggestion).toHaveBeenCalledWith("tiempo_enfermedad", "No referido")
    );
  });
});
