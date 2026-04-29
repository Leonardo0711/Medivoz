import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    
    console.log(`
    🚀 Medivoz 2.0 Backend Started
    -------------------------------
    Environment: ${env.NODE_ENV}
    Port:        ${env.PORT}
    Host:        ${env.HOST}
    -------------------------------
    `);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
