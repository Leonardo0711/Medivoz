import { memo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accessibility,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  FlaskConical,
  ListChecks,
  Lock,
  RefreshCw,
  ScrollText,
  Shuffle,
  Sparkles,
  Stethoscope,
  StickyNote,
  TrendingUp,
} from "lucide-react";
import { RecordSummaryData, SectionMetaMap } from "@/hooks/medical-record/types";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MedicalRecordFormData {
  motivo_consulta: string;
  tiempo_enfermedad: string;
  forma_inicio: string;
  curso_enfermedad: string;
  historia_cronologica: string;
  antecedentes: string;
  sintomas_principales: string;
  estado_funcional_basal: string;
  estudios_previos: string;
  notas_adicionales: string;
}

interface MedicalRecordFormProps {
  formData: MedicalRecordFormData;
  sectionMeta?: SectionMetaMap;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => void;
  onAcceptSuggestion?: (field: keyof MedicalRecordFormData) => Promise<boolean>;
  onRejectSuggestion?: (field: keyof MedicalRecordFormData) => Promise<boolean>;
  onBlockSection?: (field: keyof MedicalRecordFormData) => Promise<boolean>;
  onRetrySection?: (field: keyof MedicalRecordFormData) => Promise<boolean>;
  onRefineSection?: (field: keyof MedicalRecordFormData) => Promise<boolean>;
  recordSummary?: RecordSummaryData;
  onRecordSummaryChange?: (value: string) => void;
  validationWarnings?: string[];
  editElapsedMs?: number;
  isEditTiming?: boolean;
}

