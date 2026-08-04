import crypto from "crypto";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { hashPassword, comparePassword } from "../../core/utils/hash.js";
import { db } from "../../db/index.js";
import {
  users,
  profiles,
  sessions,
  userRoles,
  specialities,
} from "../../db/schema/auth.js";
import { anamnesisTemplates } from "../../db/schema/clinical.js";
import { RegisterInput, LoginInput, CreateEvaluatorInput } from "./auth.schema.js";

const registrationSpecialities = [
  "Neurologia",
  "Endocrinologia",
  "Psiquiatria",
  "Reumatologia",
  "Hematologia",
] as const;

export class AuthService {
  private buildRotatingRefreshToken() {
    const refreshToken = crypto.randomBytes(40).toString("hex");
    const refreshTokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return { refreshToken, refreshTokenHash, expiresAt };
  }

  private async resolveUserAuthPayload(userId: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    const roles = await db.query.userRoles.findMany({
      where: eq(userRoles.userId, user.id),
    });

    const rol = roles.some((r) => r.rol === "administrador")
      ? "administrador"
      : roles.some((r) => r.rol === "evaluador")
        ? "evaluador"
        : "doctor";

    const [profile] = await db
      .select({
        nombreCompleto: profiles.nombreCompleto,
        especialidadId: profiles.especialidadId,
        especialidad: specialities.nombre,
        plantillaAnamnesisPredeterminadaId: profiles.plantillaAnamnesisPredeterminadaId,
      })
      .from(profiles)
      .innerJoin(specialities, eq(profiles.especialidadId, specialities.id))
      .where(eq(profiles.userId, user.id))
      .limit(1);

    return {
      id: user.id,
      email: user.email,
      rol,
      nombreCompleto: profile?.nombreCompleto ?? null,
      especialidadId: profile?.especialidadId ?? null,
      especialidad: profile?.especialidad ?? null,
      plantillaAnamnesisPredeterminadaId: profile?.plantillaAnamnesisPredeterminadaId ?? null,
    };
  }

  async listSpecialities() {
    const rows = await db
      .select({ id: specialities.id, nombre: specialities.nombre })
      .from(specialities)
      .where(
        and(
          eq(specialities.activa, true),
          eq(specialities.esAdministrativa, false),
          inArray(specialities.nombre, [...registrationSpecialities])
        )
      );

    const byName = new Map(rows.map((row) => [row.nombre, row]));
    return registrationSpecialities.flatMap((name) => {
      const row = byName.get(name);
      return row ? [row] : [];
    });
  }

  async getUserProfile(userId: string) {
    return this.resolveUserAuthPayload(userId);
  }

  async register(input: RegisterInput) {
    const { email, password, nombreCompleto, especialidadId } = input;

    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existing) {
      throw new Error("El correo ya esta registrado");
    }

    const passwordHash = await hashPassword(password);

    return await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          email,
          passwordHash,
          estado: "activa",
        })
        .returning();

      let finalEspecialidadId =
        typeof especialidadId === "string"
          ? Number.parseInt(especialidadId, 10)
          : especialidadId;
      if (!Number.isInteger(finalEspecialidadId) || finalEspecialidadId <= 0) {
        throw new Error("Debe seleccionar una especialidad");
      }

      const selectedSpeciality = await tx.query.specialities.findFirst({
        where: and(
          eq(specialities.id, finalEspecialidadId),
          eq(specialities.activa, true),
          eq(specialities.esAdministrativa, false),
          inArray(specialities.nombre, [...registrationSpecialities])
        ),
      });
      if (!selectedSpeciality) throw new Error("La especialidad seleccionada no esta disponible");

      const defaultTemplate = await tx.query.anamnesisTemplates.findFirst({
        columns: { id: true },
        where: and(
          eq(anamnesisTemplates.especialidadId, finalEspecialidadId),
          eq(anamnesisTemplates.esActiva, true)
        ),
        orderBy: [desc(anamnesisTemplates.numeroVersion)],
      });

      await tx.insert(profiles).values({
        userId: newUser.id,
        nombreCompleto,
        especialidadId: finalEspecialidadId,
        plantillaAnamnesisPredeterminadaId: defaultTemplate?.id ?? null,
      });

      await tx.insert(userRoles).values({
        userId: newUser.id,
        rol: "doctor",
      });

      return newUser;
    });
  }

  async createEvaluator(input: CreateEvaluatorInput) {
    const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (existing) throw new Error("El correo ya esta registrado");

    const evaluatorSpeciality = await db.query.specialities.findFirst({
      where: and(eq(specialities.nombre, "Evaluacion clinica"), eq(specialities.esAdministrativa, true)),
    });
    if (!evaluatorSpeciality) {
      throw new Error("Falta configurar la especialidad administrativa de evaluacion");
    }

    const passwordHash = await hashPassword(input.password);
    return db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash, estado: "activa" })
        .returning();
      await tx.insert(profiles).values({
        userId: user.id,
        nombreCompleto: input.nombreCompleto,
        especialidadId: evaluatorSpeciality.id,
      });
      await tx.insert(userRoles).values({ userId: user.id, rol: "evaluador" });
      return { id: user.id, email: user.email, nombreCompleto: input.nombreCompleto, rol: "evaluador" };
    });
  }

  async login(input: LoginInput, context: { ip?: string; userAgent?: string }) {
    const { email, password } = input;

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      throw new Error("Credenciales invalidas");
    }

    if (user.estado !== "activa") {
      throw new Error(`Tu cuenta esta ${user.estado}`);
    }

    const authUser = await this.resolveUserAuthPayload(user.id);
    const { refreshToken, refreshTokenHash, expiresAt } = this.buildRotatingRefreshToken();

    await db.insert(sessions).values({
      userId: user.id,
      refreshTokenHash,
      dispositivo: context.userAgent,
      ip: context.ip,
      userAgent: context.userAgent,
      expiraEn: expiresAt,
      ultimaActividad: new Date(),
    });

    await db
      .update(users)
      .set({ ultimoLogin: new Date() })
      .where(eq(users.id, user.id));

    return {
      user: authUser,
      refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const now = new Date();

    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.refreshTokenHash, hash), isNull(sessions.revocadaEn)),
    });

    if (!session) {
      throw new Error("Sesion invalida o expirada");
    }

    if (session.expiraEn < now) {
      await db
        .update(sessions)
        .set({ revocadaEn: now, ultimaActividad: now })
        .where(
          and(
            eq(sessions.id, session.id),
            eq(sessions.refreshTokenHash, hash),
            isNull(sessions.revocadaEn)
          )
        );
      throw new Error("Sesion invalida o expirada");
    }

    const { refreshToken: nextRefreshToken, refreshTokenHash, expiresAt } =
      this.buildRotatingRefreshToken();

    const rotated = await db
      .update(sessions)
      .set({
        refreshTokenHash,
        ultimaActividad: now,
        expiraEn: expiresAt,
      })
      .where(
        and(
          eq(sessions.id, session.id),
          eq(sessions.refreshTokenHash, hash),
          isNull(sessions.revocadaEn),
          gte(sessions.expiraEn, now)
        )
      )
      .returning({
        userId: sessions.userId,
      });

    const rotatedSession = rotated[0];
    if (!rotatedSession) {
      throw new Error("Sesion invalida o expirada");
    }

    const user = await this.resolveUserAuthPayload(rotatedSession.userId);

    return {
      user,
      refreshToken: nextRefreshToken,
    };
  }
}

export const authService = new AuthService();
