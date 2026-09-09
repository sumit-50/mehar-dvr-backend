import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { sendSignupOTP } from "../services/sms.service.js";
import { sendEmail, sendPasswordResetEmail } from "../services/email.service.js";

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || "mehar_dvr_jwt_super_secret_key_2026";

/** Request / Send OTP via Zectagon Gateway */
authRouter.post(["/send-otp", "/request-otp"], async (req: Request, res: Response) => {
  try {
    const { phone, mobile, purpose = "signup" } = req.body;
    const rawNumber = phone || mobile;

    if (!rawNumber) {
      return res.status(400).json({ error: "Mobile number is required." });
    }

    const cleanPhone = String(rawNumber).replace(/\D/g, "").slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ error: "Invalid mobile number. Exactly 10 digits required." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save in database
    await query(
      `INSERT INTO otp_verifications (phone, otp_code, purpose, expiry, is_verified)
       VALUES ($1, $2, $3, $4, false)`,
      [cleanPhone, otp, purpose, expiry]
    );

    // Send SMS via Zectagon Gateway
    const smsResult = await sendSignupOTP(cleanPhone, otp);

    return res.json({
      success: true,
      message: "OTP request processed",
      phone: cleanPhone,
      gateway: smsResult,
    });
  } catch (err: any) {
    console.error("Send OTP error:", err);
    return res.status(500).json({ error: err.message || "Failed to send OTP" });
  }
});

/** Verify OTP */
authRouter.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const { phone, mobile, email, otp, otp_code, purpose } = req.body;
    const rawNumber = phone || mobile;
    const code = (otp || otp_code || "").toString().trim();

    if ((!rawNumber && !email) || !code) {
      return res.status(400).json({ error: "Mobile number or Email and OTP are required." });
    }

    const cleanPhone = rawNumber ? String(rawNumber).replace(/\D/g, "").slice(-10) : "";
    const cleanEmail = email ? String(email).trim().toLowerCase() : "";

    // Verify OTP matching unexpired and unverified code
    let sql = `
      SELECT id, otp_code, expiry, is_verified 
      FROM otp_verifications 
      WHERE ((phone IS NOT NULL AND phone = $1) OR (email IS NOT NULL AND LOWER(email) = $2))
        AND otp_code = $3 AND is_verified = false AND expiry > NOW()
    `;
    const params: any[] = [cleanPhone || "NONE", cleanEmail || "NONE", code];

    if (purpose) {
      sql += " AND purpose = $4";
      params.push(purpose);
    }

    sql += " ORDER BY created_at DESC LIMIT 1";

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired OTP. Please request a new one.",
      });
    }

    // Mark as verified
    await query("UPDATE otp_verifications SET is_verified = true WHERE id = $1", [result.rows[0].id]);

    return res.json({
      success: true,
      message: "OTP verified successfully.",
      phone: cleanPhone,
      email: cleanEmail,
    });
  } catch (err: any) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({ error: err.message || "Failed to verify OTP" });
  }
});

