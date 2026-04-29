import { Link } from "react-router-dom";
import { ArrowRight, Clock3, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const HeroSection = () => {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,hsl(var(--primary)/0.16),transparent_28%),radial-gradient(circle_at_86%_14%,hsl(var(--secondary)/0.16),transparent_26%)]" />

      <div className="container relative z-10">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
          <div className="space-y-6">
            <p className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Nueva version Medivoz 2.0
            </p>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              <span className="bg-gradient-to-r from-medivoz-500 to-medivoz-700 bg-clip-text text-transparent">Medivoz</span>
              <span className="mt-2 block text-3xl font-medium text-foreground sm:text-4xl md:text-5xl">
                Scribe inteligente para consulta clinica
              </span>
            </h1>

            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              Transcribe, estructura y completa la historia clinica en tiempo real para que te enfoques en el paciente.
            </p>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Link to="/signup" className="w-full sm:w-auto">
                <Button size="lg" className="h-12 w-full rounded-full px-8 shadow-lg shadow-primary/20 sm:w-auto">
                  Empezar ahora
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>

              <Link to="/login" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="h-12 w-full rounded-full px-8 sm:w-auto">
                  Iniciar sesion
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative rounded-3xl border border-border/60 bg-card/90 p-6 shadow-2xl shadow-primary/10 backdrop-blur-sm">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Panel de impacto</h3>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                En vivo
              </span>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-border/50 bg-background p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Tiempo administrativo</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">-70%</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border/50 bg-background p-3 text-center">
                  <Clock3 className="mx-auto h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs text-muted-foreground">Rapidez</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-background p-3 text-center">
                  <FileText className="mx-auto h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs text-muted-foreground">Trazabilidad</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-background p-3 text-center">
                  <ShieldCheck className="mx-auto h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs text-muted-foreground">Seguridad</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
