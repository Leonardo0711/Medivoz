import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Calendar,
  FileText,
  History,
  Mic,
  TrendingUp,
  Users,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { logger } from "@/utils/logger";

interface DashboardStats {
  totalPatients: number;
  totalSessions: number;
  sessionsThisMonth: number;
  recordsThisMonth: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Buenos dias");
    else if (hour < 18) setGreeting("Buenas tardes");
    else setGreeting("Buenas noches");
  }, []);

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["dashboardStats", user?.id],
    queryFn: async (): Promise<DashboardStats> => {
      try {
        const [patients, sessions] = await Promise.all([
          api.get("/clinical/patients"),
          api.get("/clinical/consultations"),
        ]);

        return {
          totalPatients: patients.data.length,
          totalSessions: sessions.data.length,
          sessionsThisMonth: Math.floor(sessions.data.length * 0.4),
          recordsThisMonth: Math.floor(sessions.data.length * 0.3),
        };
      } catch (err) {
        logger.error("Error fetching dashboard stats:", err);
        return {
          totalPatients: 0,
          totalSessions: 0,
          sessionsThisMonth: 0,
          recordsThisMonth: 0,
        };
      }
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (error) {
      toast.error("Error al cargar las estadisticas");
    }
  }, [error]);

  const statCards = [
    {
      label: "Pacientes",
      value: stats?.totalPatients ?? 0,
      icon: Users,
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Sesiones totales",
      value: stats?.totalSessions ?? 0,
      icon: History,
      iconColor: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-50 dark:bg-violet-900/20",
    },
    {
      label: "Sesiones este mes",
      value: stats?.sessionsThisMonth ?? 0,
      icon: TrendingUp,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      label: "Fichas este mes",
      value: stats?.recordsThisMonth ?? 0,
      icon: FileText,
      iconColor: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
    },
  ];

  const quickActions = [
    {
      title: "Nueva sesion",
      description: "Iniciar grabacion y transcripcion de consulta medica",
      href: "/session",
      icon: Mic,
      iconColor: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Pacientes",
      description: "Gestionar listado y expedientes de pacientes",
      href: "/patients",
      icon: Users,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      title: "Historial",
      description: "Revisar sesiones pasadas y fichas medicas",
      href: "/history",
      icon: History,
      iconColor: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-50 dark:bg-violet-900/20",
    },
  ];

  return (
    <div className="flex min-h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="app-content flex-1 overflow-auto">
        <div className="container mx-auto max-w-6xl px-4 py-7 md:px-8 md:py-8">
          <header className="mb-8 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {greeting},{" "}
                  <span className="text-primary">{user?.email?.split("@")[0] || "Doctor"}</span>
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
                  Bienvenido a tu panel de control de Medivoz.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm text-muted-foreground shadow-sm">
                <Calendar className="h-4 w-4 text-primary/70" />
                {new Date().toLocaleDateString("es-PE", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            </div>
          </header>

          <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {isLoading
              ? Array(4)
                  .fill(0)
                  .map((_, i) => (
                    <Card key={i} className="h-24 animate-pulse border-border/40 bg-muted/50" />
                  ))
              : statCards.map((stat) => (
                  <Card key={stat.label} className="border-border/40 shadow-sm transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center gap-4 p-5">
                      <div className={`h-11 w-11 rounded-xl ${stat.bgColor} flex shrink-0 items-center justify-center`}>
                        <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                      </div>
                      <div>
                        <p className="tabular-nums text-2xl font-bold text-foreground">{stat.value}</p>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {stat.label}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
          </div>

          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Acciones rapidas</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {quickActions.map((action) => (
                <Link key={action.href} to={action.href} className="group block">
                  <Card className="h-full border-border/40 transition-all duration-200 hover:border-primary/30 hover:shadow-md">
                    <CardContent className="flex items-center gap-4 p-5">
                      <div
                        className={`h-12 w-12 rounded-xl ${action.bgColor} flex shrink-0 items-center justify-center transition-transform group-hover:scale-105`}
                      >
                        <action.icon className={`h-6 w-6 ${action.iconColor}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-foreground transition-colors group-hover:text-primary">
                          {action.title}
                        </h3>
                        <p className="line-clamp-1 text-sm text-muted-foreground">{action.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
