export type AnamnesisTemplateSection = {
  plantillaId: string;
  seccion: string;
  etiqueta: string;
  descripcionIa: string | null;
  orden: number;
  esObligatoria: boolean;
};

export type AnamnesisTemplate = {
  id: string;
  especialidadId: number;
  especialidad: string;
  nombre: string;
  descripcion: string;
  numeroVersion: number;
  esPredeterminada: boolean;
  secciones: AnamnesisTemplateSection[];
};
