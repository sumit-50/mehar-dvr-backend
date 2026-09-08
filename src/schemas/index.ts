import { z } from "zod";

export const locationSchema = z.object({
  id: z.string().uuid().optional(),
  company_name: z.string().max(120).optional().default(""),
  location_name: z.string().min(2, "Location name is required").max(120),
  location_code: z
    .string()
    .min(2, "Code must be 2-10 characters")
    .max(10)
    .regex(/^[A-Za-z0-9_-]+$/, "Alphanumeric, _ or - only"),
  address: z.string().min(5, "Address must be at least 5 characters").max(300),
  company_description: z.string().max(300).optional().default(""),
  owner_name: z.string().max(100).optional().default(""),
  owner_number: z.string().max(20).optional().default(""),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  allowed_radius: z.number().int().min(10).max(5000).default(100),
  status: z.enum(["active", "inactive", "pending"]).default("active"),
});

export const visitSubmitSchema = z.object({
  location_id: z.string().uuid(),
  actual_latitude: z.number().min(-90).max(90),
  actual_longitude: z.number().min(-180).max(180),
  gps_accuracy: z.number().min(0).max(5000),
  visit_purpose: z.string().min(2).max(100),
  remarks: z.string().max(500).optional().nullable(),
  photo_base64: z.string().min(100, "Photo data missing"),
  override_flag: z.boolean().optional().default(false),
  owner_name: z.string().max(100).optional(),
  owner_number: z.string().max(20).optional(),
  company_description: z.string().max(300).optional(),
});

export const employeeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Name is required").max(100),
  employee_id: z
    .string()
    .min(2, "Employee ID is required")
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, "Alphanumeric, _ or - only"),
  email: z.string().email("Invalid email address"),
  phone: z.string().max(20).optional().nullable(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const visitFiltersSchema = z.object({
  employee_id: z.string().uuid().optional(),
  location_id: z.string().uuid().optional(),
  status: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export const identifierSchema = z.object({
  identifier: z.string().min(1, "Employee ID or Email is required"),
});

export const officeRequestSchema = z.object({
  company_name: z.string().max(120).optional().default(""),
  location_name: z.string().min(2, "Office / client name is required").max(120),
  location_code: z
    .string()
    .max(10)
    .regex(/^[A-Za-z0-9_-]*$/, "Alphanumeric, _ or - only")
    .optional()
    .default(""),
  address: z.string().min(5, "Address must be at least 5 characters").max(300),
  company_description: z.string().max(300).optional().default(""),
  owner_name: z.string().max(100).optional().default(""),
  owner_number: z.string().max(20).optional().default(""),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  allowed_radius: z.number().int().min(10).max(5000).default(100),
  initial_purpose: z.string().max(100).optional().default("New Office Setup"),
});

export const officeGpsSchema = z.object({
  location_id: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  gps_accuracy: z.number().min(0).max(5000),
  address: z.string().max(300).optional(),
});

export const officeDetailsSchema = z.object({
  location_id: z.string().uuid(),
  company_name: z.string().max(120).optional(),
  location_name: z.string().min(2).max(120).optional(),
  address: z.string().min(5).max(300).optional(),
  company_description: z.string().max(300).optional(),
  owner_name: z.string().max(100).optional(),
  owner_number: z.string().max(20).optional(),
});
