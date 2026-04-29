import { ClipboardEdit, FileText, HeartPulse, Mic } from "lucide-react";

type Feature = {
  title: string;
  description: string;
  icon: React.ElementType;
};

export const FeaturesSection = () => {
  const features: Feature[] = [
    {
      title: "Transcripcion en vivo",
      description: "Convierte la consulta medica en texto estructurado en tiempo real.",
      icon: Mic,
    },
    {
      title: "Conversacion organizada",
      description: "Separa voces y contexto con marcas de tiempo para revision clinica.",
      icon: FileText,
    },
    {
      title: "Prellenado inteligente",
      description: "Completa la ficha medica con informacion relevante y trazable.",
      icon: ClipboardEdit,
    },
    {
      title: "Atencion mas humana",
      description: "Reduce carga administrativa y dedica mas tiempo al paciente.",
      icon: HeartPulse,
    },
  ];

  return (
    <section id="features" className="py-20">
      <div className="container">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight">Caracteristicas clave</h2>
          <p className="text-muted-foreground">
            Herramientas pensadas para acelerar tu flujo clinico sin perder calidad documental.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="group rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-3 text-lg font-semibold">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
