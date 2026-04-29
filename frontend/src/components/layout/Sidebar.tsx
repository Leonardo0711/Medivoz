import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Cpu, History, Home, LogOut, Menu, Mic, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { logger } from "@/utils/logger";
import { ThemeToggleButton } from "@/components/ThemeToggle";
import { Logo } from "@/components/common/Logo";

const DESKTOP_COLLAPSED_WIDTH = "4rem";
const DESKTOP_EXPANDED_WIDTH = "15rem";
const MOBILE_TOPBAR_HEIGHT = "3.5rem";

export function Sidebar() {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(
    typeof window !== "undefined" ? window.innerWidth < 1280 : false
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const navItems = useMemo(
    () => [
      { name: "Inicio", href: "/dashboard", icon: Home },
      { name: "Pacientes", href: "/patients", icon: Users },
      { name: "Consulta en vivo", href: "/session", icon: Mic },
      { name: "Historial", href: "/history", icon: History },
      { name: "Agentes IA", href: "/agents", icon: Cpu },
    ],
    []
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-sidebar-width", isMobile ? "0px" : collapsed ? DESKTOP_COLLAPSED_WIDTH : DESKTOP_EXPANDED_WIDTH);
    root.style.setProperty("--app-topbar-height", isMobile ? MOBILE_TOPBAR_HEIGHT : "0px");

    return () => {
      root.style.setProperty("--app-sidebar-width", "0px");
      root.style.setProperty("--app-topbar-height", "0px");
    };
  }, [isMobile, collapsed]);

  useEffect(() => {
    if (isMobile) return;
    const mediaQuery = window.matchMedia("(max-width: 1279px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setCollapsed(event.matches);
    };

    setCollapsed(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [isMobile]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      logger.error("Error signing out:", error);
    }
  };

  const NavLink = ({ mobile = false, item }: { mobile?: boolean; item: (typeof navItems)[number] }) => {
    const isActive = location.pathname === item.href;
    const content = (
      <Link
        to={item.href}
        onClick={mobile ? () => setMobileOpen(false) : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
          isActive
            ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.2)]"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        {isActive && <span className="absolute left-0 top-2.5 h-5 w-[3px] rounded-r-full bg-primary" />}
        <item.icon className={cn("h-[18px] w-[18px] shrink-0", collapsed && !mobile && "mx-auto")} />
        {(!collapsed || mobile) && <span className="truncate">{item.name}</span>}
      </Link>
    );

    if (collapsed && !mobile) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="text-xs font-medium">
            {item.name}
          </TooltipContent>
        </Tooltip>
      );
    }

    return content;
  };

  if (isMobile) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-1">
            <ThemeToggleButton variant="ghost" size="sm" />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Abrir menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-[320px] border-r border-border/60 p-0">
                <div className="flex h-full flex-col bg-background">
                  <div className="flex h-14 items-center justify-between border-b border-border/60 px-4">
                    <Logo />
                    <ThemeToggleButton variant="ghost" size="sm" />
                  </div>

                  <div className="flex-1 overflow-y-auto px-3 py-4">
                    <nav className="grid gap-1">
                      {navItems.map((item) => (
                        <NavLink key={item.href} item={item} mobile />
                      ))}
                    </nav>
                  </div>

                  <div className="border-t border-border/60 p-3">
                    <p className="mb-2 truncate text-xs text-muted-foreground">{user?.email || "Usuario"}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={handleSignOut}
                    >
                      <LogOut className="h-4 w-4" />
                      Cerrar sesion
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border/60 bg-sidebar/95 backdrop-blur-sm transition-all duration-300",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className={cn("flex h-14 items-center border-b border-border/60", collapsed ? "justify-center px-2" : "justify-between px-4")}>
          <Logo collapsed={collapsed} />
          {!collapsed && <ThemeToggleButton variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" />}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-4">
          {!collapsed && (
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Navegacion
            </p>
          )}
          <nav className="grid gap-1">
            {navItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </nav>
        </div>

        <div className="space-y-1 border-t border-border/60 p-2">
          {collapsed && (
            <ThemeToggleButton
              variant="ghost"
              size="icon"
              className="h-9 w-full text-muted-foreground"
            />
          )}

          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 w-full text-[13px] text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              collapsed ? "justify-center px-0" : "justify-start px-3"
            )}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="mr-2 h-4 w-4" />}
            {!collapsed && <span className="text-xs uppercase tracking-[0.12em]">Ocultar</span>}
          </Button>

          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 w-full text-[13px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                  collapsed ? "justify-center px-0" : "justify-start px-3"
                )}
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                {!collapsed && <span className="ml-2">Salir</span>}
              </Button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={10} className="text-xs">
                Cerrar sesion
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
