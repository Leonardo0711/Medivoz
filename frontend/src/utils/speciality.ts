const SPECIALITY_LABELS: Record<string, string> = {
  Neurologia: "Neurología",
  Endocrinologia: "Endocrinología",
  Psiquiatria: "Psiquiatría",
  Reumatologia: "Reumatología",
  Hematologia: "Hematología",
};

export function formatSpecialityName(name?: string | null) {
  if (!name) return "Especialidad no registrada";
  return SPECIALITY_LABELS[name] ?? name;
}
