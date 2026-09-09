import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { query } from "../config/db.js";
import { requireAuth, requireAdminGuard, AuthenticatedRequest } from "../middleware/auth.js";

export const adminRouter = Router();

// Require auth and admin guard for all admin endpoints
adminRouter.use(requireAuth);
adminRouter.use(requireAdminGuard);

/** Get all employees / profiles */
adminRouter.get("/employees", async (_req: Request, res: Response) => {
  try {
    const result = await query(
      "SELECT id, email, full_name, employee_id, phone, role, avatar_url, is_active, created_at FROM profiles ORDER BY created_at DESC"
    );
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch employees" });
  }
});

/** Create new employee */
adminRouter.post("/employees", async (req: Request, res: Response) => {
  try {
    const { email, password, full_name, name, employee_id, phone, role = "employee" } = req.body;
    const finalName = (full_name || name || "Employee").trim();
    const finalEmail = (email || "").trim().toLowerCase();

    if (!finalEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash(password, salt);

    const result = await query(
      `INSERT INTO profiles (email, password_hash, full_name, employee_id, phone, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, email, full_name, employee_id, phone, role, is_active, created_at`,
      [finalEmail, passHash, finalName, employee_id || null, phone || null, role]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to create employee" });
  }
});

/** Toggle employee active status */
adminRouter.patch("/employees/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const result = await query(
      "UPDATE profiles SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name, is_active",
      [Boolean(is_active), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }

    return res.json(result.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to update employee status" });
  }
});

/** Delete individual employee */
adminRouter.delete("/employees/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (id === "00000000-0000-0000-0000-000000000001") {
      return res.status(400).json({ error: "Cannot delete Super Admin account." });
    }

    await query("DELETE FROM visits WHERE employee_id = $1", [id]);
    await query("DELETE FROM employee_location_assignments WHERE employee_id = $1", [id]);
    const result = await query(
      "DELETE FROM profiles WHERE id = $1 AND employee_id NOT IN ('MEH000', 'MEH-ADM-001') AND email != 'admin@meharadvisory.com' RETURNING id, full_name, email, employee_id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Employee not found or cannot be deleted." });
    }

    return res.json({ success: true, deleted: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to delete employee" });
  }
});

/** Delete all field employees (Reset field users) */
adminRouter.delete("/employees", async (_req: Request, res: Response) => {
  try {
    await query("DELETE FROM visits WHERE employee_id IN (SELECT id FROM profiles WHERE role != 'admin')");
    await query("DELETE FROM employee_location_assignments WHERE employee_id IN (SELECT id FROM profiles WHERE role != 'admin')");
    const result = await query(
      "DELETE FROM profiles WHERE (role != 'admin' OR role IS NULL) AND employee_id NOT IN ('MEH000', 'MEH-ADM-001') AND email != 'admin@meharadvisory.com' RETURNING id, full_name, email, employee_id"
    );

    return res.json({ success: true, count: result.rowCount, deleted: result.rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to clear field employees" });
  }
});

/** Get all locations */
adminRouter.get("/locations", async (_req: Request, res: Response) => {
  try {
    const result = await query("SELECT * FROM locations ORDER BY created_at DESC");
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch locations" });
  }
});

/** Create new fixed location */
adminRouter.post("/locations", async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { name, address, latitude, longitude, radius_meters = 100 } = req.body;
    if (!name || !address || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "Name, address, latitude, and longitude are required." });
    }

    const result = await query(
      `INSERT INTO locations (name, address, latitude, longitude, radius_meters, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING *`,
      [name.trim(), address.trim(), Number(latitude), Number(longitude), Number(radius_meters), authReq.userId]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to create location" });
  }
});

/** Toggle location active status */
adminRouter.patch("/locations/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const result = await query(
      "UPDATE locations SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [Boolean(is_active), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Location not found" });
    }

    return res.json(result.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to update location" });
  }
});

/** Get all visits (Admin DVR report overview) */
adminRouter.get("/visits", async (req: Request, res: Response) => {
  try {
    const { employee_id, location_id, from_date, to_date } = req.query;
    let sql = `
      SELECT v.*, l.name as location_name, l.address as location_address, p.full_name as employee_name, p.email as employee_email, p.employee_id as employee_code
      FROM visits v
      LEFT JOIN locations l ON v.location_id = l.id
      LEFT JOIN profiles p ON v.employee_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (employee_id) {
      params.push(employee_id);
      sql += ` AND v.employee_id = $${params.length}`;
    }

    if (location_id) {
      params.push(location_id);
      sql += ` AND v.location_id = $${params.length}`;
    }

    if (from_date) {
      params.push(from_date);
      sql += ` AND v.created_at >= $${params.length}`;
    }

    if (to_date) {
      params.push(to_date);
      sql += ` AND v.created_at <= $${params.length}`;
    }

    sql += " ORDER BY v.created_at DESC";

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch admin visits" });
  }
});

/** Admin Dashboard Stats Overview */
adminRouter.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [empCount, locCount, visitCount, verifiedCount] = await Promise.all([
      query("SELECT COUNT(*) FROM profiles WHERE is_active = true"),
      query("SELECT COUNT(*) FROM locations WHERE is_active = true"),
      query("SELECT COUNT(*) FROM visits"),
      query("SELECT COUNT(*) FROM visits WHERE is_verified = true"),
    ]);

    return res.json({
      totalEmployees: parseInt(empCount.rows[0]?.count || "0", 10),
      totalLocations: parseInt(locCount.rows[0]?.count || "0", 10),
      totalVisits: parseInt(visitCount.rows[0]?.count || "0", 10),
      verifiedVisits: parseInt(verifiedCount.rows[0]?.count || "0", 10),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch dashboard stats" });
  }
});

/** Export DVR Visits as CSV */
adminRouter.get("/export-csv", async (_req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        v.id as "Visit ID",
        p.full_name as "Employee Name",
        p.email as "Employee Email",
        l.name as "Location Name",
        l.address as "Location Address",
        v.purpose as "Visit Purpose",
        v.distance_meters as "Distance (m)",
        v.is_verified as "Verified",
        v.remarks as "Remarks",
        v.created_at as "Timestamp"
      FROM visits v
      JOIN locations l ON v.location_id = l.id
      JOIN profiles p ON v.employee_id = p.id
      ORDER BY v.created_at DESC
    `);

    if (result.rows.length === 0) {
      return res.send("No records found");
    }

    const headers = Object.keys(result.rows[0]).join(",");
    const rows = result.rows.map((r) =>
      Object.values(r)
        .map((val) => `"${String(val ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );

    const csvContent = [headers, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=dvr_report_${Date.now()}.csv`);
    return res.send(csvContent);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to export CSV" });
  }
});

