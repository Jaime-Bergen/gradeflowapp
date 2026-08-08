import express from 'express';
import bcrypt from 'bcryptjs';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

const getAdminPasscode = (): string | null => {
  return process.env.ADMIN_PASSCODE || process.env.VITE_ADMIN_PASS || null;
};

const requireAdminPasscode = (req: AuthRequest, res: any): boolean => {
  const expected = getAdminPasscode();
  if (!expected) {
    res.status(500).json({ error: 'Admin passcode is not configured on the server' });
    return false;
  }

  const provided = String(req.headers['x-admin-passcode'] || '').trim();
  if (!provided || provided !== expected) {
    res.status(403).json({ error: 'Invalid admin passcode' });
    return false;
  }

  return true;
};

const getLicensedYearsForUser = async (db: any, userId: string) => {
  const { rows } = await db.query(
    `SELECT
      sy.id,
      sy.label,
      sy.start_date,
      sy.end_date,
      usyl.id AS license_id,
      usyl.grant_source,
      usyl.created_at AS licensed_at
     FROM user_school_year_licenses usyl
     JOIN school_years sy ON sy.id = usyl.school_year_id
     WHERE usyl.user_id = $1
     ORDER BY sy.start_date DESC`,
    [userId]
  );

  return rows.map((row: any) => ({
    id: row.id,
    label: row.label,
    start_date: row.start_date,
    end_date: row.end_date,
    license_id: row.license_id,
    grant_source: row.grant_source,
    licensed_at: row.licensed_at,
  }));
};

