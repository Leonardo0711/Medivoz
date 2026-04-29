import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { Search, UserPlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PatientDialog } from "@/components/PatientDialog";
import { toast } from "sonner";
import { Patient } from "@/components/patients/PatientDialogTypes";
import { logger } from "@/utils/logger";
import api from "@/lib/api";

interface PatientSearchProps {
  onPatientSelect: (patient: Patient | null) => void;
  selectedPatient: Patient | null;
}

export function PatientSearch({ onPatientSelect, selectedPatient }: PatientSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  // Debounce sobre el valor recortado para evitar consultas con espacios y ganar reactividad
  const trimmedQuery = useMemo(() => searchQuery.trim(), [searchQuery]);
  const [debouncedSearchQuery] = useDebounce(trimmedQuery, 350);
  const [isPatientDialogOpen, setIsPatientDialogOpen] = useState(false);
  
  const { data: searchResults = [], isLoading, error } = useQuery({
    queryKey: ['patientSearch', debouncedSearchQuery || 'empty'],
    queryFn: async () => {
      if (!debouncedSearchQuery || debouncedSearchQuery.trim().length < 2) return [];

      const response = await api.get("/clinical/patients", {
        params: { search: debouncedSearchQuery },
      });

      return (response.data || []).slice(0, 5);
    },
    select: (data) => {
      // Transform data using select instead of in component
      // This ensures transformation only happens when data changes
      return data as Patient[];
    },
    enabled: debouncedSearchQuery.length >= 2, // Only fetch when query is at least 2 characters
    staleTime: 30 * 1000, // Consider data fresh for 30 seconds
    gcTime: 2 * 60 * 1000, // Keep in cache for 2 minutes
    retry: 1,
  });
  // Handler memoizado para evitar recreaciones en cada render
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);
  
  useEffect(() => {
    if (error) {
      toast.error("Error al buscar pacientes");
    }
  }, [error]);
  
  const handleSelect = (patient: Patient) => {
    onPatientSelect(patient);
    setSearchQuery("");
  };
  
  const handleClearSelection = () => {
    onPatientSelect(null);
  };
  
  const handlePatientCreated = () => {
    toast.success("Paciente creado. Ahora puedes seleccionarlo en la búsqueda.");
  };
  
  return (
    <div className="space-y-4">
      {selectedPatient ? (
        <Card className="border-2 border-primary/20">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium text-lg text-card-foreground">{selectedPatient.nombre}</h3>
                <p className="text-sm text-muted-foreground">DNI: {selectedPatient.dni}</p>
                {selectedPatient.edad && <p className="text-sm text-card-foreground">{selectedPatient.edad} años</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar paciente por nombre o DNI"
                className="pl-8"
                value={searchQuery}
                onChange={handleInputChange}
              />
            </div>
            <Button 
              variant="outline" 
              onClick={() => setIsPatientDialogOpen(true)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Nuevo
            </Button>
          </div>
          
          {debouncedSearchQuery.length >= 2 && !isLoading && searchResults && (
            <div className="border rounded-md divide-y">
              {searchResults.length > 0 ? (
                searchResults.map((patient) => (
                  <div 
                    key={patient.id} 
                    className="p-3 hover:bg-muted cursor-pointer flex justify-between"
                    onClick={() => handleSelect(patient)}
                  >
                    <div>
                      <div className="font-medium text-card-foreground">{patient.nombre}</div>
                      <div className="text-sm text-muted-foreground">DNI: {patient.dni}</div>
                    </div>
                    {patient.edad && <div className="text-sm text-card-foreground">{patient.edad} años</div>}
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-sm text-muted-foreground">
                  No se encontraron resultados
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      <PatientDialog 
        open={isPatientDialogOpen} 
        onOpenChange={setIsPatientDialogOpen}
        onSuccess={handlePatientCreated}
      />
    </div>
  );
}