const formatEditTime = (durationMs: number) => {
  const totalSeconds = Math.floor(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const fieldLabels: Record<keyof MedicalRecordFormData, string> = {
  motivo_consulta: "Motivo de consulta",
  tiempo_enfermedad: "Tiempo de enfermedad",
  forma_inicio: "Forma de inicio",
  curso_enfermedad: "Curso de la enfermedad",
  historia_cronologica: "Historia cronologica",
  antecedentes: "Antecedentes",
  sintomas_principales: "Sintomas principales",
  estado_funcional_basal: "Estado funcional basal",
  estudios_previos: "Estudios previos",
  notas_adicionales: "Notas adicionales",
};

const fieldIcons: Record<keyof MedicalRecordFormData, React.ReactNode> = {
  motivo_consulta: <FileText className="h-4 w-4" />,
  tiempo_enfermedad: <Clock className="h-4 w-4" />,
  forma_inicio: <Shuffle className="h-4 w-4" />,
  curso_enfermedad: <TrendingUp className="h-4 w-4" />,
  historia_cronologica: <ScrollText className="h-4 w-4" />,
  antecedentes: <ListChecks className="h-4 w-4" />,
  sintomas_principales: <ClipboardList className="h-4 w-4" />,
  estado_funcional_basal: <Accessibility className="h-4 w-4" />,
  estudios_previos: <FlaskConical className="h-4 w-4" />,
  notas_adicionales: <StickyNote className="h-4 w-4" />,
};

const originLabels: Record<string, string> = {
  referido_paciente: "Paciente",
  dicho_familiar: "Familiar",
  indicado_medico: "Medico",
  no_determinado: "Origen no claro",
};

type FieldConfig = {
  field: keyof MedicalRecordFormData;
  placeholder: string;
  rows?: number;
  wide?: boolean;
};

const fields: FieldConfig[] = [
  { field: "motivo_consulta", placeholder: "Describa el motivo principal de la consulta" },
  { field: "tiempo_enfermedad", placeholder: "Ej: 1 ano de evolucion" },
  { field: "forma_inicio", placeholder: "Ej: Insidioso, subito" },
  { field: "curso_enfermedad", placeholder: "Ej: Progresivo, fluctuante" },
  {
    field: "historia_cronologica",
    placeholder: "Describa de forma narrativa la evolucion y sintomas actuales del paciente",
    rows: 5,
    wide: true,
  },
  {
    field: "sintomas_principales",
    placeholder: "Describa los sintomas mas importantes mencionados durante la consulta",
    rows: 4,
    wide: true,
  },
  {
    field: "antecedentes",
    placeholder: "Incluya antecedentes personales, familiares y RAM relevantes",
    rows: 4,
    wide: true,
  },
  {
    field: "estado_funcional_basal",
    placeholder: "Ej: Autosuficiente, Barthel 100 puntos",
    rows: 3,
  },
  {
    field: "estudios_previos",
    placeholder: "Detalla estudios complementarios mencionados",
    rows: 3,
  },
  {
    field: "notas_adicionales",
    placeholder: "Observaciones adicionales relevantes",
    rows: 4,
    wide: true,
  },
];

const fieldGroups: { id: string; label: string; fields: (keyof MedicalRecordFormData)[] }[] = [
  { id: "cuadro", label: "Cuadro actual", fields: ["motivo_consulta", "tiempo_enfermedad", "forma_inicio", "curso_enfermedad"] },
  { id: "historia", label: "Historia", fields: ["historia_cronologica", "sintomas_principales"] },
  { id: "contexto", label: "Antecedentes", fields: ["antecedentes", "estado_funcional_basal"] },
  { id: "apoyo", label: "Estudios", fields: ["estudios_previos", "notas_adicionales"] },
];

export const MedicalRecordForm = memo(function MedicalRecordForm({
  formData,
  sectionMeta = {},
  onChange,
  onAcceptSuggestion,
  onRejectSuggestion,
  onBlockSection,
  onRetrySection,
  onRefineSection,
  recordSummary = { resumenSugeridoIa: "", resumenActual: "" },
  onRecordSummaryChange,
  validationWarnings = [],
  editElapsedMs = 0,
  isEditTiming = false,
}: MedicalRecordFormProps) {
  const isLocked = (field: keyof MedicalRecordFormData) =>
    sectionMeta[field]?.estado === "bloqueada";
  const isReviewed = (field: keyof MedicalRecordFormData) =>
    sectionMeta[field]?.estado === "revisada";
  const hasPending = (field: keyof MedicalRecordFormData) => {
    const meta = sectionMeta[field];
    return Boolean(
      meta?.estado === "borrador_ia" &&
      meta.textoSugeridoIa?.trim() &&
      meta.textoSugeridoIa !== meta.textoActual
    );
  };
  const hasDoctorEditOverSuggestion = (field: keyof MedicalRecordFormData) => {
    const suggestion = sectionMeta[field]?.textoSugeridoIa;
    const current = formData[field];
    return Boolean(suggestion?.trim() && current?.trim() && current.trim() !== suggestion.trim());
  };
  const hasAnythingToValidate = (field: keyof MedicalRecordFormData) => {
    const meta = sectionMeta[field];
    return Boolean(formData[field]?.trim() || meta?.textoSugeridoIa?.trim());
  };

  const reviewedCount = fields.filter(({ field }) => isReviewed(field)).length;
  const summaryValue = recordSummary.resumenActual || "";
  const summaryWasGenerated = Boolean(recordSummary.resumenSugeridoIa?.trim());
  const summaryWasEdited = Boolean(
    recordSummary.resumenActual?.trim() &&
    recordSummary.resumenActual.trim() !== recordSummary.resumenSugeridoIa?.trim()
  );

  const renderField = ({ field, placeholder, rows, wide }: FieldConfig) => {
    const meta = sectionMeta[field];
    const locked = isLocked(field);
    const pending = hasPending(field);
    const editedOverSuggestion = pending && hasDoctorEditOverSuggestion(field);
    const reviewed = isReviewed(field);
    const canValidate = hasAnythingToValidate(field) && !locked;

    return (
      <div
        key={field}
        className={cn(
          "space-y-2 rounded-md border p-3 transition-colors",
          wide && "md:col-span-2",
          pending
            ? "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20"
            : reviewed
              ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20"
              : "border-border bg-card"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={field} className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <span className="shrink-0 text-primary">{fieldIcons[field]}</span>
            <span className="truncate">{fieldLabels[field]}</span>
          </Label>

          <div className="flex shrink-0 items-center gap-2">
            {editedOverSuggestion ? (
              <Badge className="h-6 bg-sky-600 text-[11px] text-white">Editado</Badge>
            ) : (
              pending && (
                <Badge className="h-6 bg-amber-500 text-[11px] text-white">IA pendiente</Badge>
              )
            )}
            {reviewed && (
              <Badge
                variant="secondary"
                className="h-6 border-emerald-200 bg-emerald-100 text-[11px] text-emerald-800"
              >
                Revisado
              </Badge>
            )}
            {locked && <Lock className="h-4 w-4 text-muted-foreground" />}
            {meta?.origenDato && (
              <Badge
                variant="outline"
                className="hidden h-6 bg-background text-[11px] sm:inline-flex"
              >
                {originLabels[meta.origenDato] || meta.origenDato}
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onRetrySection?.(field)}
              disabled={locked}
              title="Reintentar IA solo para esta seccion"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onRefineSection?.(field)}
              disabled={locked || !formData[field]?.trim()}
              title="Crear una version breve para plataforma institucional"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant={reviewed ? "secondary" : "outline"}
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => onAcceptSuggestion?.(field)}
              disabled={!canValidate}
              title={
                !canValidate
                  ? "Primero debe existir texto o sugerencia IA"
                  : editedOverSuggestion
                    ? "Validar el texto editado"
                    : "Validar esta seccion"
              }
            >
              {reviewed ? (
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Check className="mr-1 h-3.5 w-3.5" />
              )}
              {editedOverSuggestion ? "Validar edicion" : "Validar"}
            </Button>
          </div>
        </div>

        {rows ? (
          <Textarea
            id={field}
            name={field}
            value={formData[field]}
            onChange={onChange}
            disabled={locked}
            rows={rows}
            placeholder={placeholder}
            className="resize-none bg-background"
          />
        ) : (
          <Input
            id={field}
            name={field}
            value={formData[field]}
            onChange={onChange}
            disabled={locked}
            placeholder={placeholder}
            className="bg-background"
          />
        )}

        {pending && meta?.textoSugeridoIa && (
          <div className="rounded-md border border-amber-200 bg-background p-2 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-amber-800 dark:text-amber-200">
                {editedOverSuggestion ? "Sugerencia IA original" : "Sugerencia IA"}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => onRejectSuggestion?.(field)}
                >
                  Rechazar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => onBlockSection?.(field)}
                >
                  Bloquear
                </Button>
              </div>
            </div>
            <p className="line-clamp-3">{meta.textoSugeridoIa}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-primary">
          <Stethoscope className="h-5 w-5" />
          Subjetivo (Anamnesis)
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {editElapsedMs > 0 && (
            <Badge
              variant="outline"
              className={isEditTiming ? "border-sky-300 bg-sky-50 text-sky-800" : ""}
            >
              <Clock className="mr-1 h-3.5 w-3.5" />
              {isEditTiming ? "Edicion activa" : "Edicion pausada"} {formatEditTime(editElapsedMs)}
            </Badge>
          )}
          <Badge variant="outline">
            {reviewedCount}/{fields.length} validadas
          </Badge>
        </div>
      </div>

      {validationWarnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="font-semibold">Validaciones clinicas pendientes</p>
          <p className="mt-1 text-xs">{validationWarnings.slice(0, 3).join(" · ")}</p>
        </div>
      )}

      <Tabs defaultValue="cuadro" className="space-y-3">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-3 lg:grid-cols-5">
          {fieldGroups.map((group) => {
            const groupFields = fields.filter((item) => group.fields.includes(item.field));
            const groupReviewed = groupFields.filter(({ field }) => isReviewed(field)).length;
            const groupPending = groupFields.filter(({ field }) => hasPending(field)).length;
            return (
              <TabsTrigger key={group.id} value={group.id} className="min-h-11 gap-1 px-2 py-2 text-xs">
                <span>{group.label}</span>
                <span className={cn("text-[10px]", groupPending ? "text-amber-700" : "text-muted-foreground")}>
                  {groupReviewed}/{groupFields.length}
                </span>
              </TabsTrigger>
            );
          })}
          <TabsTrigger value="resumen" className="min-h-11 px-2 py-2 text-xs">
            Resumen
          </TabsTrigger>
        </TabsList>

        {fieldGroups.map((group) => {
          const groupFields = fields.filter((item) => group.fields.includes(item.field));
          return (
            <TabsContent key={group.id} value={group.id} className="mt-0">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {groupFields.map(renderField)}
              </div>
            </TabsContent>
          );
        })}

        <TabsContent value="resumen" className="mt-0">
          <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileText className="h-4 w-4 text-primary" />
                  Resumen narrativo final
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Un solo parrafo para copiar al sistema institucional del doctor.
                </p>
              </div>
              <div className="flex gap-2">
                {summaryWasGenerated && (
                  <Badge variant="outline" className="bg-background text-[11px]">
                    IA
                  </Badge>
                )}
                {summaryWasEdited && (
                  <Badge variant="secondary" className="text-[11px]">
                    Editado
                  </Badge>
                )}
              </div>
            </div>

            <Textarea
              value={summaryValue}
              onChange={(event) => onRecordSummaryChange?.(event.target.value)}
              rows={7}
              placeholder="Ej: Paciente refiere una semana de enfermedad con sintomas principales descritos durante la consulta..."
              className="resize-none bg-background"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
});
