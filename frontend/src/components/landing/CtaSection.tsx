import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const CtaSection = () => {
  return (
    <section className="relative overflow-hidden py-20">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-secondary/10" />
      <div className="container relative z-10 mx-auto max-w-3xl text-center">
        <h2 className="mb-4 text-4xl font-bold tracking-tight">Transforma tu practica clinica hoy</h2>
        <p className="mb-8 text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Unete a los equipos medicos que ya optimizan su consulta con un flujo digital moderno y trazable.
        </p>
        <div className="flex justify-center">
          <Link to="/signup">
            <Button
              size="lg"
              className="h-auto rounded-full px-10 py-6 text-base shadow-xl transition-all duration-300 hover:-translate-y-0.5"
            >
              Comenzar ahora
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};
