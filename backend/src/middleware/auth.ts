import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { store } from "../db/store";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    roles: ("buyer" | "seller" | "operator")[];
    activeWallet: string | null;
  };
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization token" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    const user = store.db.users[decoded.userId];
    if (!user) {
      res.status(401).json({ error: "User session expired or user not found" });
      return;
    }

    req.user = {
      userId: user.id,
      email: user.email,
      roles: user.roles,
      activeWallet: user.activeWallet,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(role: "seller" | "operator") {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.roles.includes(role)) {
      res.status(403).json({ error: `Forbidden: requires ${role} role` });
      return;
    }
    next();
  };
}
