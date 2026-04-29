
export type AgentType = "Transcriptor" | "Extractor";

export type AgentStatus = "activo" | "inactivo";

export interface Agent {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: AgentType;
  estado: AgentStatus;
  prompt?: string;
  documentos?: string[];
  dependencias?: string[];
  configuracion?: Record<string, unknown>;
}