/** Request Forgot Password OTP via Email (Brevo) and SMS (Zectagon) */
authRouter.post("/forgot-password/request-otp", async (req: Request, res: Response) => {
  try {
    const { email, identifier } = req.body;
    const searchId = (email || identifier || "").trim();

    if (!searchId) {
      return res.status(400).json({ error: "Email or Employee ID is required." });
    }

    const cleanDigits = searchId.replace(/\D/g, "").slice(-10);

    // 1. Search in PostgreSQL profiles
    let user: any = null;
    try {
      const profileRes = await query(
        `SELECT id, email, phone, full_name, employee_id 
         FROM profiles 
         WHERE LOWER(email) = LOWER($1) 
            OR (employee_id IS NOT NULL AND UPPER(employee_id) = UPPER($1))
            OR ($2 <> '' AND phone LIKE $3)
            OR full_name ILIKE $4
         LIMIT 1`,
        [searchId, cleanDigits, `%${cleanDigits}%`, `%${searchId}%`]
      );
      if (profileRes.rows.length > 0) {
        user = profileRes.rows[0];
      }
    } catch (dbErr) {
      console.warn("DB query error in forgot-password:", dbErr);
    }

    // 2. Identify target email and phone
    const targetEmail = user?.email || (searchId.includes("@") ? searchId.toLowerCase() : "");
    let cleanPhone = user?.phone ? String(user.phone).replace(/\D/g, "").slice(-10) : "";
    if (!cleanPhone && cleanDigits.length === 10) {
      cleanPhone = cleanDigits;
    }

    if (!user && !targetEmail && !cleanPhone) {
      return res.status(404).json({
        error: `No registered account found with Email/ID "${searchId}". Please check the spelling or contact Admin.`,
      });
    }

    // Generate secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save in database
    try {
      await query(
        `INSERT INTO otp_verifications (phone, email, otp_code, purpose, expiry, is_verified)
         VALUES ($1, $2, $3, 'forgot-password', $4, false)`,
        [cleanPhone || null, targetEmail || null, otp, expiry]
      );
    } catch (saveErr) {
      console.warn("Notice: OTP save error:", saveErr);
    }

    console.log(`\n======================================================`);
    console.log(`🔐 [PASSWORD RESET OTP GENERATED]`);
    console.log(`👤 Target: ${targetEmail || cleanPhone}`);
    console.log(`🔑 OTP Verification Code: ${otp}`);
    console.log(`⏱️ Expiry: 15 minutes`);
    console.log(`======================================================\n`);

    // 3. Send Email OTP via Brevo API
    let emailResult: any = null;
    let emailSent = false;
    if (targetEmail) {
      try {
        emailResult = await sendPasswordResetEmail(
          targetEmail,
          otp,
          user?.full_name || "Mehar Team Member"
        );
        emailSent = Boolean(emailResult && emailResult.success);
      } catch (mailErr) {
        console.warn("Brevo Email OTP dispatch notice:", mailErr);
      }
    }

    // 4. Send SMS OTP via Zectagon Gateway if phone exists
    let smsResult: any = null;
    if (cleanPhone && cleanPhone.length === 10) {
      try {
        smsResult = await sendSignupOTP(cleanPhone, otp);
      } catch (smsErr) {
        console.warn("SMS gateway dispatch notice:", smsErr);
      }
    }

    // Masked presentation for UI
    const maskedPhone = cleanPhone ? `******${cleanPhone.slice(-4)}` : "";
    let maskedEmail = "";
    if (targetEmail) {
      const [localPart, domain] = targetEmail.split("@");
      if (localPart && domain) {
        maskedEmail = localPart.length > 2 
          ? `${localPart.slice(0, 2)}***${localPart.slice(-1)}@${domain}`
          : `***@${domain}`;
      }
    }

    const message = emailSent
      ? `Password reset OTP sent to ${maskedEmail || targetEmail}`
      : cleanPhone
      ? `Password reset OTP sent to +91 ${maskedPhone}`
      : `Password reset OTP generated.`;

    return res.json({
      success: true,
      message,
      email: targetEmail,
      maskedEmail,
      phone: cleanPhone,
      maskedPhone,
      emailSent,
      emailData: emailResult,
      smsData: smsResult,
    });
  } catch (err: any) {
    console.error("Forgot Password OTP error:", err);
    return res.status(500).json({ error: err.message || "Could not process request. Please try again." });
  }
});

