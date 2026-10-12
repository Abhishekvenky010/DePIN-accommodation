import type { NextFunction, Request, Response } from "express";

/**
 * Development middleware: skip JWT validation and set a dev user ID.
 * Replace with real auth middleware when JWT verification is enabled.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // DEV: fixed user ID for development
  req.userId = "dev-user-123";
  next();
}