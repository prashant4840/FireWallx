import jwt from "jsonwebtoken";
import type { Request } from "express";

const sensitivePrefixes = ["/admin", "/auth", "/payments", "/internal"];
const rolePolicy: Record<string, string[]> = {
  "/admin": ["admin", "security-admin"],
  "/payments": ["admin", "finance"],
  "/internal": ["admin", "service"]
};

export interface AuthResult {
  ok: boolean;
  reason?: string;
  role?: string;
  userId?: string;
}

const resolveRequiredRoles = (path: string): string[] => {
  const entry = Object.entries(rolePolicy).find(([prefix]) => path.startsWith(prefix));
  return entry?.[1] ?? [];
};

export const enforceZeroTrust = (req: Request): AuthResult => {
  const isSensitive = sensitivePrefixes.some((prefix) => req.path.startsWith(prefix));
  if (!isSensitive) {
    return { ok: true };
  }

  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.replace("Bearer ", "")
    : undefined;

  if (!token) {
    return { ok: false, reason: "missing token for sensitive endpoint" };
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return { ok: false, reason: "jwt secret not configured" };
    }

    const decoded = jwt.verify(token, secret) as { sub?: string; role?: string };
    const requiredRoles = resolveRequiredRoles(req.path);
    if (requiredRoles.length > 0 && (!decoded.role || !requiredRoles.includes(decoded.role))) {
      return { ok: false, reason: `rbac denied: requires ${requiredRoles.join(",")}` };
    }

    return { ok: true, role: decoded.role, userId: decoded.sub };
  } catch {
    return { ok: false, reason: "invalid token" };
  }
};
