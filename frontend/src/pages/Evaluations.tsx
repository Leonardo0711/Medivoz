import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, FileText, Loader2, Plus, Save, Scale } from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import api, { getApiErrorMessage } from "@/lib/api";

const dimensions = [
  ["actualizada", "Actualizada"],
  ["exacta", "Exacta"],
  ["exhaustiva", "Exhaustiva"],
  ["util", "Util"],
  ["organizada", "Organizada"],
  ["comprensible", "Comprensible"],
  ["concisa", "Concisa"],
  ["sintetizada", "Sintetizada"],
  ["consistente", "Consistente"],
] as const;

type Dimension = (typeof dimensions)[number][0];
type Scores = Record<Dimension, number | null>;
type CompletedScores = Record<Dimension, number>;

const emptyScores = (): Scores => Object.fromEntries(dimensions.map(([key]) => [key, null])) as Scores;

type Candidate = { consultaId: string; codigoConsulta: string; fecha: string; notaMedivozCaracteres: number };
type EvaluationContext = {
  consultaId: string;
  codigoConsulta: string;
  fecha: string;
  notaMedivozAsistida: string;
  duracionMedivozMs: number;
  evaluacion: null | {
    notaEssi: string;
    puntajesMedivoz: CompletedScores;
    puntajesEssi: CompletedScores;
    promedioMedivoz: number;
    promedioEssi: number;
    diferenciaPromedio: number;
    duracionMedivozMs: number;
    duracionEssiMs: number;
    diferenciaTiempoMs: number;
    comentarios: string | null;
  };
};

const formatAverage = (scores: Scores) => {
  const values = Object.values(scores).filter((value): value is number => value !== null);
  if (!values.length) return "-";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
};

const formatMinutes = (milliseconds: number) => `${(milliseconds / 60_000).toFixed(1)} min`;

const isComplete = (scores: Scores): scores is CompletedScores =>
  Object.values(scores).every((value) => typeof value === "number");

