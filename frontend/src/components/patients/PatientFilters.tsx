import { Search } from "lucide-react";
import { CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface PatientFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export function PatientFilters({ searchQuery, onSearchChange }: PatientFiltersProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <CardTitle className="text-base sm:text-lg">Lista de pacientes</CardTitle>

      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, DNI o diagnostico..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 pl-10"
        />
      </div>
    </div>
  );
}