// Get current user profile
router.get('/profile', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    console.log('Profile API - userId:', req.userId);
    const result = await db.query(
      `SELECT 
        u.id, u.email, u.name, u.created_at, u.email_verified, 
        u.school_name, u.first_day_of_school, u.grading_periods, u.auto_enroll_subjects, u.grading_mode,
        u.active_school_year_id,
        sy.label AS active_school_year_label,
        sy.start_date AS active_school_year_start_date,
        sy.end_date AS active_school_year_end_date
       FROM users u
       LEFT JOIN school_years sy ON sy.id = u.active_school_year_id
       WHERE u.id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = result.rows[0];
    const licensedYears = await getLicensedYearsForUser(db, req.userId!);

    res.json({
      ...profile,
      licensed_school_years: licensedYears,
    });
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.put('/profile', async (req: AuthRequest, res, next) => {
  try {
    const { name, school_name, first_day_of_school, grading_periods, auto_enroll_subjects, grading_mode, active_school_year_id } = req.body;
    const db = getDB();
    
    if (name && name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters long' });
    }
    
    if (grading_periods && (grading_periods < 1 || grading_periods > 12)) {
      return res.status(400).json({ error: 'Grading periods must be between 1 and 12' });
    }
    
    // Validate grading mode if provided
    const normalizedMode = grading_mode ? String(grading_mode).toLowerCase() : null;
    if (normalizedMode && normalizedMode !== 'dates' && normalizedMode !== 'markers') {
      return res.status(400).json({ error: 'grading_mode must be "dates" or "markers"' });
    }

    if (active_school_year_id) {
      const activeYearLicense = await db.query(
        `SELECT 1
         FROM user_school_year_licenses
         WHERE user_id = $1 AND school_year_id = $2
         LIMIT 1`,
        [req.userId, active_school_year_id]
      );

      if (activeYearLicense.rows.length === 0) {
        return res.status(400).json({ error: 'You do not have a license for the selected school year' });
      }
    }

    if (first_day_of_school) {
      const licensedRangeCheck = await db.query(
        `SELECT 1
         FROM user_school_year_licenses usyl
         JOIN school_years sy ON sy.id = usyl.school_year_id
         WHERE usyl.user_id = $1
           AND $2::date BETWEEN sy.start_date AND sy.end_date
         LIMIT 1`,
        [req.userId, first_day_of_school]
      );

      if (licensedRangeCheck.rows.length === 0) {
        return res.status(400).json({ error: 'first_day_of_school must be within a licensed school year range' });
      }
    }

    const result = await db.query(
      `UPDATE users SET 
        name = COALESCE($1, name),
        school_name = $2,
        first_day_of_school = $3,
        grading_periods = COALESCE($4, grading_periods),
        auto_enroll_subjects = COALESCE($5, auto_enroll_subjects),
        grading_mode = COALESCE($6, grading_mode),
        active_school_year_id = COALESCE($7, active_school_year_id),
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = $8 
      RETURNING id, email, name, created_at, email_verified, school_name, first_day_of_school, grading_periods, auto_enroll_subjects, grading_mode, active_school_year_id`,
      [
        name ? name.trim() : null, 
        school_name || null, 
        first_day_of_school || null, 
        grading_periods || null, 
        auto_enroll_subjects !== undefined ? auto_enroll_subjects : null,
        normalizedMode || null,
        active_school_year_id || null,
        req.userId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updated = result.rows[0];
    const activeYear = updated.active_school_year_id
      ? await db.query(
          `SELECT label, start_date, end_date FROM school_years WHERE id = $1`,
          [updated.active_school_year_id]
        )
      : { rows: [] };

    const licensedYears = await getLicensedYearsForUser(db, req.userId!);

    res.json({
      ...updated,
      active_school_year_label: activeYear.rows[0]?.label || null,
      active_school_year_start_date: activeYear.rows[0]?.start_date || null,
      active_school_year_end_date: activeYear.rows[0]?.end_date || null,
      licensed_school_years: licensedYears,
    });
  } catch (error) {
    next(error);
  }
});

// List school years licensed for the current user
router.get('/licensed-years', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const licensedYears = await getLicensedYearsForUser(db, req.userId!);
    res.json(licensedYears);
  } catch (error) {
    next(error);
  }
});

// Set active school year for current user
router.put('/active-school-year', async (req: AuthRequest, res, next) => {
  try {
    const { schoolYearId } = req.body;
    const db = getDB();

    if (!schoolYearId) {
      return res.status(400).json({ error: 'schoolYearId is required' });
    }

    const licenseCheck = await db.query(
      `SELECT 1 FROM user_school_year_licenses WHERE user_id = $1 AND school_year_id = $2 LIMIT 1`,
      [req.userId, schoolYearId]
    );

    if (licenseCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have a license for this school year' });
    }

    const updateResult = await db.query(
      `UPDATE users
       SET active_school_year_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING active_school_year_id`,
      [req.userId, schoolYearId]
    );

    const yearResult = await db.query(
      `SELECT label, start_date, end_date FROM school_years WHERE id = $1`,
      [schoolYearId]
    );

    res.json({
      active_school_year_id: updateResult.rows[0]?.active_school_year_id || null,
      active_school_year_label: yearResult.rows[0]?.label || null,
      active_school_year_start_date: yearResult.rows[0]?.start_date || null,
      active_school_year_end_date: yearResult.rows[0]?.end_date || null,
    });
  } catch (error) {
    next(error);
  }
});

// Admin-only: list all school years
router.get('/admin/school-years', async (req: AuthRequest, res, next) => {
  try {
    if (!requireAdminPasscode(req, res)) {
      return;
    }

    const db = getDB();
    const { rows } = await db.query(
      `SELECT id, label, start_date, end_date, created_at, updated_at
       FROM school_years
       ORDER BY start_date DESC`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// Admin-only: create school year
router.post('/admin/school-years', async (req: AuthRequest, res, next) => {
  try {
    if (!requireAdminPasscode(req, res)) {
      return;
    }

    const { label, startDate, endDate } = req.body;
    const db = getDB();

    if (!label || !startDate || !endDate) {
      return res.status(400).json({ error: 'label, startDate, and endDate are required' });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ error: 'startDate must be before or equal to endDate' });
    }

    const insert = await db.query(
      `INSERT INTO school_years (label, start_date, end_date)
       VALUES ($1, $2::date, $3::date)
       RETURNING id, label, start_date, end_date, created_at, updated_at`,
      [String(label).trim(), startDate, endDate]
    );

    res.status(201).json(insert.rows[0]);
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(400).json({ error: 'A school year with this label already exists' });
    }
    next(error);
  }
});

// Admin-only: list licenses for a user
router.get('/admin/licenses/:userId', async (req: AuthRequest, res, next) => {
  try {
    if (!requireAdminPasscode(req, res)) {
      return;
    }

    const { userId } = req.params;
    const db = getDB();

    const { rows } = await db.query(
      `SELECT
        usyl.id,
        usyl.user_id,
        usyl.school_year_id,
        usyl.grant_source,
        usyl.notes,
        usyl.created_at,
        usyl.updated_at,
        sy.label,
        sy.start_date,
        sy.end_date,
        (u.active_school_year_id = usyl.school_year_id) AS is_active
       FROM user_school_year_licenses usyl
       JOIN school_years sy ON sy.id = usyl.school_year_id
       JOIN users u ON u.id = usyl.user_id
       WHERE usyl.user_id = $1
       ORDER BY sy.start_date DESC`,
      [userId]
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// Admin-only: grant a license to a user
router.post('/admin/licenses/grant', async (req: AuthRequest, res, next) => {
  try {
    if (!requireAdminPasscode(req, res)) {
      return;
    }

    const { userId, schoolYearId, notes, setAsActive } = req.body;
    const db = getDB();

    if (!userId || !schoolYearId) {
      return res.status(400).json({ error: 'userId and schoolYearId are required' });
    }

    const insert = await db.query(
      `INSERT INTO user_school_year_licenses (user_id, school_year_id, granted_by, grant_source, notes)
       VALUES ($1, $2, $3, 'manual', $4)
       ON CONFLICT (user_id, school_year_id)
       DO UPDATE SET
         notes = COALESCE(EXCLUDED.notes, user_school_year_licenses.notes),
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, user_id, school_year_id, grant_source, notes, created_at, updated_at`,
      [userId, schoolYearId, req.userId || null, notes || null]
    );

    if (setAsActive) {
      await db.query(
        `UPDATE users
         SET active_school_year_id = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [userId, schoolYearId]
      );
    }

    res.status(201).json(insert.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Admin-only: revoke a license
router.delete('/admin/licenses/:licenseId', async (req: AuthRequest, res, next) => {
  try {
    if (!requireAdminPasscode(req, res)) {
      return;
    }

    const { licenseId } = req.params;
    const db = getDB();

    const licenseResult = await db.query(
      `SELECT id, user_id, school_year_id FROM user_school_year_licenses WHERE id = $1`,
      [licenseId]
    );

    if (licenseResult.rows.length === 0) {
      return res.status(404).json({ error: 'License not found' });
    }

    const { user_id, school_year_id } = licenseResult.rows[0];

    await db.query(
      `DELETE FROM user_school_year_licenses WHERE id = $1`,
      [licenseId]
    );

    const userActive = await db.query(
      `SELECT active_school_year_id FROM users WHERE id = $1`,
      [user_id]
    );

    if (userActive.rows[0]?.active_school_year_id === school_year_id) {
      const fallback = await db.query(
        `SELECT usyl.school_year_id
         FROM user_school_year_licenses usyl
         JOIN school_years sy ON sy.id = usyl.school_year_id
         WHERE usyl.user_id = $1
         ORDER BY sy.start_date DESC
         LIMIT 1`,
        [user_id]
      );

      await db.query(
        `UPDATE users
         SET active_school_year_id = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [user_id, fallback.rows[0]?.school_year_id || null]
      );
    }

    res.json({ success: true });
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
        COALESCE(g.grades_count, 0) AS grades_record_count,
        COALESCE(g.grades_count * 100, 0) AS grades_estimated_bytes
      FROM users u
      LEFT JOIN (
        SELECT 
          s.user_id,
          COUNT(g.id) AS grades_count
        FROM students s
        INNER JOIN grades g ON s.id = g.student_id
        GROUP BY s.user_id
      ) g ON u.id = g.user_id
      ORDER BY u.created_at ASC
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

export default router;