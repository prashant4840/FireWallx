import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

interface AlertInput {
  level: "LOW" | "MEDIUM" | "CRITICAL";
  type: string;
  message: string;
  sourceIp?: string;
  application: string;
  metadata?: Record<string, unknown>;
}

const recentAlertDedup = new Map<string, number>();
const DEDUP_WINDOW_MS = 30_000;

export const createAlertIfNeeded = async (input: AlertInput) => {
  const key = `${input.level}:${input.type}:${input.sourceIp ?? "unknown"}`;
  const now = Date.now();
  const last = recentAlertDedup.get(key) ?? 0;

  if (now - last < DEDUP_WINDOW_MS) {
    return null;
  }

  recentAlertDedup.set(key, now);

  return prisma.alert.create({
    data: {
      level: input.level,
      type: input.type,
      message: input.message,
      sourceIp: input.sourceIp,
      application: input.application,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined
    }
  });
};
