import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Edit, Eye, Loader2, Trash, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PatientCard } from "@/components/PatientCard";
import { Patient } from "@/components/patients/PatientDialogTypes";

interface PatientsListProps {
  patients: Patient[] | null;
  isLoading: boolean;
  searchQuery: string;
  onEdit: (patient: Patient) => void;
  onDelete: (patient: Patient) => void;
  onViewRecord: (patient: Patient) => void;
}

export function PatientsList({
  patients,
  isLoading,
  searchQuery,
  onEdit,
  onDelete,
  onViewRecord,
}: PatientsListProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), "dd MMM yyyy", { locale: es });
    } catch {
      return "Fecha invalida";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Cargando pacientes...</p>
        </div>
      </div>
    );
  }

  if (!patients || patients.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 py-20 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
            <User className="h-8 w-8 text-muted-foreground/50" />
          </div>

          <div className="space-y-1">
            {searchQuery ? (
              <>
                <h3 className="text-lg font-semibold text-foreground">No se encontraron pacientes</h3>
                <p className="text-sm text-muted-foreground">No hay resultados para "{searchQuery}"</p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-foreground">No hay pacientes registrados</h3>
                <p className="text-sm text-muted-foreground">
                  Comienza agregando tu primer paciente para crear sesiones medicas.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {patients.map((patient) => (
          <PatientCard
            key={patient.id}
            id={patient.id}
            name={patient.nombre}
            age={patient.edad || 0}
            lastVisit={patient.ultima_visita ? formatDate(patient.ultima_visita) : "Sin visitas"}
            diagnosis={patient.diagnostico || undefined}
            onEdit={() => onEdit(patient)}
            onDelete={() => onDelete(patient)}
            onViewRecord={() => onViewRecord(patient)}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border shadow-sm md:block">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[250px] font-semibold">Paciente</TableHead>
              <TableHead className="font-semibold">DNI</TableHead>
              <TableHead className="font-semibold">Edad</TableHead>
              <TableHead className="font-semibold">Ultima visita</TableHead>
              <TableHead className="font-semibold">Ficha medica</TableHead>
              <TableHead className="pr-6 text-right font-semibold">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((patient) => (
              <TableRow key={patient.id} className="group cursor-pointer transition-colors hover:bg-muted/30">
                <TableCell className="py-4 font-medium">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {patient.nombre.substring(0, 2).toUpperCase()}
                    </div>
                    <Link
                      to={`/session?patientId=${patient.id}`}
                      className="font-semibold transition-colors hover:text-primary"
                    >
                      {patient.nombre}
                    </Link>
                  </div>
                </TableCell>

                <TableCell className="font-mono text-xs text-muted-foreground">{patient.dni}</TableCell>
                <TableCell>
                  {patient.edad ? (
                    `${patient.edad} anos`
                  ) : (
                    <span className="text-xs italic text-muted-foreground">N/A</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {patient.ultima_visita ? formatDate(patient.ultima_visita) : "-"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onViewRecord(patient);
                    }}
                    className="h-8 border-primary/20 px-3 text-xs font-medium transition-colors hover:bg-primary/5 hover:text-primary"
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Ver
                  </Button>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <div className="flex justify-end gap-2 opacity-70 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEdit(patient);
                      }}
                      className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Editar paciente"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete(patient);
                      }}
                      className="h-8 w-8 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Eliminar paciente"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 hidden justify-end md:flex">
        <Badge variant="outline" className="font-normal text-muted-foreground">
          {patients.length} paciente{patients.length === 1 ? "" : "s"}
        </Badge>
      </div>
    </div>
  );
}
