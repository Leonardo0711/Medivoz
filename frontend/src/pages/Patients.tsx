import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import { Sidebar } from "@/components/layout/Sidebar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PatientDialog } from "@/components/PatientDialog";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { PatientsHeader } from "@/components/patients/PatientsHeader";
import { PatientFilters } from "@/components/patients/PatientFilters";
import { PatientsList } from "@/components/patients/PatientsList";
import { PatientRecordModal } from "@/components/patients/PatientRecordModal";
import { Patient, PatientDialogMode } from "@/components/patients/PatientDialogTypes";
import api from "@/lib/api";
import { logger } from "@/utils/logger";

export default function Patients() {
  const [searchQuery, setSearchQuery] = useState("");
  const trimmedSearch = useMemo(() => searchQuery.trim(), [searchQuery]);
  const [debouncedSearchQuery] = useDebounce(trimmedSearch, 350);
  const [isPatientDialogOpen, setIsPatientDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogMode, setDialogMode] = useState<PatientDialogMode>("create");
  const [recordPatient, setRecordPatient] = useState<Patient | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  const { data: patients = [], isLoading, error, refetch } = useQuery({
    queryKey: ["patients", debouncedSearchQuery || "all"],
    queryFn: async () => {
      const response = await api.get("/clinical/patients", {
        params: { search: debouncedSearchQuery },
      });
      return (response.data || []) as Patient[];
    },
    retry: 1,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (error) {
      const code = (error as any)?.code;
      const message = String((error as any)?.message || "");
      if (code === "ERR_CANCELED" || message.toLowerCase().includes("canceled")) {
        return;
      }
      const status = (error as any)?.response?.status;
      if (status === 401 || status === 403) {
        logger.warn("Patients query unauthorized; refresh/logout flow will handle this state");
        return;
      }
      toast.error("Error al cargar los pacientes");
      logger.error("Patients query error:", error);
    }
  }, [error]);

  const handlePatientCreated = () => {
    refetch();
    toast.success("Paciente creado con exito. Ya puedes iniciar una sesion medica.");
  };

  const handleEditPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setDialogMode("edit");
    setIsPatientDialogOpen(true);
  };

  const handleViewRecord = (patient: Patient) => {
    setRecordPatient(patient);
    setIsRecordModalOpen(true);
  };

  const handleDeletePatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeletePatient = async () => {
    if (!selectedPatient) return;

    setIsDeleting(true);
    try {
      await api.delete(`/clinical/patients/${selectedPatient.id}`);
      toast.success("Paciente eliminado correctamente");
      await refetch();
      setIsDeleteDialogOpen(false);
    } catch (requestError) {
      logger.error("Error eliminando paciente:", requestError);
      toast.error("Error al eliminar el paciente");
    } finally {
      setIsDeleting(false);
      setSelectedPatient(null);
    }
  };

  const handleCreateNewPatient = () => {
    setSelectedPatient(null);
    setDialogMode("create");
    setIsPatientDialogOpen(true);
  };

  return (
    <div className="flex min-h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="app-content flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-7 md:px-6 md:py-8">
          <PatientsHeader onCreateNewPatient={handleCreateNewPatient} />

          <Card className="mb-8 border-border/60 shadow-sm">
            <CardHeader className="border-b border-border/40 bg-muted/20 pb-3">
              <PatientFilters searchQuery={searchQuery} onSearchChange={setSearchQuery} />
            </CardHeader>
            <CardContent className="pt-6">
              <PatientsList
                patients={patients}
                isLoading={isLoading}
                searchQuery={searchQuery}
                onEdit={handleEditPatient}
                onDelete={handleDeletePatient}
                onViewRecord={handleViewRecord}
              />
            </CardContent>
          </Card>

          <PatientDialog
            open={isPatientDialogOpen}
            onOpenChange={setIsPatientDialogOpen}
            onSuccess={handlePatientCreated}
            patient={selectedPatient}
            mode={dialogMode}
          />

          <DeleteConfirmDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            onConfirm={confirmDeletePatient}
            title="Eliminar paciente"
            description={`Estas seguro de que deseas eliminar a ${selectedPatient?.nombre}? Esta accion no se puede deshacer.`}
            isDeleting={isDeleting}
          />

          <PatientRecordModal
            open={isRecordModalOpen}
            onOpenChange={setIsRecordModalOpen}
            patient={recordPatient}
          />
        </div>
      </div>
    </div>
  );
}
