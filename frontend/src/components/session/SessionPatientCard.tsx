import { User, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PatientSearch } from "@/components/PatientSearch";
import { Patient } from "@/components/patients/PatientDialogTypes";

interface SessionPatientCardProps {
  selectedPatient: Patient | null;
  onPatientSelect: (patient: Patient | null) => void;
}

export function SessionPatientCard({ selectedPatient, onPatientSelect }: SessionPatientCardProps) {
  const patientIdentifier = selectedPatient?.dni || selectedPatient?.codigoPaciente || "Sin codigo";

  return (
    <Card className="overflow-hidden border-border/40 shadow-sm">
      <CardHeader className="border-b border-border/40 bg-muted/20 pb-3">
        <CardTitle className="flex items-center justify-between text-base font-semibold">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <User className="h-4 w-4 text-primary" />
            </div>
            Paciente
          </div>
          {selectedPatient && (
            <Badge
              variant="secondary"
              className="border-emerald-200 bg-emerald-50 text-xs font-normal text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
            >
              Seleccionado
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-3">
        {selectedPatient ? (
          <div className="animate-in slide-in-from-bottom-2 space-y-3 fade-in">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {selectedPatient.nombre.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-foreground">{selectedPatient.nombre}</h3>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span>{selectedPatient.dni ? "DNI" : "Codigo"}: {patientIdentifier}</span>
                  {selectedPatient.edad && <span>{selectedPatient.edad} anos</span>}
                </div>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPatientSelect(null)}
              className="h-8 w-full border border-dashed border-border/60 text-xs text-muted-foreground hover:border-border hover:text-foreground"
            >
              <X className="mr-1.5 h-3 w-3" />
              Cambiar paciente
            </Button>
          </div>
        ) : (
          <div className="py-1">
            <PatientSearch onPatientSelect={onPatientSelect} selectedPatient={selectedPatient} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
