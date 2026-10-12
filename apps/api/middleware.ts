import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_PUBLIC_KEY } from "./config";

export function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const token = authorization.slice("Bearer ".length);

    try {
        const decoded = jwt.verify(token, JWT_PUBLIC_KEY);

        if (typeof decoded === "string" || !decoded.sub) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        req.userId = decoded.sub;
        next();
    } catch {
        res.status(401).json({ error: "Invalid or expired token" });
    }
}