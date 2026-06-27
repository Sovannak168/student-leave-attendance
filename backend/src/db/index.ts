import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const config: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
};

export const pool = new Pool(config);

// Test database connection and ensure PostGIS is installed
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
  } catch (error) {
    console.error('[Database] Failed to connect or verify PostGIS:', error);
    throw error;
  } finally {
    client.release();
  }
}

export const query = (text: string, params?: any[]) => pool.query(text, params);
