import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  profiles,
  sessions,
  specialities,
  userAudit,
  userRoles,
  users,
} from "../../db/schema/auth.js";
import { anamnesisTemplates } from "../../db/schema/clinical.js";
import { hashPassword } from "../../core/utils/hash.js";
import { logger } from "../../core/utils/logger.js";
import type {
  CreateManagedUserInput,
  ListUsersQuery,
  UpdateManagedUserInput,
  UpdateManagedUserStatusInput,
} from "./admin.schema.js";

const clinicalSpecialities = [
  "Neurologia",
  "Endocrinologia",
  "Psiquiatria",
  "Reumatologia",
  "Hematologia",
] as const;

type ManagedRole = CreateManagedUserInput["rol"];

export class AdminService {
  private async resolveSpeciality(role: ManagedRole, specialityId?: number | null) {
    if (role === "doctor") {
      return db.query.specialities.findFirst({
        where: and(
          eq(specialities.id, specialityId!),
          eq(specialities.esAdministrativa, false),
          eq(specialities.activa, true),
          inArray(specialities.nombre, [...clinicalSpecialities])
        ),
      });
    }

    const specialityName = role === "evaluador" ? "Evaluacion clinica" : "Medicina general";
    return db.query.specialities.findFirst({
      where: and(
        eq(specialities.nombre, specialityName),
        ...(role === "evaluador"
          ? [eq(specialities.esAdministrativa, true), eq(specialities.activa, true)]
          : [])
      ),
    });
  }

  private async getLatestTemplateId(specialityId: number) {
    const template = await db.query.anamnesisTemplates.findFirst({
      columns: { id: true },
      where: and(
        eq(anamnesisTemplates.especialidadId, specialityId),
        eq(anamnesisTemplates.esActiva, true)
      ),
      orderBy: [desc(anamnesisTemplates.numeroVersion)],
    });
    return template?.id ?? null;
  }

  private specialityError(role: ManagedRole) {
    if (role === "evaluador") return "Falta configurar la especialidad administrativa de evaluación";
    if (role === "administrador") return "Falta configurar la especialidad administrativa general";
    return "La especialidad seleccionada no está disponible";
  }

