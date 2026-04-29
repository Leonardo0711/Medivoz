import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PatientsHeaderProps {
  onCreateNewPatient: () => void;
}

export function PatientsHeader({ onCreateNewPatient }: PatientsHeaderProps) {
  return (
    <header className="mb-6 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Mis pacientes</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Gestiona informacion clinica y crea sesiones medicas de forma rapida.
          </p>
        </div>

        <Button className="w-full md:w-auto" onClick={onCreateNewPatient}>
          <UserPlus className="mr-2 h-4 w-4" />
          Nuevo paciente
        </Button>
      </div>
    </header>
  );
}
