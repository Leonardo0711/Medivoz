import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Pencil,
  Power,
  PowerOff,
  Search,
  ShieldCheck,
  UserCog,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import api, { getApiErrorMessage } from "@/lib/api";
import { formatSpecialityName } from "@/utils/speciality";

type AccountStatus = "activa" | "suspendida" | "bloqueada";
type UserRole = "doctor" | "evaluador" | "administrador";

type ManagedUser = {
  id: string;
  email: string;
  estado: AccountStatus;
  ultimoLogin: string | null;
  creadoEn: string;
  nombreCompleto: string;
  especialidadId: number;
  especialidad: string;
  rol: UserRole;
};

type Speciality = { id: number; nombre: string };

type ManagedUserForm = {
  nombreCompleto: string;
  email: string;
  password: string;
  rol: UserRole;
  especialidadId: string;
};

const initialForm: ManagedUserForm = {
  nombreCompleto: "",
  email: "",
  password: "",
  rol: "doctor",
  especialidadId: "",
};

const roleLabels: Record<UserRole, string> = {
  doctor: "Médico",
  evaluador: "Evaluador",
  administrador: "Administrador",
};

const statusLabels: Record<AccountStatus, string> = {
  activa: "Activa",
  suspendida: "Deshabilitada",
  bloqueada: "Bloqueada",
};

