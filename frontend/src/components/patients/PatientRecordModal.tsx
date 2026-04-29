import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Brain, Calendar, Clock, FileSearch, FileText, History, Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { logger } from "@/utils/logger";
import { Patient } from "@/components/patients/PatientDialogTypes";
import { MedicalRecordFormData } from "@/hooks/medical-record/types";

interface PatientRecordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient | null;
}

type RecordRow = MedicalRecordFormData & {
  sesion_id: string;
  updated_at: string;
};

const fieldOrder: Array<{ key: keyof MedicalRecordFormData; label: string; icon: JSX.Element }> = [
  { key: "motivo_consulta", label: "Motivo de consulta", icon: <AlertCircle className="h-4 w-4" /> },
  { key: "historia_cronologica", label: "Historia cronologica", icon: <History className="h-4 w-4" /> },
  { key: "tiempo_enfermedad", label: "Tiempo de enfermedad", icon: <Clock className="h-4 w-4" /> },
  { key: "forma_inicio", label: "Forma de inicio", icon: <Clock className="h-4 w-4" /> },
  { key: "curso_enfermedad", label: "Curso de enfermedad", icon: <Clock className="h-4 w-4" /> },
  { key: "sintomas_principales", label: "Sintomas principales", icon: <FileText className="h-4 w-4" /> },
  { key: "antecedentes", label: "Antecedentes", icon: <Brain className="h-4 w-4" /> },
  { key: "estado_funcional_basal", label: "Estado funcional basal", icon: <Brain className="h-4 w-4" /> },
  { key: "estudios_previos", label: "Estudios previos", icon: <FileSearch className="h-4 w-4" /> },
  { key: "notas_adicionales", label: "Notas adicionales", icon: <StickyNote className="h-4 w-4" /> },
];

export function PatientRecordModal({ open, onOpenChange, patient }: PatientRecordModalProps) {
  const [record, setRecord] = useState<RecordRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || !patient?.id) {
      setRecord(null);
      return;
    }

    void fetchRecord(patient.id);
  }, [open, patient?.id]);

  const fetchRecord = async (patientId: string) => {
    setIsLoading(true);
    try {
      const consultationsResponse = await api.get("/clinical/consultations", {
        params: { pacienteId: patientId },
      });
      const consultations = Array.isArray(consultationsResponse.data) ? consultationsResponse.data : [];

      if (!consultations.length) {
        setRecord(null);
        return;
      }

      const latestConsultation = consultations[0];
      const consultationId = String(latestConsultation?.id || "");
      if (!consultationId) {
        setRecord(null);
        return;
      }

      let scribeRecord: any;
      try {
        const recordResponse = await api.get(`/scribe/record/${consultationId}`);
        scribeRecord = recordResponse.data;
      } catch (error: any) {
        if (error?.response?.status === 404) {
          setRecord(null);
          return;
        }
        throw error;
      }

      const sections = Array.isArray(scribeRecord?.sections) ? scribeRecord.sections : [];
      const sectionValues: Record<string, string> = {};

      for (const item of sections) {
        const name = String(item?.nombre || item?.seccion || "").trim();
        const value = String(item?.textoActual || item?.texto_actual || "");
        if (name) sectionValues[name] = value;
      }

      setRecord({
        motivo_consulta: sectionValues.motivo_consulta || "",
        tiempo_enfermedad: sectionValues.tiempo_enfermedad || "",
        forma_inicio: sectionValues.forma_inicio || "",
        curso_enfermedad: sectionValues.curso_enfermedad || "",
        historia_cronologica: sectionValues.historia_cronologica || "",
        sintomas_principales: sectionValues.sintomas_principales || "",
        antecedentes: sectionValues.antecedentes || "",
        estado_funcional_basal: sectionValues.estado_funcional_basal || "",
        estudios_previos: sectionValues.estudios_previos || "",
        notas_adicionales: sectionValues.notas_adicionales || "",
        sesion_id: String(latestConsultation?.codigoSesion || consultationId),
        updated_at: String(
          scribeRecord?.updatedAt ||
            scribeRecord?.actualizadoEn ||
            latestConsultation?.updatedAt ||
            latestConsultation?.actualizadoEn ||
            new Date().toISOString()
        ),
      });
    } catch (error) {
      logger.error("Error fetching medical record:", error);
      toast.error("No se pudo cargar la ficha medica del paciente");
      setRecord(null);
    } finally {
      setIsLoading(false);
    }
  };

  const renderField = (label: string, value: string, icon: JSX.Element) => {
    const hasValue = Boolean(value?.trim());
    const text = hasValue ? value : "Sin informacion registrada";

    return (
      <div className="space-y-2">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <span className="rounded-md bg-primary/10 p-1 text-primary">{icon}</span>
          {label}
        </h4>
        <div
          className={cn(
            "rounded-xl border border-border/60 bg-card p-4 text-sm leading-relaxed whitespace-pre-line shadow-sm",
            hasValue ? "text-foreground/90" : "text-muted-foreground italic"
          )}
        >
          {text}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[85vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b bg-muted/20 px-6 py-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
                <span className="rounded-xl bg-primary/10 p-2 text-primary">
                  <FileText className="h-6 w-6" />
                </span>
                Historia Clinica
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-2">
                {patient ? (
                  <>
                    <span className="font-semibold text-foreground">{patient.nombre}</span>
                    <span className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs">DNI: {patient.dni}</span>
                  </>
                ) : (
                  "Cargando informacion..."
                )}
              </DialogDescription>
            </div>

            {record?.updated_at && (
              <Badge variant="outline" className="w-fit gap-1.5 bg-background">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                {new Date(record.updated_at).toLocaleDateString("es-PE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-6 py-6">
            {isLoading ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm">Cargando ficha medica...</p>
              </div>
            ) : record ? (
              <div className="grid gap-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div className="space-y-6 lg:col-span-2">
                    {renderField(fieldOrder[0].label, record[fieldOrder[0].key] ?? "", fieldOrder[0].icon)}
                    {renderField(fieldOrder[1].label, record[fieldOrder[1].key] ?? "", fieldOrder[1].icon)}
                  </div>
                  <div className="space-y-6">
                    {renderField(fieldOrder[2].label, record[fieldOrder[2].key] ?? "", fieldOrder[2].icon)}
                    {renderField(fieldOrder[3].label, record[fieldOrder[3].key] ?? "", fieldOrder[3].icon)}
                    {renderField(fieldOrder[4].label, record[fieldOrder[4].key] ?? "", fieldOrder[4].icon)}
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  {fieldOrder.slice(5).map(({ key, label, icon }) => (
                    <div key={key} className="md:col-span-1">
                      {renderField(label, record[key] ?? "", icon)}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-center text-muted-foreground">
                <span className="rounded-2xl bg-muted p-6">
                  <FileText className="h-10 w-10 text-muted-foreground/60" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">Sin ficha registrada</h3>
                  <p className="text-sm">
                    Este paciente aun no tiene una ficha generada. Inicia una consulta y guarda la anamnesis para verla aqui.
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 border-t bg-muted/20 px-6 py-4 sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {record?.sesion_id ? `Sesion: ${record.sesion_id}` : ""}
          </div>
          <Button onClick={() => onOpenChange(false)}>Cerrar ficha</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
