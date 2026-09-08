import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// PostgreSQL Connection Pool configuration
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://MeharDvr:Mehar%40dvr@187.77.187.120:5321/meh",
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Helper for executing queries
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL === "true") {
    console.log("Executed Query:", { text, duration, rows: res.rowCount });
  }
  return res;
};

// Automatic PostgreSQL Table Initializer
export const initDatabase = async () => {
  try {
    const client = await pool.connect();
    console.log("Connected successfully to PostgreSQL database (187.77.187.120:5321/meh)!");

    // 1. Extensions
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
      await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    } catch {}

    // 2. Profiles Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        full_name VARCHAR(255) NOT NULL,
        employee_id VARCHAR(50) UNIQUE,
        phone VARCHAR(50),
        avatar_url TEXT,
        role VARCHAR(50) DEFAULT 'employee',
        status VARCHAR(50) DEFAULT 'active',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50);
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'employee';
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);

    // 3. User Roles Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL DEFAULT 'employee',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, role)
      );
    `);

    // 4. Locations Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        company_name VARCHAR(255) DEFAULT 'Mehar Advisory',
        location_name VARCHAR(255),
        location_code VARCHAR(100),
        address TEXT,
        company_description TEXT,
        owner_name VARCHAR(255),
        owner_number VARCHAR(50),
        latitude DOUBLE PRECISION NOT NULL DEFAULT 26.905,
        longitude DOUBLE PRECISION NOT NULL DEFAULT 75.790,
        radius_meters INTEGER DEFAULT 100,
        allowed_radius INTEGER DEFAULT 100,
        status VARCHAR(50) DEFAULT 'active',
        is_active BOOLEAN DEFAULT true,
        submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
        created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE locations ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) DEFAULT 'Mehar Advisory';
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS location_name VARCHAR(255);
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS location_code VARCHAR(100);
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS company_description TEXT;
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255);
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS owner_number VARCHAR(50);
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS allowed_radius INTEGER DEFAULT 100;
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS radius_meters INTEGER DEFAULT 100;
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);

    // 5. Employee Location Assignments Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_location_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (employee_id, location_id)
      );
    `);

    // 6. Visits Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS visits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
        purpose VARCHAR(255) NOT NULL DEFAULT 'Client Consultation',
        visit_purpose VARCHAR(255),
        remarks TEXT,
        photo_url TEXT,
        photo_path TEXT,
        latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
        actual_latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
        actual_longitude DOUBLE PRECISION,
        fixed_latitude DOUBLE PRECISION,
        fixed_longitude DOUBLE PRECISION,
        distance_meters DOUBLE PRECISION DEFAULT 0,
        distance DOUBLE PRECISION DEFAULT 0,
        gps_accuracy_meters DOUBLE PRECISION,
        gps_accuracy DOUBLE PRECISION,
        visit_date VARCHAR(20),
        visit_time VARCHAR(20),
        status VARCHAR(50) DEFAULT 'verified',
        is_verified BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE visits ADD COLUMN IF NOT EXISTS visit_purpose VARCHAR(255);
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS photo_path TEXT;
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS actual_latitude DOUBLE PRECISION;
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS actual_longitude DOUBLE PRECISION;
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS fixed_latitude DOUBLE PRECISION;
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS fixed_longitude DOUBLE PRECISION;
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS distance DOUBLE PRECISION DEFAULT 0;
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS distance_meters DOUBLE PRECISION DEFAULT 0;
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS gps_accuracy DOUBLE PRECISION;
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS gps_accuracy_meters DOUBLE PRECISION;
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS visit_date VARCHAR(20);
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS visit_time VARCHAR(20);
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'verified';
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT true;
      ALTER TABLE visits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);

    // 7. OTP Verifications Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS otp_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20),
        email VARCHAR(255),
        otp_code VARCHAR(10) NOT NULL,
        purpose VARCHAR(50) DEFAULT 'signup',
        is_verified BOOLEAN DEFAULT false,
        expiry TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE otp_verifications ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE otp_verifications ALTER COLUMN phone DROP NOT NULL;
    `);

    // 8. Audit Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        details JSONB,
        ip_address VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 9. Create Performance Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
      CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON profiles(employee_id);
      CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
      CREATE INDEX IF NOT EXISTS idx_visits_employee_id ON visits(employee_id);
      CREATE INDEX IF NOT EXISTS idx_visits_location_id ON visits(location_id);
      CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_locations_is_active ON locations(is_active);
      CREATE INDEX IF NOT EXISTS idx_locations_status ON locations(status);
      CREATE INDEX IF NOT EXISTS idx_otp_phone_expiry ON otp_verifications(phone, expiry);
      CREATE INDEX IF NOT EXISTS idx_otp_email_expiry ON otp_verifications(email, expiry);
    `);

    // 10. Clean up dummy phone numbers if any
    await client.query(`
      UPDATE profiles 
      SET phone = NULL 
      WHERE phone = '9876543210' OR phone = '987654321' OR phone = '98xxxxxx21' OR phone = 'null' OR phone = 'undefined';
    `);

    // 11. Seed initial Super Admin if not already present
    const defaultPassHash = "$2a$10$w8.d8vK9/1R06K7a5iZfxeWJ3C0qS0pC48rYjWnZ7d0M6l1Cq6Oce";
    await client.query(`
      INSERT INTO profiles (email, password_hash, full_name, employee_id, role, is_active)
      VALUES 
        ('admin@meharadvisory.com', '${defaultPassHash}', 'Yogendra', 'MEHADM001', 'admin', true)
      ON CONFLICT (email) DO UPDATE 
        SET employee_id = CASE 
          WHEN profiles.employee_id = 'MEH000' OR profiles.employee_id = 'MEH-ADM-001' THEN 'MEHADM001' 
          ELSE profiles.employee_id 
        END;

      INSERT INTO user_roles (user_id, role)
      SELECT id, 'admin' FROM profiles WHERE email = 'admin@meharadvisory.com'
      ON CONFLICT (user_id, role) DO NOTHING;
    `);

    client.release();
    console.log("PostgreSQL Tables verified & created successfully in DB (187.77.187.120:5321/meh)!");
  } catch (err: any) {
    console.warn("PostgreSQL initialization notice:", err?.message || err);
  }
};
