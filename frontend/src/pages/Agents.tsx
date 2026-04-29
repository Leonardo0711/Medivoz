import { BrainCircuit, Share2 } from "lucide-react";
import { AgentsProvider } from "@/contexts/AgentsContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { AgentsHeader } from "@/components/agents/AgentsHeader";
import { AgentsList } from "@/components/agents/AgentsList";
import { AgentFlow } from "@/components/agents/AgentFlow";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Agents() {
  return (
    <AgentsProvider>
      <div className="flex min-h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="app-content flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-7 md:px-6 md:py-8">
            <AgentsHeader />
            <Alert className="mx-auto max-w-4xl border-primary/20 bg-primary/5">
              <AlertTitle>Como funciona esta seccion</AlertTitle>
              <AlertDescription>
                Aqui defines y ajustas los agentes de apoyo (transcriptor/extractor). El autollenado de anamnesis
                se ejecuta desde la pantalla de consulta en vivo al procesar audio, incluso si esta vista aun no muestra
                mas agentes personalizados.
              </AlertDescription>
            </Alert>

            <section className="space-y-8 animate-fade-in delay-100">
              <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <BrainCircuit className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">Agentes activos</h2>
                  <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                    Gestiona los agentes de inteligencia artificial que procesan tus consultas medicas.
                  </p>
                </div>
              </div>

              <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 place-items-center lg:grid-cols-2">
                <AgentsList />
              </div>
            </section>

            <Separator className="mx-auto max-w-4xl bg-border/40" />

            <section className="space-y-8 animate-fade-in delay-200 pb-10">
              <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <Share2 className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">Orquestacion de flujo</h2>
                  <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                    Visualizacion del flujo de datos entre agentes durante el procesamiento de la consulta.
                  </p>
                </div>
              </div>

              <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card p-1 shadow-sm">
                <div className="relative h-[380px] overflow-hidden rounded-xl bg-muted/30 md:h-[500px]">
                  <div className="pointer-events-none absolute inset-0 opacity-5 [background-image:radial-gradient(circle,theme(colors.foreground)_1px,transparent_1px)] [background-size:20px_20px]" />
                  <AgentFlow readOnly={true} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AgentsProvider>
  );
}
