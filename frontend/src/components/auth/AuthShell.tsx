import { ReactNode } from "react";
import { Activity, CheckCircle2, FileText, ShieldCheck, Stethoscope } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

const highlights = [
  {
    icon: Activity,
    title: "Transcripcion en tiempo real",
    description: "Captura y estructura cada consulta sin romper el flujo medico.",
  },
  {
    icon: FileText,
    title: "Historia clinica asistida",
    description: "Completa secciones clave y deja al doctor siempre en control final.",
  },
  {
    icon: ShieldCheck,
    title: "Infraestructura aislada",
    description: "Datos clinicos y sesiones protegidos en tu VPS dedicado.",
  },
];

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-6 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,hsl(var(--primary)/0.15),transparent_30%),radial-gradient(circle_at_85%_10%,hsl(var(--secondary)/0.15),transparent_28%),radial-gradient(circle_at_50%_100%,hsl(var(--primary)/0.08),transparent_35%)]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)]">
        <section className="hidden rounded-3xl border border-border/50 bg-card/60 p-8 backdrop-blur-xl lg:flex lg:flex-col lg:justify-between xl:p-10">
          <div>
            <Logo className="mb-10" />
            <div className="max-w-md space-y-4">
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <Stethoscope className="h-3.5 w-3.5" />
                Plataforma Clinica
              </p>
              <h2 className="text-4xl font-semibold leading-tight text-foreground">
                Interfaz clinica elegante, veloz y lista para consulta real.
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Medivoz transforma la consulta en documentacion util y trazable, cuidando la experiencia del medico y del paciente.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {highlights.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm"
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={cn("flex w-full items-center justify-center")}>
          <div className="w-full rounded-3xl border border-border/60 bg-card p-6 shadow-xl shadow-primary/10 sm:p-8">
            <div className="mb-8 text-center">
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            </div>

            {children}

            <div className="mt-6 border-t border-border/60 pt-5 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
