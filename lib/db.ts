// lib/db.ts
import "server-only";
import { PrismaClient } from "@/lib/generated/prisma";

/** Avoid multiple engines during Next dev HMR */
declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaReady__: Promise<void> | undefined;
}

function makeClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  // Helpful local warning about overly small pools (optional)
  if (process.env.NODE_ENV !== "production") {
    const url = process.env.DATABASE_URL || "";
    if (/\bconnection_limit=1\b/i.test(url)) {
      console.warn(
        "[prisma] DATABASE_URL has connection_limit=1 — increase to 5–10 in dev to avoid pool timeouts."
      );
    }
  }

  // Graceful shutdown (Node runtime)
  process.once("beforeExit", async () => {
    try {
      await client.$disconnect();
    } catch {
      /* noop */
    }
  });

  return client;
}

const prisma = globalThis.__prisma__ ?? makeClient();
if (!globalThis.__prisma__) globalThis.__prisma__ = prisma;

/** A one-time connect promise callers can await */
export const prismaReady =
  globalThis.__prismaReady__ ??
  prisma.$connect().catch((err) => {
    console.error("[prisma] $connect failed:", err);
    throw err;
  });

if (!globalThis.__prismaReady__) globalThis.__prismaReady__ = prismaReady;

export default prisma;
