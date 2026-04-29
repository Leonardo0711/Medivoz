export const ProcessSection = () => {
  const steps = [
    "Selecciona un paciente desde tu panel",
    "Inicia la grabacion de la consulta",
    "La transcripcion aparece en tiempo real",
    "La ficha clinica se completa con asistencia IA",
  ];

  return (
    <section className="py-20">
      <div className="container">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="relative order-2 lg:order-1">
            <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-r from-primary/10 to-secondary/10 blur-3xl" />
            <img
              src="/lovable-uploads/78f5be33-db14-4a1e-9ae4-9090735758a9.png"
              alt="Interfaz de Medivoz"
              className="h-auto w-full rounded-2xl border border-border/50 object-contain shadow-2xl"
            />
          </div>

          <div className="order-1 space-y-8 lg:order-2">
            <div>
              <h2 className="mb-3 text-3xl font-bold tracking-tight">Flujo de trabajo simple</h2>
              <p className="text-lg text-muted-foreground">Disenado para ser intuitivo, rapido y confiable.</p>
            </div>

            <div className="space-y-5">
              {steps.map((step, index) => (
                <div key={step} className="group flex gap-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary/20 text-sm font-bold text-primary transition-all duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                    {index + 1}
                  </div>
                  <p className="pt-2 text-base font-medium sm:text-lg">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
