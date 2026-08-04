import { FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnamnesisTemplate } from "@/types/anamnesis-templates";
import { formatSpecialityName } from "@/utils/speciality";

type SessionTemplateCardProps = {
  templates: AnamnesisTemplate[];
  selectedTemplateId: string;
  isLoading: boolean;
  isSaving: boolean;
  disabled?: boolean;
  onTemplateChange: (templateId: string) => void;
};

export function SessionTemplateCard({
  templates,
  selectedTemplateId,
  isLoading,
  isSaving,
  disabled = false,
  onTemplateChange,
}: SessionTemplateCardProps) {
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);

  if (!isLoading && templates.length === 1) {
    const template = templates[0];
    return (
      <Card className="border-border/40 shadow-sm">
        <CardContent className="flex items-start gap-3 px-4 py-3">
          <div className="rounded-md bg-primary/10 p-2">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{template.nombre}</p>
              <Badge variant="outline">v{template.numeroVersion}</Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Asignada automáticamente por tu especialidad.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/40 shadow-sm">
      <CardHeader className="border-b border-border/40 bg-muted/20 px-4 py-2.5">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <div className="rounded-lg bg-primary/10 p-1.5">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          Ficha
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-3">
        <Select
          value={selectedTemplateId || undefined}
          onValueChange={onTemplateChange}
          disabled={isLoading || isSaving || disabled || templates.length === 0}
        >
          <SelectTrigger aria-label="Seleccionar ficha de anamnesis">
            {isLoading || isSaving ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isSaving ? "Actualizando ficha..." : "Cargando fichas..."}
              </span>
            ) : (
              <SelectValue placeholder="Selecciona una ficha" />
            )}
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.nombre || formatSpecialityName(template.especialidad)} · v{template.numeroVersion}
                {template.esPredeterminada ? " · Predeterminada" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {selectedTemplate?.descripcion || "La ficha orienta la estructuración clínica de la anamnesis."}
        </p>
        {disabled && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            La ficha queda fijada cuando comienza la documentación de la consulta.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
