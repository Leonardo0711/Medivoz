import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionTemplateCard } from "./SessionTemplateCard";
import { AnamnesisTemplate } from "@/types/anamnesis-templates";

const templates: AnamnesisTemplate[] = [
  {
    id: "template-reumatologia",
    especialidadId: 13,
    especialidad: "Reumatologia",
    nombre: "Ficha de Reumatologia",
    descripcion: "Anamnesis orientada al patrón articular y la limitación funcional.",
    numeroVersion: 1,
    esPredeterminada: true,
    secciones: [],
  },
  {
    id: "template-neurologia",
    especialidadId: 4,
    especialidad: "Neurologia",
    nombre: "Ficha de Neurologia",
    descripcion: "Anamnesis orientada al inicio temporal y déficit focal.",
    numeroVersion: 1,
    esPredeterminada: false,
    secciones: [],
  },
];

describe("SessionTemplateCard", () => {
  it("muestra la ficha elegida y su contexto clinico", () => {
    render(
      <SessionTemplateCard
        templates={templates}
        selectedTemplateId="template-reumatologia"
        isLoading={false}
        isSaving={false}
        onTemplateChange={vi.fn()}
      />
    );

    expect(screen.getByRole("combobox", { name: "Seleccionar ficha de anamnesis" })).toHaveTextContent(
      "Reumatología"
    );
    expect(screen.getByText("Anamnesis orientada al patrón articular y la limitación funcional.")).toBeInTheDocument();
  });

  it("bloquea el cambio cuando la documentacion ya comenzo", () => {
    render(
      <SessionTemplateCard
        templates={templates}
        selectedTemplateId="template-reumatologia"
        isLoading={false}
        isSaving={false}
        disabled
        onTemplateChange={vi.fn()}
      />
    );

    expect(screen.getByRole("combobox", { name: "Seleccionar ficha de anamnesis" })).toBeDisabled();
    expect(screen.getByText("La ficha queda fijada cuando comienza la documentación de la consulta.")).toBeInTheDocument();
  });
});
