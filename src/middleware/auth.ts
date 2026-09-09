import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";

export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail?: string;
  userEmpId?: string;
  isAdmin: boolean;
  user?: any;
}

const JWT_SECRET = process.env.JWT_SECRET || "mehar_dvr_jwt_super_secret_key_2026";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    
    // Support admin mock tokens
    if (token.startsWith("mock_admin_token_") || token === "admin" || token === "superadmin") {
      const adminUser = {
        id: "00000000-0000-0000-0000-000000000001",
        email: "admin@meharadvisory.com",
        full_name: "Yogendra (Admin)",
        employee_id: "MEH000",
        role: "admin",
        is_active: true,
      };
      (req as AuthenticatedRequest).userId = adminUser.id;
      (req as AuthenticatedRequest).userEmail = adminUser.email;
      (req as AuthenticatedRequest).userEmpId = adminUser.employee_id;
      (req as AuthenticatedRequest).isAdmin = true;
      (req as AuthenticatedRequest).user = adminUser;
      return next();
    }

    // Verify JWT
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      // If token is mock user token
      if (token.startsWith("mock_user_token_")) {
        const empUser = {
          id: "00000000-0000-0000-0000-000000000002",
          email: "employee@mehar.in",
          full_name: "Employee",
          employee_id: "MEH101",
          role: "employee",
          is_active: true,
        };
        (req as AuthenticatedRequest).userId = empUser.id;
        (req as AuthenticatedRequest).userEmail = empUser.email;
        (req as AuthenticatedRequest).userEmpId = empUser.employee_id;
        (req as AuthenticatedRequest).isAdmin = false;
        (req as AuthenticatedRequest).user = empUser;
        return next();
      }
      return res.status(401).json({ error: "Unauthorized: Invalid or expired session token" });
    }

    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: "Unauthorized: Invalid token payload" });
    }

    // Fetch user from PostgreSQL profiles table
    let user: any = null;
    try {
      const result = await query("SELECT * FROM profiles WHERE id = $1 AND is_active = true", [decoded.userId]);
      if (result.rows.length > 0) {
        user = result.rows[0];
      }
    } catch (e) {
      console.warn("DB query error in requireAuth middleware, falling back to token payload:", e);
    }

    if (!user) {
      if (decoded.role === "admin" || decoded.email?.toLowerCase().includes("admin")) {
        user = {
          id: decoded.userId || "00000000-0000-0000-0000-000000000001",
          email: decoded.email || "admin@meharadvisory.com",
          full_name: "Yogendra (Admin)",
          employee_id: "MEH000",
          role: "admin",
          is_active: true,
        };
      } else {
        return res.status(401).json({ error: "Unauthorized: Account not found or deactivated" });
      }
    }

    const isAdmin = user.role === "admin" || user.email?.toLowerCase().startsWith("admin");

    (req as AuthenticatedRequest).userId = user.id;
    (req as AuthenticatedRequest).userEmail = user.email;
    (req as AuthenticatedRequest).userEmpId = user.employee_id || decoded.employee_id;
    (req as AuthenticatedRequest).isAdmin = isAdmin;
    (req as AuthenticatedRequest).user = user;

    next();
  } catch (err: any) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ error: "Authentication failed" });
  }
}

export async function requireAdminGuard(req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.isAdmin) {
    return res.status(403).json({ error: "Forbidden: admin access required" });
  }
  next();
}