/** Verify OTP and Reset Password */
authRouter.post("/forgot-password/reset", async (req: Request, res: Response) => {
  try {
    const { email, phone, identifier, otp, password } = req.body;
    const searchId = String(email || identifier || "").trim();
    const cleanPhone = String(phone || searchId || "").replace(/\D/g, "").slice(-10);
    const code = String(otp || "").trim();
    const newPass = String(password || "").trim();

    if (!code || code.length !== 6 || !newPass || newPass.length < 6) {
      return res.status(400).json({ error: "Valid 6-digit OTP and new password (min 6 characters) are required." });
    }

    console.log(`🔍 [RESET PASSWORD ATTEMPT] Identifier: "${searchId}", Phone: "${cleanPhone}", OTP: "${code}"`);

    // 1. Verify OTP in otp_verifications table
    const otpRes = await query(
      `SELECT id, email, phone, otp_code 
       FROM otp_verifications 
       WHERE otp_code = $1 
         AND is_verified = false 
         AND expiry > NOW()
       ORDER BY created_at DESC 
       LIMIT 1`,
      [code]
    );

    if (otpRes.rows.length === 0) {
      console.warn(`❌ [RESET PASSWORD] OTP "${code}" not found or expired.`);
      return res.status(400).json({
        error: "Invalid or expired 6-digit verification code. Please request a new OTP.",
      });
    }

    const matchedOtpRecord = otpRes.rows[0];

    // 2. Mark OTP as verified so it cannot be reused
    await query("UPDATE otp_verifications SET is_verified = true WHERE id = $1", [matchedOtpRecord.id]);

    // 3. Hash new password
    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash(newPass, salt);

    // 4. Update password in profiles table for this user
    const otpEmail = matchedOtpRecord.email ? String(matchedOtpRecord.email).toLowerCase() : "";
    const otpPhone = matchedOtpRecord.phone ? String(matchedOtpRecord.phone).replace(/\D/g, "").slice(-10) : "";

    const updateRes = await query(
      `UPDATE profiles 
       SET password_hash = $1, updated_at = NOW() 
       WHERE (LOWER(email) = LOWER($2) AND $2 <> '')
          OR (LOWER(email) = LOWER($3) AND $3 <> '')
          OR (employee_id IS NOT NULL AND UPPER(employee_id) = UPPER($2))
          OR (phone IS NOT NULL AND $4 <> '' AND phone LIKE $5)
          OR (phone IS NOT NULL AND $6 <> '' AND phone LIKE $7)
       RETURNING id, email, full_name, employee_id`,
      [
        passHash,
        searchId,
        otpEmail,
        cleanPhone,
        `%${cleanPhone}%`,
        otpPhone,
        `%${otpPhone}%`,
      ]
    );

    console.log(`✅ [PASSWORD RESET SUCCESS] Updated ${updateRes.rowCount} profile(s):`, updateRes.rows);

    return res.json({
      success: true,
      message: "Password has been reset successfully! You can now sign in.",
    });
  } catch (err: any) {
    console.error("Forgot Password Reset error:", err);
    return res.status(500).json({ error: err.message || "Failed to reset password." });
  }
});

