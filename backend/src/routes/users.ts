import express from 'express';
import bcrypt from 'bcryptjs';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get current user profile
router.get('/profile', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const result = await db.query(
      'SELECT id, email, name, created_at, email_verified, school_name, first_day_of_school, grading_periods FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.put('/profile', async (req: AuthRequest, res, next) => {
  try {
    const { name, school_name, first_day_of_school, grading_periods } = req.body;
    const db = getDB();
    
    if (name && name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters long' });
    }
    
    if (grading_periods && (grading_periods < 1 || grading_periods > 12)) {
      return res.status(400).json({ error: 'Grading periods must be between 1 and 12' });
    }
    
    const result = await db.query(
      `UPDATE users SET 
        name = COALESCE($1, name),
        school_name = $2,
        first_day_of_school = $3,
        grading_periods = COALESCE($4, grading_periods),
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $5 
      RETURNING id, email, name, created_at, email_verified, school_name, first_day_of_school, grading_periods`,
      [
        name ? name.trim() : null, 
        school_name || null, 
        first_day_of_school || null, 
        grading_periods || null, 
        req.userId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Change user password
router.put('/change-password', async (req: AuthRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const db = getDB();
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    
    // Verify current password
    const userResult = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const passwordMatch = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, req.userId]
    );
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

// Delete user account (and all associated data)
router.delete('/account', async (req: AuthRequest, res, next) => {
  try {
    const { confirmPassword } = req.body;
    const db = getDB();
    
    if (!confirmPassword) {
      return res.status(400).json({ error: 'Password confirmation required' });
    }
    
    // Verify password
    const userResult = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const bcrypt = require('bcryptjs');
    const passwordMatch = await bcrypt.compare(confirmPassword, userResult.rows[0].password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    // Delete user (cascading deletes will handle related data)
    await db.query('DELETE FROM users WHERE id = $1', [req.userId]);
    
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// List all users with grade data usage
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const result = await db.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.created_at,
        u.last_login_at,
        0 AS grades_record_count,
        0 AS grades_estimated_bytes
      FROM users u
      ORDER BY u.created_at ASC
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

export default router;