import { memo } from "react";
import { UserRound } from "lucide-react";

interface PatientInfoCardProps {
  name: string;
  age: number | null;
}

export const PatientInfoCard = memo(function PatientInfoCard({ name, age }: PatientInfoCardProps) {
  return (
    <div className="rounded-md border border-primary/15 bg-primary/5 p-3 shadow-sm md:p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="rounded-full bg-primary/10 p-1.5">
          <UserRound className="h-5 w-5 text-primary" />
        </div>
        <h4 className="font-semibold text-foreground">Información del paciente</h4>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm md:grid-cols-2">
        <div className="flex items-center gap-2 py-1">
          <span className="font-medium text-muted-foreground">Nombre:</span>
          <span className="text-foreground">{name}</span>
        </div>
        <div className="flex items-center gap-2 py-1">
          <span className="font-medium text-muted-foreground">Edad:</span>
          <span className="text-foreground">{age !== null ? `${age} años` : "No especificada"}</span>
        </div>
      </div>
    </div>
  );
});