/** Test Brevo Email endpoint */
authRouter.post("/test-email", async (req: Request, res: Response) => {
  try {
    const { toEmail = "user@gmail.com", name = "Test User" } = req.body;
    const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const result = await sendPasswordResetEmail(toEmail, testOtp, name);

    return res.json({
      success: result.success,
      otpSent: testOtp,
      result,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** Register / Create new user in PostgreSQL */
authRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, full_name, name, phone, employee_id, role = "employee" } = req.body;
    const finalName = (full_name || name || "Employee").trim();
    const cleanPhone = phone ? String(phone).replace(/\D/g, "").slice(-10) : "";
    const finalEmail = (email || (cleanPhone ? `${cleanPhone}@mehar.in` : "")).trim().toLowerCase();

    if (!finalEmail || !password) {
      return res.status(400).json({ error: "Email/Mobile number and password are required." });
    }

    // Check if email, employee_id, or phone already exists
    const existing = await query(
      `SELECT id, email, phone, employee_id FROM profiles 
       WHERE LOWER(email) = LOWER($1) 
          OR (employee_id IS NOT NULL AND employee_id = UPPER($2))
          OR ($3 <> '' AND phone IS NOT NULL AND phone LIKE $4)`,
      [finalEmail, employee_id || "", cleanPhone, `%${cleanPhone || "NOMATCH"}%`]
    );
    if (existing.rows.length > 0) {
      const match = existing.rows[0];
      if (cleanPhone && match.phone && match.phone.includes(cleanPhone)) {
        return res.status(400).json({ error: `Mobile number +91 ${cleanPhone} is already registered. Please Sign In.` });
      }
      return res.status(400).json({ error: "Email or Employee ID already registered." });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const isTargetAdmin = finalEmail === "admin@meharadvisory.com";
    const assignedRole = isTargetAdmin ? "admin" : role;

    // Insert into PostgreSQL profiles table
    const result = await query(
      `INSERT INTO profiles (email, password_hash, full_name, employee_id, phone, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         employee_id = COALESCE(EXCLUDED.employee_id, profiles.employee_id),
         phone = COALESCE(EXCLUDED.phone, profiles.phone),
         is_active = true
       RETURNING id, email, full_name, employee_id, phone, role, is_active, created_at`,
      [finalEmail, password_hash, finalName, employee_id || null, cleanPhone || null, assignedRole]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    console.log(`✅ [NEW REGISTRATION] User: ${user.full_name}, Phone: ${user.phone}, Email: ${user.email}, ID: ${user.employee_id}`);

    return res.status(201).json({ token, user });
  } catch (err: any) {
    console.error("Register error:", err);
    return res.status(500).json({ error: err.message || "Registration failed" });
  }
});

/** Login endpoint verifying PostgreSQL bcrypt password */
authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password, identifier, name, full_name, employee_id, phone } = req.body;
    const rawId = (email || identifier || "").trim();
    const loginId = rawId.toLowerCase();
    const cleanPhone = rawId.replace(/\D/g, "").slice(-10);
    const incomingName = (full_name || name || "").trim();

    if (!rawId || !password) {
      return res.status(400).json({ error: "Email/Identifier and password are required." });
    }

    const cleanInput = loginId.replace(/[^a-zA-Z0-9]/g, "");
    const isAdminIdentifier = 
      loginId === "admin@meharadvisory.com" || 
      loginId === "meh000" ||
      loginId === "meh-adm-001" ||
      cleanInput === "meh000" ||
      cleanInput === "mehadm001" ||
      cleanInput === "mehadm01";

    const isAdminPassword = password === "Root@6378";

    let user: any = null;

    try {
      // Query user by email, employee_id (with or without dashes), or phone
      const result = await query(
        `SELECT * FROM profiles 
         WHERE (
           LOWER(email) = LOWER($1) 
           OR (employee_id IS NOT NULL AND (UPPER(employee_id) = UPPER($1) OR UPPER(REPLACE(employee_id, '-', '')) = UPPER($2)))
           OR ($3 <> '' AND phone LIKE $4)
         ) 
         AND is_active = true 
         LIMIT 1`,
        [loginId, cleanInput, cleanPhone, `%${cleanPhone}%`]
      );
      user = result.rows[0];
    } catch (dbErr) {
      console.warn("Database query failed during login:", dbErr);
    }

    // Special handler strictly for the Admin account
    if (isAdminIdentifier) {
      const isPassValid = isAdminPassword || (user && user.password_hash && (await bcrypt.compare(password, user.password_hash)));
      if (isPassValid) {
        const adminEmail = "admin@meharadvisory.com";
        const adminUser = user || {
          id: "00000000-0000-0000-0000-000000000001",
          email: adminEmail,
          full_name: "Yogendra (Admin)",
          employee_id: "MEH-ADM-001",
          phone: null,
          role: "admin",
          is_active: true,
        };
        adminUser.role = "admin";
        adminUser.name = adminUser.full_name;

        // Try updating/inserting admin in DB in background if available
        try {
          const salt = await bcrypt.genSalt(10);
          const password_hash = await bcrypt.hash(password, salt);
          await query(
            `INSERT INTO profiles (email, password_hash, full_name, employee_id, role, is_active)
             VALUES ('admin@meharadvisory.com', $1, 'Yogendra', 'MEH-ADM-001', 'admin', true)
             ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', is_active = true`,
            [password_hash]
          );
        } catch {}

        const token = jwt.sign({ userId: adminUser.id, email: adminUser.email, role: "admin" }, JWT_SECRET, {
          expiresIn: "7d",
        });
        delete adminUser.password_hash;
        return res.json({ token, user: adminUser });
      }
    }

    // User must be a registered account in profiles table
    if (!user) {
      return res.status(401).json({
        error: `No registered account found for "${rawId}". Please create an account or contact Admin.`,
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        error: "This account is inactive or deactivated. Please contact your admin.",
      });
    }

    // Verify password with bcrypt
    let isMatch = false;
    if (user.password_hash) {
      isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        isMatch = await bcrypt.compare(`${password}@Mhr#dvr2026`, user.password_hash);
      }
    }

    // Allow Super Admin password for admin account
    if (!isMatch && (user.role === "admin" || user.employee_id === "MEH000") && password === "Root@6378") {
      isMatch = true;
    }

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials. Please check your password." });
    }

    // If user had empty/fallback full_name and client passed a real name, update it
    if (incomingName && (!user.full_name || user.full_name === "Employee" || user.full_name === "Mehar User")) {
      try {
        await query("UPDATE profiles SET full_name = $1 WHERE id = $2", [incomingName, user.id]);
        user.full_name = incomingName;
      } catch {}
    }
    if (employee_id && !user.employee_id) {
      try {
        await query("UPDATE profiles SET employee_id = $1 WHERE id = $2", [employee_id.toUpperCase(), user.id]);
        user.employee_id = employee_id.toUpperCase();
      } catch {}
    }
    if (phone && !user.phone) {
      try {
        await query("UPDATE profiles SET phone = $1 WHERE id = $2", [phone, user.id]);
        user.phone = phone;
      } catch {}
    }

    user.role = user.role || "employee";
    user.name = user.full_name || user.name || "Employee";

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        employee_id: user.employee_id,
        name: user.name,
        role: user.role,
      },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    delete user.password_hash;
    return res.json({ token, user });
  } catch (err: any) {
    console.error("Login error:", err);
    return res.status(500).json({ error: err.message || "Login failed" });
  }
});

