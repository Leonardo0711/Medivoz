import crypto from "crypto";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { hashPassword, comparePassword } from "../../core/utils/hash.js";
import { db } from "../../db/index.js";
import {
  users,
  profiles,
  sessions,
  userRoles,
  specialities,
} from "../../db/schema/auth.js";
import { RegisterInput, LoginInput } from "./auth.schema.js";

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
      : "doctor";

    return {
      id: user.id,
      email: user.email,
      rol,
    };
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
      if (finalEspecialidadId && Number.isNaN(finalEspecialidadId)) {
        finalEspecialidadId = undefined;
      }
      if (!finalEspecialidadId) {
        const fallbackSpeciality = await tx.query.specialities.findFirst({
          where: and(
            eq(specialities.activa, true),
            eq(specialities.esAdministrativa, false)
          ),
          orderBy: [desc(specialities.id)],
        });

        if (!fallbackSpeciality) {
          throw new Error("No hay especialidades activas configuradas");
        }
        finalEspecialidadId = fallbackSpeciality.id;
      }

      await tx.insert(profiles).values({
        userId: newUser.id,
        nombreCompleto,
        especialidadId: finalEspecialidadId,
      });

      await tx.insert(userRoles).values({
        userId: newUser.id,
        rol: "doctor",
      });

      return newUser;
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
