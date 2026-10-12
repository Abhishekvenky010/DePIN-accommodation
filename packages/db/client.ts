import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prismaClient: PrismaClient | undefined;
};

export const prismaClient =
  globalForPrisma.prismaClient ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaClient = prismaClient;
}

export * from "@prisma/client";
export type { Booking, Accommodation, User } from "@prisma/client";
