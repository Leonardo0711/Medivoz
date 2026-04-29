
import { memo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  FileText,
  Stethoscope,
  Clock,
  Shuffle,
  TrendingUp,
  ScrollText,
  ListChecks,
  Accessibility,
  FlaskConical,
  ClipboardList,
  StickyNote
} from "lucide-react";

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
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}

export const MedicalRecordForm = memo(function MedicalRecordForm({ formData, onChange }: MedicalRecordFormProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2 flex items-center gap-2 text-primary">
          <Stethoscope className="h-5 w-5" />
          Subjetivo (Anamnesis)
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 bg-primary/5 p-3 rounded-lg border border-primary/10">
            <Label htmlFor="motivo_consulta" className="flex items-center text-sm font-medium">
              <FileText className="h-4 w-4 mr-2 text-primary" />
              <span>Motivo de Consulta</span>
              <span className="ml-1 text-xs text-muted-foreground">(Auto-rellenado)</span>
            </Label>
            <Input
              id="motivo_consulta"
              name="motivo_consulta"
              value={formData.motivo_consulta}
              onChange={onChange}
              placeholder="Describa el motivo principal de la consulta"
              className="border-primary/20 focus-visible:ring-primary/30"
            />
          </div>
          
          <div className="space-y-2 bg-primary/5 p-3 rounded-lg border border-primary/10">
            <Label htmlFor="tiempo_enfermedad" className="flex items-center text-sm font-medium">
              <Clock className="h-4 w-4 mr-2 text-primary" />
              <span>Tiempo de Enfermedad</span>
              <span className="ml-1 text-xs text-muted-foreground">(Auto-rellenado)</span>
            </Label>
            <Input
              id="tiempo_enfermedad"
              name="tiempo_enfermedad"
              value={formData.tiempo_enfermedad}
              onChange={onChange}
              placeholder="Ej: 1 año de evolución"
              className="border-primary/20 focus-visible:ring-primary/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 bg-primary/5 p-3 rounded-lg border border-primary/10">
            <Label htmlFor="forma_inicio" className="flex items-center text-sm font-medium">
              <Shuffle className="h-4 w-4 mr-2 text-primary" />
              <span>Forma de Inicio</span>
              <span className="ml-1 text-xs text-muted-foreground">(Auto-rellenado)</span>
            </Label>
            <Input
              id="forma_inicio"
              name="forma_inicio"
              value={formData.forma_inicio}
              onChange={onChange}
              placeholder="Ej: Insidioso, súbito..."
              className="border-primary/20 focus-visible:ring-primary/30"
            />
          </div>

          <div className="space-y-2 bg-primary/5 p-3 rounded-lg border border-primary/10">
            <Label htmlFor="curso_enfermedad" className="flex items-center text-sm font-medium">
              <TrendingUp className="h-4 w-4 mr-2 text-primary" />
              <span>Curso de la Enfermedad</span>
              <span className="ml-1 text-xs text-muted-foreground">(Auto-rellenado)</span>
            </Label>
            <Input
              id="curso_enfermedad"
              name="curso_enfermedad"
              value={formData.curso_enfermedad}
              onChange={onChange}
              placeholder="Ej: Progresivo, fluctuante..."
              className="border-primary/20 focus-visible:ring-primary/30"
            />
          </div>
        </div>
        
        <div className="space-y-2 bg-primary/5 p-3 rounded-lg border border-primary/10">
          <Label htmlFor="historia_cronologica" className="flex items-center text-sm font-medium">
            <ScrollText className="h-4 w-4 mr-2 text-primary" />
            <span>Historia Cronológica de la Enfermedad Actual</span>
            <span className="ml-1 text-xs text-muted-foreground">(Auto-rellenado)</span>
          </Label>
          <Textarea
            id="historia_cronologica"
            name="historia_cronologica"
            value={formData.historia_cronologica}
            onChange={onChange}
            rows={5}
            placeholder="Describa de forma narrativa la evolución y síntomas actuales del paciente"
            className="resize-none border-primary/20 focus-visible:ring-primary/30"
          />
        </div>
        
        <div className="space-y-2 bg-primary/5 p-3 rounded-lg border border-primary/10">
          <Label htmlFor="sintomas_principales" className="flex items-center text-sm font-medium">
            <ClipboardList className="h-4 w-4 mr-2 text-primary" />
            <span>Síntomas Principales</span>
            <span className="ml-1 text-xs text-muted-foreground">(Auto-rellenado)</span>
          </Label>
          <Textarea
            id="sintomas_principales"
            name="sintomas_principales"
            value={formData.sintomas_principales}
            onChange={onChange}
            rows={4}
            placeholder="Describa los síntomas más importantes mencionados durante la consulta"
            className="resize-none border-primary/20 focus-visible:ring-primary/30"
          />
        </div>
        
        <div className="space-y-2 bg-primary/5 p-3 rounded-lg border border-primary/10">
          <Label htmlFor="antecedentes" className="flex items-center text-sm font-medium">
            <ListChecks className="h-4 w-4 mr-2 text-primary" />
            <span>Antecedentes</span>
            <span className="ml-1 text-xs text-muted-foreground">(Auto-rellenado)</span>
          </Label>
          <Textarea
            id="antecedentes"
            name="antecedentes"
            value={formData.antecedentes}
            onChange={onChange}
            rows={4}
            placeholder="Incluya antecedentes personales, familiares y RAM relevantes"
            className="resize-none border-primary/20 focus-visible:ring-primary/30"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 bg-primary/5 p-3 rounded-lg border border-primary/10">
            <Label htmlFor="estado_funcional_basal" className="flex items-center text-sm font-medium">
              <Accessibility className="h-4 w-4 mr-2 text-primary" />
              <span>Estado Funcional Basal</span>
              <span className="ml-1 text-xs text-muted-foreground">(Auto-rellenado)</span>
            </Label>
            <Textarea
              id="estado_funcional_basal"
              name="estado_funcional_basal"
              value={formData.estado_funcional_basal}
              onChange={onChange}
              rows={3}
              placeholder="Ej: Autosuficiente, Barthel 100 puntos..."
            className="resize-none border-primary/20 focus-visible:ring-primary/30"
          />
        </div>
        
        <div className="space-y-2 bg-primary/5 p-3 rounded-lg border border-primary/10">
            <Label htmlFor="estudios_previos" className="flex items-center text-sm font-medium">
              <FlaskConical className="h-4 w-4 mr-2 text-primary" />
              <span>Estudios Previos Mencionados</span>
              <span className="ml-1 text-xs text-muted-foreground">(Auto-rellenado)</span>
          </Label>
            <Textarea
              id="estudios_previos"
              name="estudios_previos"
              value={formData.estudios_previos}
              onChange={onChange}
              rows={3}
              placeholder="Detalla estudios complementarios mencionados (si los hay)"
              className="resize-none border-primary/20 focus-visible:ring-primary/30"
            />
          </div>
        </div>
        
        <div className="space-y-2 bg-primary/5 p-3 rounded-lg border border-primary/10">
          <Label htmlFor="notas_adicionales" className="flex items-center text-sm font-medium">
            <StickyNote className="h-4 w-4 mr-2 text-primary" />
            <span>Notas Adicionales</span>
            <span className="ml-1 text-xs text-muted-foreground">(Auto-rellenado)</span>
          </Label>
          <Textarea
            id="notas_adicionales"
            name="notas_adicionales"
            value={formData.notas_adicionales}
            onChange={onChange}
            rows={4}
            placeholder="Observaciones adicionales relevantes"
            className="resize-none border-primary/20 focus-visible:ring-primary/30"
          />
        </div>
      </div>
    </div>
  );
});
