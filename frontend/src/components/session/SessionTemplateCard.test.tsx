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
    numeroVersion: 2,
    esPredeterminada: true,
    secciones: [],
  },
  {
    id: "template-reumatologia-anterior",
    especialidadId: 13,
    especialidad: "Reumatologia",
    nombre: "Ficha breve de Reumatologia",
    descripcion: "Variante breve de anamnesis reumatológica.",
    numeroVersion: 1,
    esPredeterminada: false,
    secciones: [],
  },
];

describe("SessionTemplateCard", () => {
  it("muestra las variantes de ficha y su versión", () => {
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
      "Ficha de Reumatologia · v2"
    );
    expect(screen.getByText("Anamnesis orientada al patrón articular y la limitación funcional.")).toBeInTheDocument();
  });

  it("bloquea el cambio cuando la documentación ya comenzó", () => {
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

  it("no muestra selector cuando solo existe una ficha", () => {
    render(
      <SessionTemplateCard
        templates={[templates[0]]}
        selectedTemplateId="template-reumatologia"
        isLoading={false}
        isSaving={false}
        onTemplateChange={vi.fn()}
      />
    );

    expect(screen.queryByRole("combobox", { name: "Seleccionar ficha de anamnesis" })).not.toBeInTheDocument();
    expect(screen.getByText("Ficha de Reumatologia")).toBeInTheDocument();
    expect(screen.getByText("Asignada automáticamente por tu especialidad.")).toBeInTheDocument();
  });
});
