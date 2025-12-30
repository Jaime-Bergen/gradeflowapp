import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDB } from '../database/connection';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all teachers for the current user (organization)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const db = getDB();
    
    console.log('Teachers API - userId:', userId);

    const query = `
      SELECT 
        t.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', sg.id,
              'name', sg.name,
              'description', sg.description
            )
          ) FILTER (WHERE sg.id IS NOT NULL),
          '[]'::json
        ) as assigned_groups
      FROM teachers t
      LEFT JOIN teacher_group_links tgl ON t.id = tgl.teacher_id
      LEFT JOIN student_groups sg ON tgl.student_group_id = sg.id
      WHERE t.user_id = $1
      GROUP BY t.id, t.user_id, t.name, t.email, t.password_hash, t.is_active, t.created_at, t.updated_at, t.created_by
      ORDER BY t.name ASC
    `;

    const result = await db.query(query, [userId]);
    
    console.log('Teachers query result:', result.rows);
    
    // Clean up the response to remove password hash
    const teachers = result.rows.map(teacher => ({
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      is_active: teacher.is_active,
      created_at: teacher.created_at,
      updated_at: teacher.updated_at,
      assigned_groups: teacher.assigned_groups || []
    }));

    res.json({ 
      success: true, 
      data: teachers,
      count: teachers.length 
    });
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch teachers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get a specific teacher
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const teacherId = req.params.id;
    const db = getDB();

    const query = `
      SELECT 
        t.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', sg.id,
              'name', sg.name,
              'description', sg.description
            )
          ) FILTER (WHERE sg.id IS NOT NULL),
          '[]'::json
        ) as assigned_groups
      FROM teachers t
      LEFT JOIN teacher_group_links tgl ON t.id = tgl.teacher_id
      LEFT JOIN student_groups sg ON tgl.student_group_id = sg.id
      WHERE t.id = $1 AND t.user_id = $2
      GROUP BY t.id, t.user_id, t.name, t.email, t.password_hash, t.is_active, t.created_at, t.updated_at, t.created_by
    `;

    const result = await db.query(query, [teacherId, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    const teacher = result.rows[0];
    const response = {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      is_active: teacher.is_active,
      created_at: teacher.created_at,
      updated_at: teacher.updated_at,
      assigned_groups: teacher.assigned_groups || []
    };

    res.json({ 
      success: true, 
      data: response 
    });
  } catch (error) {
    console.error('Error fetching teacher:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch teacher',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create a new teacher
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { name, email, password, selectedGroups = [] } = req.body;
    const db = getDB();

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Check if email is already taken (within this organization)
    const existingTeacher = await db.query(
      'SELECT id FROM teachers WHERE user_id = $1 AND email = $2',
      [userId, email]
    );

    if (existingTeacher.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A teacher with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Start transaction
    await db.query('BEGIN');

    try {
      // Insert teacher
      const teacherResult = await db.query(
        `INSERT INTO teachers (user_id, name, email, password_hash, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, is_active, created_at, updated_at`,
        [userId, name.trim(), email.trim().toLowerCase(), passwordHash, userId]
      );

      const teacher = teacherResult.rows[0];

      // Assign groups if provided
      if (selectedGroups && selectedGroups.length > 0) {
        for (const groupName of selectedGroups) {
          // Get group ID
          const groupResult = await db.query(
            'SELECT id FROM student_groups WHERE user_id = $1 AND name = $2',
            [userId, groupName]
          );

          if (groupResult.rows.length > 0) {
            await db.query(
              'INSERT INTO teacher_group_links (teacher_id, student_group_id) VALUES ($1, $2)',
              [teacher.id, groupResult.rows[0].id]
            );
          }
        }
      }

      await db.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Teacher created successfully',
        data: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          is_active: teacher.is_active,
          created_at: teacher.created_at,
          updated_at: teacher.updated_at,
          assigned_groups: selectedGroups
        }
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error creating teacher:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create teacher',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update a teacher
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const teacherId = req.params.id;
    const { name, email, selectedGroups = [] } = req.body;
    const db = getDB();

    // Validation
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    // Check if teacher exists and belongs to user
    const existingTeacher = await db.query(
      'SELECT id FROM teachers WHERE id = $1 AND user_id = $2',
      [teacherId, userId]
    );

    if (existingTeacher.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    // Check if email is taken by another teacher
    const emailCheck = await db.query(
      'SELECT id FROM teachers WHERE user_id = $1 AND email = $2 AND id != $3',
      [userId, email, teacherId]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Another teacher with this email already exists'
      });
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Update teacher info
      const updateResult = await db.query(
        `UPDATE teachers 
         SET name = $1, email = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND user_id = $4
         RETURNING id, name, email, is_active, created_at, updated_at`,
        [name.trim(), email.trim().toLowerCase(), teacherId, userId]
      );

      const teacher = updateResult.rows[0];

      // Remove existing group assignments
      await db.query(
        'DELETE FROM teacher_group_links WHERE teacher_id = $1',
        [teacherId]
      );

      // Add new group assignments
      if (selectedGroups && selectedGroups.length > 0) {
        for (const groupName of selectedGroups) {
          // Get group ID
          const groupResult = await db.query(
            'SELECT id FROM student_groups WHERE user_id = $1 AND name = $2',
            [userId, groupName]
          );

          if (groupResult.rows.length > 0) {
            await db.query(
              'INSERT INTO teacher_group_links (teacher_id, student_group_id) VALUES ($1, $2)',
              [teacherId, groupResult.rows[0].id]
            );
          }
        }
      }

      await db.query('COMMIT');

      res.json({
        success: true,
        message: 'Teacher updated successfully',
        data: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          is_active: teacher.is_active,
          created_at: teacher.created_at,
          updated_at: teacher.updated_at,
          assigned_groups: selectedGroups
        }
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error updating teacher:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update teacher',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete a teacher
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const teacherId = req.params.id;
    const db = getDB();

    // Check if teacher exists and belongs to user
    const existingTeacher = await db.query(
      'SELECT id, name FROM teachers WHERE id = $1 AND user_id = $2',
      [teacherId, userId]
    );

    if (existingTeacher.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    const teacher = existingTeacher.rows[0];

    // Start transaction
    await db.query('BEGIN');

    try {
      // Delete teacher (cascade will handle group links)
      await db.query(
        'DELETE FROM teachers WHERE id = $1 AND user_id = $2',
        [teacherId, userId]
      );

      await db.query('COMMIT');

      res.json({
        success: true,
        message: `Teacher "${teacher.name}" deleted successfully`
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error deleting teacher:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete teacher',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Toggle teacher active status
router.patch('/:id/toggle-active', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const teacherId = req.params.id;
    const db = getDB();

    const result = await db.query(
      `UPDATE teachers 
       SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, is_active`,
      [teacherId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    const teacher = result.rows[0];
    res.json({
      success: true,
      message: `Teacher "${teacher.name}" ${teacher.is_active ? 'activated' : 'deactivated'}`,
      data: teacher
    });
  } catch (error) {
    console.error('Error toggling teacher status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update teacher status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;