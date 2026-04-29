import { CheckCircle } from "lucide-react";

export const BenefitsSection = () => {
  const benefits = [
    "70% menos tiempo en documentacion",
    "Reduccion de errores en historial clinico",
    "Mayor capacidad de consultas por jornada",
    "Menos tiempo operativo por consulta",
  ];

  const stats = [
    { value: "70%", label: "Menos tiempo de documentacion" },
    { value: "99%", label: "Precision en transcripcion" },
    { value: "30%", label: "Mas tiempo con pacientes" },
    { value: "1.2M+", label: "Horas recuperables al ano" },
  ];

  return (
    <section className="bg-muted/30 py-20">
      <div className="container">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <div>
              <h2 className="mb-4 text-3xl font-bold tracking-tight">Impacto real</h2>
              <p className="text-lg text-muted-foreground">
                Resultados medibles para mejorar la eficiencia de tu practica medica.
              </p>
            </div>

            <div className="space-y-3">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-start gap-4">
                  <div className="mt-1 rounded-full bg-green-500/10 p-1">
                    <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
                  </div>
                  <p className="text-base font-medium">{benefit}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-border/50 bg-background p-6 transition-colors hover:border-primary/20"
              >
                <p className="mb-2 text-4xl font-bold text-primary">{stat.value}</p>
                <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
