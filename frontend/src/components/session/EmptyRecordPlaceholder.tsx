import { FileText, ChevronRight, User, Mic, ClipboardCheck } from "lucide-react";

const steps = [
  { number: 1, label: "Selecciona Paciente", icon: User },
  { number: 2, label: "Graba Sesion", icon: Mic },
  { number: 3, label: "Revisa Ficha", icon: ClipboardCheck },
];

export function EmptyRecordPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center text-center h-full px-6 py-20 text-muted-foreground animate-in fade-in zoom-in-95 duration-500">
      <div className="h-20 w-20 rounded-2xl bg-accent flex items-center justify-center mb-6">
        <FileText className="h-9 w-9 text-accent-foreground/50" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1.5">Ficha lista para completar</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-8 leading-relaxed">
        Para comenzar a documentar la consulta, selecciona un paciente e inicia la grabacion.
      </p>

      <div className="flex items-center gap-3 w-full max-w-lg justify-center">
        {steps.map((step, i) => (
          <div key={step.number} className="contents">
            <div className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/40 bg-card flex-1">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <step.icon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-xs font-medium text-foreground">{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
