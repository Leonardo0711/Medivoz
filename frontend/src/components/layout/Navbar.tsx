import { Link, useNavigate } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle, ThemeToggleButton } from "@/components/ThemeToggle";
import { Logo } from "@/components/common/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/utils/logger";

export function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      logger.error("Error signing out:", error);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/90 backdrop-blur-md">
      <div className="container flex h-14 items-center justify-between px-4 md:px-8">
        <Logo />

        <div className="hidden items-center gap-6 md:flex">
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <ThemeToggle />
          </nav>

          {user ? (
            <div className="flex items-center gap-3">
              <Link to="/dashboard">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                >
                  Panel principal
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="gap-2 border-border/50 text-muted-foreground hover:text-destructive"
              >
                <LogOut size={15} />
                <span>Salir</span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Link to="/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-medium text-muted-foreground hover:text-foreground"
                >
                  Iniciar sesion
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm" className="rounded-lg px-5 shadow-sm transition-all hover:shadow-md">
                  Registrarse
                </Button>
              </Link>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggleButton variant="ghost" />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[90vw] max-w-[360px] border-l border-border/40 bg-background/95 p-6 backdrop-blur-xl"
            >
              <nav className="mt-8 flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-border/40 pb-6">
                  <span className="text-lg font-semibold">Menu</span>
                  <ThemeToggle />
                </div>

                <Link to="/" className="text-lg font-medium transition-colors hover:text-primary">
                  Inicio
                </Link>

                {user ? (
                  <div className="mt-auto space-y-4 border-t border-border/40 pt-8">
                    <Link to="/dashboard">
                      <Button className="w-full justify-start" size="lg">
                        Panel de control
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      onClick={handleSignOut}
                      className="w-full justify-start gap-3 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      size="lg"
                    >
                      <LogOut size={18} />
                      Cerrar sesion
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-3">
                    <Link to="/login">
                      <Button variant="outline" className="h-12 w-full justify-start text-base font-medium">
                        Iniciar sesion
                      </Button>
                    </Link>
                    <Link to="/signup">
                      <Button className="h-12 w-full justify-start text-base font-medium shadow-lg shadow-primary/10">
                        Registrarse
                      </Button>
                    </Link>
                  </div>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