  async listUsers(query: ListUsersQuery) {
    const conditions = [];
    if (query.search) {
      conditions.push(or(
        ilike(users.email, `%${query.search}%`),
        ilike(profiles.nombreCompleto, `%${query.search}%`),
        ilike(specialities.nombre, `%${query.search}%`)
      )!);
    }
    if (query.estado) conditions.push(eq(users.estado, query.estado));
    if (query.rol) conditions.push(eq(userRoles.rol, query.rol));

    return db
      .select({
        id: users.id,
        email: users.email,
        estado: users.estado,
        ultimoLogin: users.ultimoLogin,
        creadoEn: users.createdAt,
        nombreCompleto: profiles.nombreCompleto,
        especialidadId: profiles.especialidadId,
        especialidad: specialities.nombre,
        rol: userRoles.rol,
      })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .innerJoin(specialities, eq(specialities.id, profiles.especialidadId))
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(profiles.nombreCompleto), asc(users.email));
  }

  async createUser(actorId: string, input: CreateManagedUserInput) {
    const existing = await db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.email, input.email),
    });
    if (existing) throw new Error("El correo ya está registrado");

    const speciality = await this.resolveSpeciality(input.rol, input.especialidadId);
    if (!speciality) throw new Error(this.specialityError(input.rol));

    const passwordHash = await hashPassword(input.password);
    const defaultTemplateId = input.rol === "doctor"
      ? await this.getLatestTemplateId(speciality.id)
      : null;

    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash, estado: "activa" })
        .returning({ id: users.id, email: users.email, estado: users.estado });

      await tx.insert(profiles).values({
        userId: user.id,
        nombreCompleto: input.nombreCompleto,
        especialidadId: speciality.id,
        plantillaAnamnesisPredeterminadaId: defaultTemplateId,
      });
      await tx.insert(userRoles).values({ userId: user.id, rol: input.rol });
      await tx.insert(userAudit).values({
        actorId,
        targetUserId: user.id,
        action: "usuario_creado",
        newStatus: "activa",
        details: {
          email: user.email,
          rol: input.rol,
          especialidadId: speciality.id,
        },
      });

      return {
        ...user,
        nombreCompleto: input.nombreCompleto,
        rol: input.rol,
        especialidadId: speciality.id,
        especialidad: speciality.nombre,
      };
    });

    logger.info("[admin] user:created", {
      actorId,
      targetUserId: created.id,
      role: created.rol,
    });
    return created;
  }

  async updateUser(actorId: string, targetUserId: string, input: UpdateManagedUserInput) {
    const emailOwner = await db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.email, input.email),
    });
    if (emailOwner && emailOwner.id !== targetUserId) {
      throw new Error("El correo ya está registrado");
    }

    const speciality = await this.resolveSpeciality(input.rol, input.especialidadId);
    if (!speciality) throw new Error(this.specialityError(input.rol));
    const defaultTemplateId = input.rol === "doctor"
      ? await this.getLatestTemplateId(speciality.id)
      : null;
    const passwordHash = input.password ? await hashPassword(input.password) : null;

    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('medivoz_admin_users'))`);

      const [target] = await tx
        .select({
          id: users.id,
          email: users.email,
          estado: users.estado,
          nombreCompleto: profiles.nombreCompleto,
          especialidadId: profiles.especialidadId,
          plantillaAnamnesisPredeterminadaId: profiles.plantillaAnamnesisPredeterminadaId,
          rol: userRoles.rol,
        })
        .from(users)
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!target) throw new Error("Usuario no encontrado");

      if (actorId === targetUserId && target.rol !== input.rol) {
        throw new Error("No puedes cambiar el rol de tu propia cuenta");
      }
      if (target.rol === "administrador" && input.rol !== "administrador" && target.estado === "activa") {
        const [activeAdmins] = await tx
          .select({ value: count() })
          .from(userRoles)
          .innerJoin(users, eq(users.id, userRoles.userId))
          .where(and(eq(userRoles.rol, "administrador"), eq(users.estado, "activa")));
        if (activeAdmins.value <= 1) {
          throw new Error("No puedes cambiar el rol del último administrador activo");
        }
      }

      const now = new Date();
      const nextDefaultTemplateId = input.rol === "doctor"
        && target.rol === "doctor"
        && target.especialidadId === speciality.id
        ? target.plantillaAnamnesisPredeterminadaId ?? defaultTemplateId
        : defaultTemplateId;
      await tx.update(users).set({
        email: input.email,
        ...(passwordHash ? { passwordHash } : {}),
        updatedAt: now,
      }).where(eq(users.id, targetUserId));
      await tx.update(profiles).set({
        nombreCompleto: input.nombreCompleto,
        especialidadId: speciality.id,
        plantillaAnamnesisPredeterminadaId: nextDefaultTemplateId,
        updatedAt: now,
      }).where(eq(profiles.userId, targetUserId));

      if (target.rol !== input.rol) {
        await tx.delete(userRoles).where(eq(userRoles.userId, targetUserId));
        await tx.insert(userRoles).values({ userId: targetUserId, rol: input.rol });
      }
      if (target.rol !== input.rol || passwordHash) {
        await tx
          .update(sessions)
          .set({ revocadaEn: now, ultimaActividad: now, updatedAt: now })
          .where(and(eq(sessions.userId, targetUserId), isNull(sessions.revocadaEn)));
      }

      await tx.insert(userAudit).values({
        actorId,
        targetUserId,
        action: "usuario_editado",
        previousStatus: target.estado,
        newStatus: target.estado,
        details: {
          anterior: {
            email: target.email,
            nombreCompleto: target.nombreCompleto,
            rol: target.rol,
            especialidadId: target.especialidadId,
          },
          nuevo: {
            email: input.email,
            nombreCompleto: input.nombreCompleto,
            rol: input.rol,
            especialidadId: speciality.id,
            contrasenaActualizada: Boolean(passwordHash),
          },
        },
      });

      return {
        id: targetUserId,
        email: input.email,
        estado: target.estado,
        nombreCompleto: input.nombreCompleto,
        rol: input.rol,
        especialidadId: speciality.id,
        especialidad: speciality.nombre,
      };
    });

    logger.info("[admin] user:updated", {
      actorId,
      targetUserId,
      role: updated.rol,
    });
    return updated;
  }

  async updateUserStatus(
    actorId: string,
    targetUserId: string,
    input: UpdateManagedUserStatusInput
  ) {
    if (actorId === targetUserId && input.estado !== "activa") {
      throw new Error("No puedes deshabilitar tu propia cuenta");
    }

    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('medivoz_admin_users'))`);

      const [target] = await tx
        .select({ id: users.id, estado: users.estado, email: users.email, rol: userRoles.rol })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!target) throw new Error("Usuario no encontrado");
      if (target.estado === input.estado) return target;

      if (target.rol === "administrador" && target.estado === "activa" && input.estado !== "activa") {
        const [activeAdmins] = await tx
          .select({ value: count() })
          .from(userRoles)
          .innerJoin(users, eq(users.id, userRoles.userId))
          .where(and(eq(userRoles.rol, "administrador"), eq(users.estado, "activa")));
        if (activeAdmins.value <= 1) {
          throw new Error("No puedes deshabilitar al último administrador activo");
        }
      }

      const [user] = await tx
        .update(users)
        .set({ estado: input.estado, updatedAt: now })
        .where(eq(users.id, targetUserId))
        .returning({ id: users.id, email: users.email, estado: users.estado });

      if (input.estado !== "activa") {
        await tx
          .update(sessions)
          .set({ revocadaEn: now, ultimaActividad: now, updatedAt: now })
          .where(and(eq(sessions.userId, targetUserId), isNull(sessions.revocadaEn)));
      }

      await tx.insert(userAudit).values({
        actorId,
        targetUserId,
        action: input.estado === "activa" ? "usuario_reactivado" : "usuario_suspendido",
        previousStatus: target.estado,
        newStatus: input.estado,
        details: { email: target.email, rol: target.rol },
      });
      return user;
    });

    logger.info("[admin] user:status-updated", {
      actorId,
      targetUserId,
      newStatus: updated.estado,
    });
    return updated;
  }
}

export const adminService = new AdminService();
