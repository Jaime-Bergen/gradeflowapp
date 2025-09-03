import express from 'express';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get all keys for the user
router.get('/keys', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const result = await db.query(
      'SELECT key FROM kv_store WHERE user_id = $1 ORDER BY key',
      [req.userId]
    );
    
    const keys = result.rows.map(row => row.key);
    res.json(keys);
  } catch (error) {
    next(error);
  }
});

// Get a value by key
router.get('/:key', async (req: AuthRequest, res, next) => {
  try {
    const { key } = req.params;
    const db = getDB();
    
    const result = await db.query(
      'SELECT value FROM kv_store WHERE key = $1 AND user_id = $2',
      [key, req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ value: undefined });
    }
    
    res.json({ value: result.rows[0].value });
  } catch (error) {
    next(error);
  }
});

// Set a value by key
router.put('/:key', async (req: AuthRequest, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const db = getDB();
    
    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }
    
    await db.query(
      `INSERT INTO kv_store (key, user_id, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (key, user_id)
       DO UPDATE SET value = $3, updated_at = CURRENT_TIMESTAMP`,
      [key, req.userId, JSON.stringify(value)]
    );
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Delete a value by key
router.delete('/:key', async (req: AuthRequest, res, next) => {
  try {
    const { key } = req.params;
    const db = getDB();
    
    const result = await db.query(
      'DELETE FROM kv_store WHERE key = $1 AND user_id = $2 RETURNING key',
      [key, req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Key not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Clear all keys for the user (useful for development/testing)
router.delete('/', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    
    const result = await db.query(
      'DELETE FROM kv_store WHERE user_id = $1',
      [req.userId]
    );
    
    res.json({ 
      success: true, 
      deletedCount: result.rowCount,
      message: `Deleted ${result.rowCount} keys`
    });
  } catch (error) {
    next(error);
  }
});

export default router;