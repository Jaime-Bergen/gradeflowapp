import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let pool: Pool;

export const connectDB = async (): Promise<void> => {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false, // Disable SSL for local Docker development
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test the connection
    const client = await pool.connect();
    console.log('Connected to PostgreSQL database');
    client.release();
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
};

export const getDB = (): Pool => {
  if (!pool) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return pool;
};

export const closeDB = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    console.log('Database connection closed');
  }
};