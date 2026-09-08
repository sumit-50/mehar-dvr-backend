import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { authRouter } from "./routes/auth.routes.js";
import { dvrRouter } from "./routes/dvr.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { initDatabase } from "./config/db.js";

dotenv.config();

// Initialize PostgreSQL database tables
initDatabase();

const app = express();
const port = process.env.PORT || 5000;

// Enable CORS for frontend
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// High limit for base64 photo uploads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Health check endpoints (supports both /api/health and /health)
app.get(["/api/health", "/health"], (_req, res) => {
  res.json({ status: "ok", service: "DVR Mehar Backend API", timestamp: new Date().toISOString() });
});

// Register routes
app.use("/api/auth", authRouter);
app.use("/api/dvr", dvrRouter);
app.use("/api/admin", adminRouter);

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: err?.message || "Internal server error" });
});

app.listen(Number(port), "0.0.0.0", () => {
  console.log(`DVR Backend API server running on http://0.0.0.0:${port}`);
});
