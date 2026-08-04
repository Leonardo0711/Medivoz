import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Loader2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import api, { getApiErrorMessage } from "@/lib/api";
import { AnamnesisTemplate } from "@/types/anamnesis-templates";
import { logger } from "@/utils/logger";
import { formatSpecialityName } from "@/utils/speciality";

export default function Templates() {
  const { user, setUser } = useAuth();
  const [templates, setTemplates] = useState<AnamnesisTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await api.get<AnamnesisTemplate[]>("/clinical/anamnesis-templates");
        setTemplates(response.data);
      } catch (error) {
        logger.error("No se pudieron cargar las fichas:", error);
        toast.error(getApiErrorMessage(error, "No se pudieron cargar las fichas"));
      } finally {
        setIsLoading(false);
      }
    };
    void loadTemplates();
  }, []);

  const setAsDefault = async (templateId: string) => {
    setSavingId(templateId);
    try {
      await api.patch("/clinical/anamnesis-templates/default", {
        plantillaAnamnesisId: templateId,
      });
      setTemplates((current) => current.map((template) => ({
        ...template,
        esPredeterminada: template.id === templateId,
      })));
      if (user) {
        const updatedUser = { ...user, plantillaAnamnesisPredeterminadaId: templateId };
        setUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));
      }
      toast.success("Ficha predeterminada actualizada");
    } catch (error) {
      logger.error("No se pudo actualizar la ficha predeterminada:", error);
      toast.error(getApiErrorMessage(error, "No se pudo actualizar la ficha predeterminada"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="app-content min-w-0 flex-1">
        <div className="container mx-auto max-w-6xl px-4 py-6 md:px-6">
          <header className="mb-6 rounded-lg border border-border/60 bg-card px-5 py-4 shadow-sm">
            <h1 className="flex items-center gap-3 text-2xl font-semibold text-foreground">
              <span className="rounded-lg bg-primary/10 p-2">
                <ClipboardList className="h-5 w-5 text-primary" />
              </span>
              Fichas de anamnesis
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {user?.rol === "administrador"
                ? "Elige la ficha que se cargará por defecto en tus consultas de prueba."
                : "La ficha corresponde a tu especialidad registrada y se carga automáticamente en cada consulta."}
            </p>
          </header>

          {isLoading ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando fichas...
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((template) => (
                <Card
                  key={template.id}
                  className={template.esPredeterminada ? "border-primary/50 shadow-sm shadow-primary/10" : "border-border/60"}
                >
                  <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Stethoscope className="h-4 w-4 text-primary" />
                          {formatSpecialityName(template.especialidad)}
                        </CardTitle>
                        {template.esPredeterminada && (
                          <Badge className="bg-primary text-primary-foreground">
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Predeterminada
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="max-w-3xl leading-relaxed">
                        {template.descripcion}
                      </CardDescription>
                    </div>
                    <Button
                      onClick={() => void setAsDefault(template.id)}
                      disabled={user?.rol !== "administrador" || template.esPredeterminada || savingId !== null}
                      variant={template.esPredeterminada ? "secondary" : "default"}
                      className="shrink-0"
                    >
                      {savingId === template.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {template.esPredeterminada
                        ? "Ficha asignada"
                        : user?.rol === "administrador"
                          ? "Usar por defecto"
                          : "Asignada por especialidad"}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-hidden rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="w-[28%]">Campo de la ficha</TableHead>
                            <TableHead>Enfoque de la especialidad</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {template.secciones.map((section) => (
                            <TableRow key={section.seccion}>
                              <TableCell className="font-medium">
                                {section.etiqueta}
                                {section.esObligatoria && (
                                  <span className="ml-1 text-xs text-primary">Obligatorio</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm leading-relaxed text-muted-foreground">
                                {section.descripcionIa}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
