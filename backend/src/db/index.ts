import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";

import * as enums from "./schema/enums.js";
import * as auth from "./schema/auth.js";
import * as clinical from "./schema/clinical.js";
import * as scribe from "./schema/scribe.js";
import * as agents from "./schema/agents.js";

export const schema = {
  ...enums,
  ...auth,
  ...clinical,
  ...scribe,
  ...agents,
};

const queryClient = postgres(env.DATABASE_URL);
export const db = drizzle(queryClient, { schema });

export type Db = typeof db;
