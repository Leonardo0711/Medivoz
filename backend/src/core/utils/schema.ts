import { zodToJsonSchema } from "zod-to-json-schema";
import { ZodSchema } from "zod";

export function convertSchema(schema: ZodSchema) {
  return zodToJsonSchema(schema, { target: "openApi3" }) as any;
}
