import { and, asc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
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
  UpdateManagedUserStatusInput,
} from "./admin.schema.js";

const clinicalSpecialities = [
  "Neurologia",
  "Endocrinologia",
  "Psiquiatria",
  "Reumatologia",
  "Hematologia",
] as const;

export class AdminService {
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

    const speciality = input.rol === "evaluador"
      ? await db.query.specialities.findFirst({
          where: and(
            eq(specialities.nombre, "Evaluacion clinica"),
            eq(specialities.esAdministrativa, true),
            eq(specialities.activa, true)
          ),
        })
      : await db.query.specialities.findFirst({
          where: and(
            eq(specialities.id, input.especialidadId!),
            eq(specialities.esAdministrativa, false),
            eq(specialities.activa, true),
            inArray(specialities.nombre, [...clinicalSpecialities])
          ),
        });

    if (!speciality) {
      throw new Error(
        input.rol === "evaluador"
          ? "Falta configurar la especialidad administrativa de evaluación"
          : "La especialidad seleccionada no está disponible"
      );
    }

    const passwordHash = await hashPassword(input.password);
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash, estado: "activa" })
        .returning({ id: users.id, email: users.email, estado: users.estado });

      const defaultTemplate = input.rol === "doctor"
        ? await tx.query.anamnesisTemplates.findFirst({
            columns: { id: true },
            where: and(
              eq(anamnesisTemplates.especialidadId, speciality.id),
              eq(anamnesisTemplates.esActiva, true)
            ),
          })
        : null;

      await tx.insert(profiles).values({
        userId: user.id,
        nombreCompleto: input.nombreCompleto,
        especialidadId: speciality.id,
        plantillaAnamnesisPredeterminadaId: defaultTemplate?.id ?? null,
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

  async updateUserStatus(
    actorId: string,
    targetUserId: string,
    input: UpdateManagedUserStatusInput
  ) {
    if (actorId === targetUserId && input.estado !== "activa") {
      throw new Error("No puedes deshabilitar tu propia cuenta");
    }

    const target = await db.query.users.findFirst({
      columns: { id: true, estado: true, email: true },
      where: eq(users.id, targetUserId),
    });
    if (!target) throw new Error("Usuario no encontrado");

    const targetRoles = await db.query.userRoles.findMany({
      columns: { rol: true },
      where: eq(userRoles.userId, targetUserId),
    });
    if (targetRoles.some((role) => role.rol === "administrador")) {
      throw new Error("Las cuentas administradoras no se modifican desde esta pantalla");
    }
    if (target.estado === input.estado) return target;

    const now = new Date();
    const updated = await db.transaction(async (tx) => {
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
        details: { email: target.email },
      });
      return user;
    });

    logger.info("[admin] user:status-updated", {
      actorId,
      targetUserId,
      previousStatus: target.estado,
      newStatus: updated.estado,
    });
    return updated;
  }
}

export const adminService = new AdminService();
