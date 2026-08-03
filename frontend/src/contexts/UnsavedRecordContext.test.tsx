import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { UnsavedRecordProvider, useUnsavedRecordGuard } from "./UnsavedRecordContext";

function GuardedPage({ onSave }: { onSave: () => Promise<boolean> }) {
  const { configureGuard } = useUnsavedRecordGuard();

  useEffect(() => {
    configureGuard({ active: true, isSaving: false, onSave });
    return () => configureGuard(null);
  }, [configureGuard, onSave]);

  return <Link to="/patients">Ir a pacientes</Link>;
}

function renderGuard(onSave = vi.fn(async () => true)) {
  render(
    <MemoryRouter initialEntries={["/session"]}>
      <UnsavedRecordProvider>
        <Routes>
          <Route path="/session" element={<GuardedPage onSave={onSave} />} />
          <Route path="/patients" element={<div>Lista de pacientes</div>} />
        </Routes>
      </UnsavedRecordProvider>
    </MemoryRouter>
  );
  return onSave;
}

describe("UnsavedRecordProvider", () => {
  it("detiene la navegación hasta que el médico decide", () => {
    renderGuard();

    fireEvent.click(screen.getByRole("link", { name: "Ir a pacientes" }));

    expect(screen.getByText("Hay una anamnesis pendiente de guardar")).toBeInTheDocument();
    expect(screen.queryByText("Lista de pacientes")).not.toBeInTheDocument();
  });

  it("guarda antes de ejecutar la navegación pendiente", async () => {
    const onSave = renderGuard();

    fireEvent.click(screen.getByRole("link", { name: "Ir a pacientes" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar ficha y salir" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(await screen.findByText("Lista de pacientes")).toBeInTheDocument();
  });

  it("permite salir sin guardar cuando el médico lo confirma", async () => {
    const onSave = renderGuard();

    fireEvent.click(screen.getByRole("link", { name: "Ir a pacientes" }));
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));

    expect(await screen.findByText("Lista de pacientes")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