const formatDate = (value: string | null) => {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export default function Users() {
  const { user: currentUser, setUser } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<ManagedUserForm>(initialForm);
  const [pendingStatusUser, setPendingStatusUser] = useState<ManagedUser | null>(null);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await api.get<ManagedUser[]>("/admin/users")).data,
  });

  const specialitiesQuery = useQuery({
    queryKey: ["specialities"],
    queryFn: async () => (await api.get<Speciality[]>("/auth/specialities")).data,
  });

  const filteredUsers = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es");
    return (usersQuery.data || []).filter((managedUser) => {
      const matchesSearch = !normalized || [
        managedUser.nombreCompleto,
        managedUser.email,
        managedUser.especialidad,
      ].some((value) => value.toLocaleLowerCase("es").includes(normalized));
      const matchesRole = roleFilter === "todos" || managedUser.rol === roleFilter;
      const matchesStatus = statusFilter === "todos" || managedUser.estado === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, search, statusFilter, usersQuery.data]);

  const closeForm = () => {
    setFormOpen(false);
    setEditingUser(null);
    setForm(initialForm);
  };

  const openCreate = () => {
    setEditingUser(null);
    setForm(initialForm);
    setFormOpen(true);
  };

  const openEdit = (managedUser: ManagedUser) => {
    setEditingUser(managedUser);
    setForm({
      nombreCompleto: managedUser.nombreCompleto,
      email: managedUser.email,
      password: "",
      rol: managedUser.rol,
      especialidadId: managedUser.rol === "doctor" ? String(managedUser.especialidadId) : "",
    });
    setFormOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: () => api.post("/admin/users", {
      nombreCompleto: form.nombreCompleto.trim(),
      email: form.email.trim(),
      password: form.password,
      rol: form.rol,
      especialidadId: form.rol === "doctor" ? Number(form.especialidadId) : null,
    }),
    onSuccess: () => {
      toast.success("Usuario creado correctamente");
      closeForm();
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, "No se pudo crear el usuario"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/admin/users/${editingUser!.id}`, {
      nombreCompleto: form.nombreCompleto.trim(),
      email: form.email.trim(),
      ...(form.password ? { password: form.password } : {}),
      rol: form.rol,
      especialidadId: form.rol === "doctor" ? Number(form.especialidadId) : null,
    }),
    onSuccess: async () => {
      toast.success("Usuario actualizado correctamente");
      const editedCurrentAccount = editingUser?.id === currentUser?.id;
      closeForm();
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      if (editedCurrentAccount) {
        const profile = (await api.get("/auth/me")).data;
        setUser(profile);
        localStorage.setItem("user", JSON.stringify(profile));
      }
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, "No se pudo editar el usuario"));
    },
  });

  const statusMutation = useMutation({
    mutationFn: (managedUser: ManagedUser) => api.patch(`/admin/users/${managedUser.id}/status`, {
      estado: managedUser.estado === "activa" ? "suspendida" : "activa",
    }),
    onSuccess: (_, managedUser) => {
      toast.success(
        managedUser.estado === "activa"
          ? "Usuario deshabilitado y sesiones cerradas"
          : "Usuario habilitado correctamente"
      );
      setPendingStatusUser(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, "No se pudo actualizar la cuenta"));
    },
  });

  const isEditing = Boolean(editingUser);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canSubmit = Boolean(
    form.nombreCompleto.trim().length >= 3 &&
      form.email.trim() &&
      (isEditing ? form.password.length === 0 || form.password.length >= 12 : form.password.length >= 12) &&
      (form.rol !== "doctor" || form.especialidadId)
  );

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="app-content min-w-0 flex-1">
        <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8">
          <header className="mb-5 flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                <UserCog className="h-6 w-6 text-primary" />
                Gestión de usuarios
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Crea, edita y controla el acceso de médicos, evaluadores y administradores.
              </p>
            </div>
            <Button onClick={openCreate}>
              <UserPlus className="mr-2 h-4 w-4" />
              Crear usuario
            </Button>
          </header>

          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(260px,1fr)_200px_200px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Buscar por nombre, correo o especialidad"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger aria-label="Filtrar por rol"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los roles</SelectItem>
                <SelectItem value="doctor">Médicos</SelectItem>
                <SelectItem value="evaluador">Evaluadores</SelectItem>
                <SelectItem value="administrador">Administradores</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="activa">Activas</SelectItem>
                <SelectItem value="suspendida">Deshabilitadas</SelectItem>
                <SelectItem value="bloqueada">Bloqueadas</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="h-10 justify-center px-3">
              {filteredUsers.length} usuarios
            </Badge>
          </div>

          <div className="overflow-hidden rounded-md border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Usuario</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Especialidad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Último acceso</TableHead>
                    <TableHead className="w-28 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersQuery.isLoading ? (
                    <TableRow><TableCell colSpan={6} className="h-40 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /></TableCell></TableRow>
                  ) : filteredUsers.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-40 text-center text-muted-foreground">No se encontraron usuarios.</TableCell></TableRow>
                  ) : filteredUsers.map((managedUser) => {
                    const isCurrentAccount = managedUser.id === currentUser?.id;
                    return (
                      <TableRow key={`${managedUser.id}-${managedUser.rol}`}>
                        <TableCell>
                          <p className="font-medium text-foreground">{managedUser.nombreCompleto}</p>
                          <p className="text-xs text-muted-foreground">{managedUser.email}</p>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            {managedUser.rol === "administrador" && <ShieldCheck className="h-4 w-4 text-primary" />}
                            {roleLabels[managedUser.rol]}
                          </span>
                        </TableCell>
                        <TableCell>{formatSpecialityName(managedUser.especialidad)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={managedUser.estado === "activa"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-800"}
                          >
                            {statusLabels[managedUser.estado]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(managedUser.ultimoLogin)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(managedUser)}
                              title="Editar usuario"
                              aria-label={`Editar a ${managedUser.nombreCompleto}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isCurrentAccount || statusMutation.isPending}
                              onClick={() => setPendingStatusUser(managedUser)}
                              title={isCurrentAccount
                                ? "No puedes deshabilitar tu propia cuenta"
                                : managedUser.estado === "activa" ? "Deshabilitar usuario" : "Habilitar usuario"}
                              aria-label={managedUser.estado === "activa" ? "Deshabilitar usuario" : "Habilitar usuario"}
                            >
                              {managedUser.estado === "activa"
                                ? <PowerOff className="h-4 w-4 text-destructive" />
                                : <Power className="h-4 w-4 text-emerald-600" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </main>

      <Dialog open={formOpen} onOpenChange={(open) => open ? setFormOpen(true) : closeForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar usuario" : "Crear usuario"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Actualiza los datos, el rol y la especialidad de la cuenta."
                : "Completa los datos de acceso y asigna el rol de la nueva cuenta."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="managed-user-name">Nombre completo</Label>
              <Input id="managed-user-name" value={form.nombreCompleto} onChange={(event) => setForm({ ...form, nombreCompleto: event.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="managed-user-email">Correo institucional</Label>
              <Input id="managed-user-email" type="email" autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="managed-user-role">Rol</Label>
              <Select
                value={form.rol}
                disabled={editingUser?.id === currentUser?.id}
                onValueChange={(rol: UserRole) => setForm({ ...form, rol, especialidadId: "" })}
              >
                <SelectTrigger id="managed-user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="doctor">Médico</SelectItem>
                  <SelectItem value="evaluador">Evaluador</SelectItem>
                  <SelectItem value="administrador">Administrador</SelectItem>
                </SelectContent>
              </Select>
              {editingUser?.id === currentUser?.id && (
                <p className="text-xs text-muted-foreground">Tu propio rol no puede modificarse.</p>
              )}
            </div>
            {form.rol === "doctor" && (
              <div className="grid gap-2">
                <Label htmlFor="managed-user-speciality">Especialidad</Label>
                <Select value={form.especialidadId} onValueChange={(especialidadId) => setForm({ ...form, especialidadId })}>
                  <SelectTrigger id="managed-user-speciality"><SelectValue placeholder="Selecciona una especialidad" /></SelectTrigger>
                  <SelectContent>
                    {(specialitiesQuery.data || []).map((speciality) => (
                      <SelectItem key={speciality.id} value={String(speciality.id)}>{formatSpecialityName(speciality.nombre)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="managed-user-password">
                {isEditing ? "Nueva contraseña (opcional)" : "Contraseña temporal"}
              </Label>
              <Input id="managed-user-password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              <p className="text-xs text-muted-foreground">
                {isEditing ? "Déjala vacía para conservar la actual. Mínimo 12 caracteres si la cambias." : "Mínimo 12 caracteres."}
              </p>
            </div>
            <Button
              disabled={!canSubmit || isSaving}
              onClick={() => isEditing ? updateMutation.mutate() : createMutation.mutate()}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingStatusUser)} onOpenChange={(open) => !open && setPendingStatusUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatusUser?.estado === "activa" ? "Deshabilitar usuario" : "Habilitar usuario"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatusUser?.estado === "activa"
                ? `Se cerrarán las sesiones activas de ${pendingStatusUser?.nombreCompleto} y no podrá ingresar hasta que vuelvas a habilitar la cuenta.`
                : `${pendingStatusUser?.nombreCompleto} podrá volver a iniciar sesión en Medivoz.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (pendingStatusUser) statusMutation.mutate(pendingStatusUser);
              }}
            >
              {statusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