/** Helper: Generate Employee ID prefix: MEH + Initials (e.g. MEHRS for Rakesh Sharma, MEHSP for Sumit Pandit) */
export function generateEmployeePrefix(fullName: string = ""): string {
  const clean = fullName.trim().replace(/[^a-zA-Z\s]/g, "");
  const parts = clean.split(/\s+/).filter(Boolean);
  const first = parts[0] || "";
  const last = parts[parts.length - 1] || "";

  if (parts.length >= 2 && first.length > 0 && last.length > 0) {
    const firstInitial = (first.charAt(0) || "").toUpperCase();
    const lastInitial = (last.charAt(0) || "").toUpperCase();
    return `MEH${firstInitial}${lastInitial}`;
  } else if (parts.length === 1 && first.length >= 2) {
    return `MEH${first.slice(0, 2).toUpperCase()}`;
  } else if (parts.length === 1 && first.length === 1) {
    return `MEH${first.toUpperCase()}X`;
  }
  return "MEH";
}

/** Fetch all registered users from PostgreSQL profiles table */
authRouter.get("/users", async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, employee_id, phone, role, avatar_url, is_active, created_at 
       FROM profiles 
       ORDER BY created_at DESC`
    );
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to fetch users" });
  }
});

/** Get next available unique Employee ID (e.g. MEHRS101 for Rakesh Sharma) */
authRouter.all("/next-employee-id", async (req: Request, res: Response) => {
  try {
    const rawName = String(req.query.name || req.query.full_name || req.body.name || req.body.full_name || "").trim();
    const prefix = generateEmployeePrefix(rawName);

    // Fetch existing employee IDs from profiles
    const existingRes = await query("SELECT employee_id FROM profiles WHERE employee_id IS NOT NULL");

    const usedNumbers: number[] = [];
    const cleanPrefix = prefix.replace(/[^A-Za-z0-9]/g, "");

    for (const row of existingRes.rows) {
      const empId = (row.employee_id || "").toUpperCase().trim();
      const cleanEmpId = empId.replace(/[^A-Za-z0-9]/g, "");

      if (cleanEmpId.startsWith(cleanPrefix)) {
        const numPart = cleanEmpId.slice(cleanPrefix.length);
        const parsed = parseInt(numPart, 10);
        if (!isNaN(parsed)) {
          usedNumbers.push(parsed);
        }
      }
    }

    // 100-series starts from 101
    let nextNum = 101;
    while (usedNumbers.includes(nextNum)) {
      nextNum++;
    }

    const nextId = `${prefix}${nextNum}`;
    return res.json({
      success: true,
      nextId,
      prefix,
      seriesNumber: nextNum,
    });
  } catch (err: any) {
    return res.json({ success: true, nextId: "MEH101", prefix: "MEH", seriesNumber: 101 });
  }
});

/** Resolve an Employee ID (e.g. MEH-SP-101, MEHSP101, MEH-ADM-001, MEH000) to its login email */
authRouter.post("/resolve-login-email", async (req: Request, res: Response) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ error: "Identifier is required" });
    }

    const trimmed = identifier.trim();
    if (trimmed.includes("@")) {
      return res.json({ email: trimmed.toLowerCase() });
    }

    const normalized = trimmed.toUpperCase().replace(/\s+/g, "");
    const cleanOnly = normalized.replace(/[^A-Za-z0-9]/g, "");

    if (normalized === "MEH000" || normalized === "MEH-ADM-001" || cleanOnly === "MEH000" || cleanOnly === "MEHADM001") {
      return res.json({ email: "admin@meharadvisory.com" });
    }

    const result = await query(
      `SELECT email FROM profiles 
       WHERE LOWER(email) LIKE $1 
          OR LOWER(full_name) LIKE $1 
          OR UPPER(employee_id) = $2 
          OR UPPER(REPLACE(employee_id, '-', '')) = $3`,
      [`%${normalized.toLowerCase()}%`, normalized, cleanOnly]
    );

    if (result.rows.length > 0) {
      return res.json({ email: result.rows[0].email });
    }

    return res.status(404).json({
      error: `No account found for Employee ID "${normalized}".`,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Failed to resolve login email" });
  }
});

/** Current user profile + role info */
authRouter.get("/session-info", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const result = await query(
      "SELECT id, email, full_name, employee_id, phone, role, avatar_url, is_active, created_at FROM profiles WHERE id = $1 OR (employee_id IS NOT NULL AND employee_id = UPPER($2)) OR (LOWER(email) = LOWER($3)) LIMIT 1",
      [authReq.userId, authReq.userEmpId || "", authReq.userEmail || ""]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const row = result.rows[0];

    const profile = {
      id: row.id,
      name: row.full_name || "Employee",
      full_name: row.full_name || "Employee",
      email: row.email,
      employee_id: row.employee_id || "",
      phone: row.phone || "",
      role: row.role || "employee",
      avatar_url: row.avatar_url || null,
      status: row.is_active ? "active" : "inactive",
      created_at: row.created_at,
    };

    return res.json({
      userId: authReq.userId,
      profile,
      isAdmin: authReq.isAdmin || row.role === "admin",
      avatarUrl: row.avatar_url || null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to retrieve session info" });
  }
});

/** Update current user's profile details */
authRouter.patch("/profile", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { full_name, name, phone, employee_id, avatar_url, photo } = req.body;
    const finalName = full_name || name;
    const finalAvatar = avatar_url || photo;

    const result = await query(
      `UPDATE profiles 
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           employee_id = COALESCE($3, employee_id),
           avatar_url = COALESCE($4, avatar_url),
           updated_at = NOW()
       WHERE id = $5 OR (employee_id IS NOT NULL AND employee_id = UPPER($6)) OR (LOWER(email) = LOWER($7))
       RETURNING id, email, full_name, employee_id, phone, role, avatar_url, is_active`,
      [
        finalName ? finalName.trim() : null,
        phone ? phone.trim() : null,
        employee_id ? employee_id.trim().toUpperCase() : null,
        finalAvatar || null,
        authReq.userId,
        authReq.userEmpId || "",
        authReq.userEmail || "",
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      profile: {
        id: row.id,
        name: row.full_name,
        full_name: row.full_name,
        email: row.email,
        employee_id: row.employee_id,
        phone: row.phone,
        role: row.role,
        avatar_url: row.avatar_url || null,
        status: row.is_active ? "active" : "inactive",
      },
      avatarUrl: row.avatar_url || null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to update profile" });
  }
});

/** Update/upload profile photo */
authRouter.post("/avatar", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { photo, avatar_url } = req.body;
    const finalPhoto = photo || avatar_url;
    if (!finalPhoto || typeof finalPhoto !== "string") {
      return res.status(400).json({ error: "Photo data URL is required." });
    }

    const result = await query(
      `UPDATE profiles 
       SET avatar_url = $1, updated_at = NOW() 
       WHERE id = $2 OR (employee_id IS NOT NULL AND employee_id = UPPER($3)) OR (LOWER(email) = LOWER($4))
       RETURNING id, avatar_url`,
      [finalPhoto, authReq.userId, authReq.userEmpId || "", authReq.userEmail || ""]
    );

    return res.json({
      success: true,
      avatar_url: finalPhoto,
      url: finalPhoto,
      profile: result.rows[0] || null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to update profile photo" });
  }
});

/** Remove profile photo */
authRouter.delete("/avatar", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    await query(
      `UPDATE profiles 
       SET avatar_url = NULL, updated_at = NOW() 
       WHERE id = $1 OR (employee_id IS NOT NULL AND employee_id = UPPER($2)) OR (LOWER(email) = LOWER($3))`,
      [authReq.userId, authReq.userEmpId || "", authReq.userEmail || ""]
    );

    return res.json({ success: true, message: "Profile photo removed successfully" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to remove profile photo" });
  }
});

authRouter.post("/remove-avatar", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    await query(
      `UPDATE profiles 
       SET avatar_url = NULL, updated_at = NOW() 
       WHERE id = $1 OR (employee_id IS NOT NULL AND employee_id = UPPER($2)) OR (LOWER(email) = LOWER($3))`,
      [authReq.userId, authReq.userEmpId || "", authReq.userEmail || ""]
    );

    return res.json({ success: true, message: "Profile photo removed successfully" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to remove profile photo" });
  }
});

/** Change password endpoint for currently logged in employee */
authRouter.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash(password, salt);

    await query("UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2 OR employee_id = $2 OR email = $3", [
      passHash,
      authReq.userId,
      authReq.userEmail || "",
    ]);

    return res.json({ success: true, message: "Password updated successfully" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to update password" });
  }
});

/** Bootstrap admin in PostgreSQL */
authRouter.post("/bootstrap-demo-data", async (_req: Request, res: Response) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash("Root@6378", salt);

    // Insert Admin
    const adminRes = await query(
      `INSERT INTO profiles (email, password_hash, full_name, employee_id, role, is_active)
       VALUES ('admin@meharadvisory.com', $1, 'Mehar Admin', 'MEH000', 'admin', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
       RETURNING id`,
      [passHash]
    );

    return res.json({
      seeded: true,
      adminId: adminRes.rows[0]?.id,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to bootstrap admin" });
  }
});

/** Update user role endpoint (admin, employee) */
authRouter.post("/users/set-role", async (req: Request, res: Response) => {
  try {
    const { userId, employeeId, id, role } = req.body;
    const targetId = userId || id;
    const targetCode = employeeId;
    const targetRole = (role || "employee").toLowerCase() === "admin" ? "admin" : "employee";

    if (!targetId && !targetCode) {
      return res.status(400).json({ error: "User ID or Employee ID is required." });
    }

    if (!["admin", "employee"].includes(targetRole)) {
      return res.status(400).json({ error: "Invalid role. Must be 'admin' or 'employee'." });
    }

    const updateRes = await query(
      `UPDATE profiles 
       SET role = $1, updated_at = NOW() 
       WHERE id::text = $2 
          OR (employee_id IS NOT NULL AND UPPER(employee_id) = UPPER($3))
       RETURNING id, email, full_name, employee_id, role`,
      [targetRole, targetId || "", targetCode || targetId || ""]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const updatedUser = updateRes.rows[0];

    // Also sync user_roles table
    try {
      await query("DELETE FROM user_roles WHERE user_id = $1", [updatedUser.id]);
      await query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id, role) DO NOTHING", [updatedUser.id, targetRole]);
    } catch (_err) {}

    return res.json({
      success: true,
      message: `User role updated to ${targetRole}.`,
      user: updatedUser,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to update user role." });
  }
});


