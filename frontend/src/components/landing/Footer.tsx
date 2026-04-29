import { Logo } from "@/components/common/Logo";

export const Footer = () => {
  return (
    <footer className="border-t border-border/40 bg-muted/10 py-10">
      <div className="container">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo />
          <p className="text-sm text-muted-foreground">
            Copyright {new Date().getFullYear()} Medivoz. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
};
