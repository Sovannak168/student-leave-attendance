import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

dotenv.config();

const config: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
};

export const pool = new Pool(config);

// Test database connection and ensure PostGIS is installed and database is seeded
export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT version();');
    console.log(`[Database] Connected to: ${res.rows[0].version}`);
    
    // Check for PostGIS extension
    const postgisRes = await client.query("SELECT extname FROM pg_extension WHERE extname = 'postgis';");
    if (postgisRes.rows.length === 0) {
      console.warn('[Database] WARNING: PostGIS extension is not installed in the database.');
    } else {
      console.log('[Database] PostGIS extension is active.');
    }

    // Check if schema needs to be initialized (check if 'users' table exists)
    const tableCheck = await client.query(
      "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users');"
    );
    const schemaInitialized = tableCheck.rows[0].exists;

    if (!schemaInitialized) {
      console.log('[Database] public.users table not found. Reading and executing schema.sql...');
      
      // Resolve path to schema.sql
      let schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
      if (!fs.existsSync(schemaPath)) {
        // Fallback relative to __dirname in dist folder pointing back to src
        schemaPath = path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql');
      }
      if (!fs.existsSync(schemaPath)) {
        // Fallback if schema.sql was copied next to index.js
        schemaPath = path.join(__dirname, 'schema.sql');
      }

      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        console.log('[Database] Database schema initialized successfully.');
      } else {
        throw new Error(`Schema file schema.sql could not be found at: ${schemaPath}`);
      }
    } else {
      console.log('[Database] Schema check passed (users table exists).');
    }

    // Check if the database has any users. If completely empty, seed default accounts.
    const userCountCheck = await client.query('SELECT COUNT(*) FROM users;');
    const userCount = parseInt(userCountCheck.rows[0].count, 10);

    if (userCount === 0) {
      console.log('[Database] Database has no users. Seeding default demo accounts...');
      
      await client.query('BEGIN');
      try {
        const salt = await bcrypt.genSalt(10);
        const defaultPasswordHash = await bcrypt.hash('password123', salt);

        // 1. Seed Admin
        const adminRes = await client.query(
          `INSERT INTO users (email, password_hash, phone, role) 
           VALUES ($1, $2, $3, $4) RETURNING id`,
          ['admin@gmail.com', defaultPasswordHash, '012345678', 'ADMIN']
        );
        const adminId = adminRes.rows[0].id;
        console.log('[Database Seed] Created Admin: admin@gmail.com (password: password123)');

        // 2. Seed Guard
        await client.query(
          `INSERT INTO users (email, password_hash, phone, role) 
           VALUES ($1, $2, $3, $4)`,
          ['guard@gmail.com', defaultPasswordHash, '087654321', 'GUARD']
        );
        console.log('[Database Seed] Created Guard: guard@gmail.com (password: password123)');

        // 3. Seed Student user
        const studentRes = await client.query(
          `INSERT INTO users (email, password_hash, phone, role, device_uuid) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          ['student1@gmail.com', defaultPasswordHash, '011223344', 'STUDENT', '33333333-3333-3333-3333-333333333333']
        );
        const studentId = studentRes.rows[0].id;

        // 4. Seed Student details
        await client.query(
          `INSERT INTO students (user_id, roll_number, class_name, status) 
           VALUES ($1, $2, $3, $4)`,
          [studentId, 'STD-001', 'Year 4 CS', 'ACTIVE']
        );
        console.log('[Database Seed] Created Student: student1@gmail.com (password: password123, roll: STD-001)');

        // 5. Seed Default Geofence centered around the dashboard simulator coordinates (11.416025, 104.764708)
        const geofenceWkt = 'POLYGON((104.760000 11.412000, 104.770000 11.412000, 104.770000 11.420000, 104.760000 11.420000, 104.760000 11.412000))';
        await client.query(
          `INSERT INTO geofences (name, polygon, created_by) 
           VALUES ($1, ST_GeomFromText($2, 4326), $3)`,
          ['Main Campus Geofence', geofenceWkt, adminId]
        );
        console.log('[Database Seed] Created Default Geofence around: (11.416025, 104.764708)');

        await client.query('COMMIT');
        console.log('[Database] Default database seeding completed successfully.');
      } catch (seedError) {
        await client.query('ROLLBACK');
        console.error('[Database Seed Failed]', seedError);
        throw seedError;
      }
    } else {
      console.log('[Database] Skip seeding (database already has users).');
    }

  } catch (error) {
    console.error('[Database] Failed to connect or verify database setup:', error);
    throw error;
  } finally {
    client.release();
  }
}

export const query = (text: string, params?: any[]) => pool.query(text, params);
