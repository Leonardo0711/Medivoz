import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, Mail, Stethoscope, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthShell } from "@/components/auth/AuthShell";
import api, { getApiErrorMessage } from "@/lib/api";
import { logger } from "@/utils/logger";
import { formatSpecialityName } from "@/utils/speciality";

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [specialityId, setSpecialityId] = useState("");
  const [specialities, setSpecialities] = useState<Array<{ id: number; nombre: string }>>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/auth/specialities")
      .then((response) => setSpecialities(response.data || []))
      .catch((error) => {
        logger.error("Error loading specialities:", error);
        toast.error("No se pudieron cargar las especialidades");
      });
  }, []);

  const passwordStatus = useMemo(() => {
    if (!password) {
      return {
        message: "Usa al menos 8 caracteres para mayor seguridad.",
        state: "neutral" as const,
      };
    }

    if (password.length < 8) {
      return {
        message: "La contraseña es corta. Se recomienda mínimo 8 caracteres.",
        state: "weak" as const,
      };
    }

    const hasMix = /[A-Z]/.test(password) && /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);

    if (hasMix && hasNumber && hasSymbol) {
      return { message: "Contraseña sólida.", state: "strong" as const };
    }

    return {
      message: "Buen avance. Agrega numeros y simbolos para fortalecerla.",
      state: "medium" as const,
    };
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    if (!specialityId) {
      toast.error("Selecciona tu especialidad");
      return;
    }

    setIsLoading(true);

    try {
      await api.post("/auth/register", {
        email: email.trim().toLowerCase(),
        password,
        nombreCompleto: name.trim(),
        especialidadId: Number(specialityId),
      });

      toast.success("Registro completado. Ya puedes iniciar sesion.");
      navigate("/login");
    } catch (err: unknown) {
      logger.error("Error during signup:", err);
      toast.error(getApiErrorMessage(err, "No se pudo completar el registro"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Crear cuenta profesional"
      subtitle="Activa tu acceso clínico y empieza a documentar consultas con IA."
      footer={
        <>
          Ya tienes una cuenta?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Inicia sesion
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">
            Nombre completo
          </Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="name"
              placeholder="Dr. Juan Perez"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 pl-10"
              autoComplete="name"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="speciality" className="text-sm font-medium">
            Especialidad
          </Label>
          <div className="relative">
            <Stethoscope className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Select value={specialityId} onValueChange={setSpecialityId} required>
              <SelectTrigger
                id="speciality"
                className="h-12 border-primary/20 bg-background pl-10 shadow-sm transition-colors hover:border-primary/40"
              >
                <SelectValue placeholder="Selecciona tu especialidad" />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-border/70 shadow-xl">
                {specialities.map((speciality) => (
                  <SelectItem key={speciality.id} value={String(speciality.id)} className="py-2.5">
                    {formatSpecialityName(speciality.nombre)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Correo
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="doctor@essalud.gob.pe"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 pl-10"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Crea una contraseña segura"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 pl-10 pr-12"
              autoComplete="new-password"
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p
            className={[
              "text-xs",
              passwordStatus.state === "strong" ? "text-emerald-600 dark:text-emerald-400" : "",
              passwordStatus.state === "weak" ? "text-amber-600 dark:text-amber-400" : "",
              passwordStatus.state === "medium" ? "text-primary" : "",
              passwordStatus.state === "neutral" ? "text-muted-foreground" : "",
            ].join(" ")}
          >
            {passwordStatus.message}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">
            Confirmar contraseña
          </Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Repite la contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-12 pl-10 pr-12"
              autoComplete="new-password"
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Button
          type="submit"
          className="mt-2 h-12 w-full text-sm font-semibold"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creando cuenta...
            </>
          ) : (
            "Crear cuenta"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
