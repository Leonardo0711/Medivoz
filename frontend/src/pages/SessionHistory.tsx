import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronRight, Clock, FileText, History, Loader2, Search, User } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MedicalRecordModal } from "@/components/MedicalRecordModal";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";

interface ConsultationApi {
  id: string;
  pacienteId: string;
  codigoSesion: string;
  fecha: string | null;
  createdAt: string;
  transcripcion: string | null;
}

interface PatientApi {
  id: string;
  nombre: string;
  dni: string;
  edad: number | null;
}

interface SessionWithPatient {
  id: string;
  codigo_sesion: string;
  created_at: string;
  transcripcion: string | null;
  pacientes: {
    id: string;
    nombre: string;
    dni: string;
    edad: number | null;
  };
}

export default function SessionHistory() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSession, setSelectedSession] = useState<SessionWithPatient | null>(null);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["session-history", user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as SessionWithPatient[];

      const [consultationsRes, patientsRes] = await Promise.all([
        api.get("/clinical/consultations"),
        api.get("/clinical/patients"),
      ]);

      const consultations: ConsultationApi[] = consultationsRes.data || [];
      const patients: PatientApi[] = patientsRes.data || [];

      const patientById = new Map(patients.map((patient) => [patient.id, patient]));

      return consultations
        .map((consultation) => {
          const patient = patientById.get(consultation.pacienteId);
          if (!patient) return null;

          return {
            id: consultation.id,
            codigo_sesion: consultation.codigoSesion,
            created_at: consultation.fecha || consultation.createdAt,
            transcripcion: consultation.transcripcion,
            pacientes: {
              id: patient.id,
              nombre: patient.nombre,
              dni: patient.dni,
              edad: patient.edad,
            },
          } as SessionWithPatient;
        })
        .filter((item): item is SessionWithPatient => item !== null)
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    },
    enabled: !!user?.id,
  });

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!searchTerm) return sessions;

    const term = searchTerm.toLowerCase();
    return sessions.filter((session) => {
      return (
        session.pacientes?.nombre?.toLowerCase().includes(term) ||
        session.pacientes?.dni?.includes(term) ||
        session.codigo_sesion?.toLowerCase().includes(term)
      );
    });
  }, [sessions, searchTerm]);

  return (
    <div className="flex min-h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="app-content flex-1 overflow-auto">
        <div className="container mx-auto max-w-6xl px-4 py-7 md:px-8 md:py-8">
          <header className="mb-8 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm sm:p-6">
            <div className="mb-1 flex items-center gap-3">
              <div className="rounded-xl bg-violet-50 p-2 dark:bg-violet-900/20">
                <History className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Historial de sesiones</h1>
            </div>
            <p className="ml-[52px] text-sm text-muted-foreground">
              Revisa consultas pasadas, transcripciones y fichas medicas.
            </p>
          </header>

          <div className="relative mb-6 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por paciente, DNI o codigo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-11 pl-10"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !filteredSessions.length ? (
            <Card className="border-dashed border-border/60">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                  <History className="h-7 w-7 text-muted-foreground/40" />
                </div>
                <h3 className="mb-1 text-base font-semibold">
                  {searchTerm ? "Sin resultados" : "Sin sesiones aun"}
                </h3>
                <p className="max-w-xs text-sm text-muted-foreground">
                  {searchTerm
                    ? "Prueba con otra busqueda"
                    : "Las sesiones apareceran aqui despues de grabar tu primera consulta"}
                </p>
                {!searchTerm && (
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <Link to="/session">Iniciar nueva sesion</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filteredSessions.map((session) => (
                <Card
                  key={session.id}
                  className="group cursor-pointer border-border/40 transition-all duration-200 hover:border-primary/20 hover:shadow-sm"
                  onClick={() => setSelectedSession(session)}
                >
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {session.pacientes?.nombre?.substring(0, 2).toUpperCase() || "??"}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-medium text-foreground">
                          {session.pacientes?.nombre || "Paciente desconocido"}
                        </h3>
                        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                          {session.codigo_sesion}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(session.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
                        </span>
                        {session.pacientes?.dni && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            DNI: {session.pacientes.dni}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                      {session.transcripcion ? (
                        <Badge className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
                          <FileText className="mr-1 h-3 w-3" />
                          Transcrita
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                          Sin transcripcion
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 transition-colors group-hover:text-primary" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <MedicalRecordModal
            open={!!selectedSession}
            onOpenChange={(open) => {
              if (!open) setSelectedSession(null);
            }}
            sessionId={selectedSession?.id}
            patientId={selectedSession?.pacientes?.id}
          />
        </div>
      </div>
    </div>
  );
}