export default function Evaluations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [essiNote, setEssiNote] = useState("");
  const [scoresMedivoz, setScoresMedivoz] = useState<Scores>(emptyScores);
  const [scoresEssi, setScoresEssi] = useState<Scores>(emptyScores);
  const [essiMinutes, setEssiMinutes] = useState("");
  const [comments, setComments] = useState("");
  const [createEvaluatorOpen, setCreateEvaluatorOpen] = useState(false);
  const [evaluatorForm, setEvaluatorForm] = useState({ email: "", password: "", nombreCompleto: "" });

  const candidatesQuery = useQuery({
    queryKey: ["evaluation-candidates"],
    queryFn: async () => (await api.get<Candidate[]>("/evaluations/consultations")).data,
  });

  useEffect(() => {
    if (!selectedId && candidatesQuery.data?.[0]) setSelectedId(candidatesQuery.data[0].consultaId);
  }, [candidatesQuery.data, selectedId]);

  const contextQuery = useQuery({
    queryKey: ["evaluation-context", selectedId],
    queryFn: async () => (await api.get<EvaluationContext>(`/evaluations/consultations/${selectedId}`)).data,
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    const saved = contextQuery.data?.evaluacion;
    setEssiNote(saved?.notaEssi || "");
    setScoresMedivoz(saved?.puntajesMedivoz || emptyScores());
    setScoresEssi(saved?.puntajesEssi || emptyScores());
    setEssiMinutes(saved?.duracionEssiMs ? String(Math.round(saved.duracionEssiMs / 60_000)) : "");
    setComments(saved?.comentarios || "");
  }, [contextQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !isComplete(scoresMedivoz) || !isComplete(scoresEssi)) {
        throw new Error("Complete los nueve criterios para ambas notas");
      }
      return api.put(`/evaluations/consultations/${selectedId}`, {
        notaEssi: essiNote,
        puntajesMedivoz: scoresMedivoz,
        puntajesEssi: scoresEssi,
        duracionEssiMs: Math.round(Number(essiMinutes) * 60_000),
        comentarios: comments || null,
      });
    },
    onSuccess: () => {
      toast.success("Evaluacion PDQI-9 guardada");
      void queryClient.invalidateQueries({ queryKey: ["evaluation-context", selectedId] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "No se pudo guardar")),
  });

  const createEvaluatorMutation = useMutation({
    mutationFn: () => api.post("/auth/evaluators", evaluatorForm),
    onSuccess: () => {
      toast.success("Evaluador creado");
      setEvaluatorForm({ email: "", password: "", nombreCompleto: "" });
      setCreateEvaluatorOpen(false);
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "No se pudo crear el evaluador")),
  });

  const completedDimensions = useMemo(
    () => Object.values(scoresMedivoz).filter((score) => score !== null).length + Object.values(scoresEssi).filter((score) => score !== null).length,
    [scoresMedivoz, scoresEssi]
  );
  const canSave = essiNote.trim().length >= 20 && essiMinutes.trim() !== "" && Number.isFinite(Number(essiMinutes)) && Number(essiMinutes) >= 0 && isComplete(scoresMedivoz) && isComplete(scoresEssi);

  const setScore = (target: "medivoz" | "essi", dimension: Dimension, value: string) => {
    const setter = target === "medivoz" ? setScoresMedivoz : setScoresEssi;
    setter((current) => ({ ...current, [dimension]: value ? Number(value) : null }));
  };

  return (
    <div className="flex min-h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="app-content min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1500px] px-4 py-7 md:px-8">
          <header className="mb-6 flex flex-col justify-between gap-4 border-b pb-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold"><ClipboardCheck className="h-6 w-6 text-primary" />Evaluacion PDQI-9</h1>
              <p className="mt-1 text-sm text-muted-foreground">Comparacion ciega por codigo de consulta.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{completedDimensions}/18 puntajes</Badge>
              {user?.rol === "administrador" && (
                <Button size="sm" onClick={() => setCreateEvaluatorOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Evaluador</Button>
              )}
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="border-b pb-4 xl:border-b-0 xl:border-r xl:pr-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Fichas disponibles</p>
              {candidatesQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <div className="grid gap-1">
                  {(candidatesQuery.data || []).map((candidate) => (
                    <button key={candidate.consultaId} onClick={() => setSelectedId(candidate.consultaId)} className={`rounded-md px-3 py-2.5 text-left text-sm transition-colors ${selectedId === candidate.consultaId ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                      <span className="block font-mono text-xs">{candidate.codigoConsulta}</span>
                      <span className="mt-1 block text-xs opacity-80">{candidate.notaMedivozCaracteres} caracteres</span>
                    </button>
                  ))}
                  {!candidatesQuery.data?.length && <p className="text-sm text-muted-foreground">No hay fichas con resumen.</p>}
                </div>
              )}
            </aside>

            {contextQuery.isLoading ? (
              <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : contextQuery.data ? (
              <section className="min-w-0">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm"><Scale className="h-4 w-4 text-primary" /><span className="font-mono">{contextQuery.data.codigoConsulta}</span></div>
                  <div className="flex flex-wrap gap-2 text-sm"><Badge variant="outline">Medivoz: {formatAverage(scoresMedivoz)}</Badge><Badge variant="outline">ESSI: {formatAverage(scoresEssi)}</Badge><Badge variant="outline">Edicion Medivoz: {formatMinutes(contextQuery.data.duracionMedivozMs)}</Badge></div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="border p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4 text-primary" />Nota Medivoz revisada por el medico</div>
                    <Textarea value={contextQuery.data.notaMedivozAsistida} readOnly rows={11} className="resize-none bg-muted/30" />
                  </section>
                  <section className="border p-4">
                    <Label htmlFor="essi-note" className="mb-3 flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4 text-primary" />Nota registrada en ESSI</Label>
                    <Textarea id="essi-note" value={essiNote} onChange={(event) => setEssiNote(event.target.value)} rows={11} placeholder="Pegue aqui la nota registrada por el medico" className="resize-none" />
                  </section>
                </div>

                <section className="mt-5 overflow-x-auto border">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Criterio</th><th className="px-4 py-3">Medivoz asistido</th><th className="px-4 py-3">ESSI sin asistencia</th></tr></thead>
                    <tbody>
                      {dimensions.map(([key, label]) => (
                        <tr key={key} className="border-t"><td className="px-4 py-2.5 font-medium">{label}</td><td className="px-4 py-2"><ScoreSelect value={scoresMedivoz[key]} onChange={(value) => setScore("medivoz", key, value)} /></td><td className="px-4 py-2"><ScoreSelect value={scoresEssi[key]} onChange={(value) => setScore("essi", key, value)} /></td></tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <Textarea value={comments} onChange={(event) => setComments(event.target.value)} rows={3} placeholder="Comentarios del evaluador" className="resize-none" />
                  <div><Label htmlFor="essi-minutes" className="text-xs">Tiempo ESSI (minutos)</Label><Input id="essi-minutes" type="number" min="0" value={essiMinutes} onChange={(event) => setEssiMinutes(event.target.value)} className="mt-1" /></div>
                  <Button className="h-auto min-h-11" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                    {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar evaluacion
                  </Button>
                </div>
              </section>
            ) : <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">Seleccione una ficha para evaluar.</div>}
          </div>
        </div>
      </main>

      <Dialog open={createEvaluatorOpen} onOpenChange={setCreateEvaluatorOpen}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Nuevo evaluador</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2"><div><Label>Nombre completo</Label><Input value={evaluatorForm.nombreCompleto} onChange={(event) => setEvaluatorForm({ ...evaluatorForm, nombreCompleto: event.target.value })} /></div><div><Label>Correo</Label><Input type="email" value={evaluatorForm.email} onChange={(event) => setEvaluatorForm({ ...evaluatorForm, email: event.target.value })} /></div><div><Label>Contrasena temporal</Label><Input type="password" value={evaluatorForm.password} onChange={(event) => setEvaluatorForm({ ...evaluatorForm, password: event.target.value })} /></div><Button disabled={createEvaluatorMutation.isPending} onClick={() => createEvaluatorMutation.mutate()}>{createEvaluatorMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear evaluador</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScoreSelect({ value, onChange }: { value: number | null; onChange: (value: string) => void }) {
  return <Select value={value ? String(value) : ""} onValueChange={onChange}><SelectTrigger className="h-9 w-28"><SelectValue placeholder="1-5" /></SelectTrigger><SelectContent>{[1, 2, 3, 4, 5].map((score) => <SelectItem key={score} value={String(score)}>{score}</SelectItem>)}</SelectContent></Select>;
}
