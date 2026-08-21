import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { getDB } from '../database/connection';
import { authenticateToken } from '../middleware/auth';

const router = Router();

const getFrontendUrl = () => {
  return (process.env.FRONTEND_URL || 'https://gradeflowapp.com').replace(/\/$/, '');
};

const createMailerTransport = () => {
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpSecure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === 'true'
    : smtpPort === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

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

// Send a sign-in link to a teacher's email
// Note: teachers do not have a separate login - the link signs them into the
// admin's account and pre-selects the teacher's name so filtered views apply.
router.post('/:id/send-signin-link', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const teacherId = req.params.id;
    const db = getDB();

    const teacherResult = await db.query(
      'SELECT id, name, email, is_active FROM teachers WHERE id = $1 AND user_id = $2',
      [teacherId, userId]
    );

    if (teacherResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    const teacher = teacherResult.rows[0];

    if (!teacher.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send a sign-in link to a deactivated teacher'
      });
    }

    const ownerResult = await db.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [userId]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin account not found'
      });
    }

    const owner = ownerResult.rows[0];

    const signOptions: SignOptions = { expiresIn: '180d' };
    const token = jwt.sign(
      {
        userId: owner.id,
        user: {
          id: owner.id,
          email: owner.email,
          name: owner.name
        },
        teacherId: teacher.id,
        purpose: 'teacher_signin'
      },
      process.env.JWT_SECRET!,
      signOptions
    );

    const signinUrl = `${getFrontendUrl()}/teacher-signin?token=${encodeURIComponent(token)}`;

    try {
      const transporter = createMailerTransport();
      const mailOptions = {
        from: `"${process.env.FROM_NAME || 'GradeFlow'}" <${process.env.FROM_EMAIL}>`,
        to: teacher.email,
        subject: 'Your GradeFlow sign-in link',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">GradeFlow Sign-In Link</h2>
            <p>Hello ${teacher.name},</p>
            <p>Use the link below to sign in to GradeFlow. It will take you directly to your view, filtered to your assigned groups.</p>
            <p>
              <a href="${signinUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
                Sign In to GradeFlow
              </a>
            </p>
            <p>If the button does not work, use this link:</p>
            <p><a href="${signinUrl}">${signinUrl}</a></p>
            <p style="color: #666; font-size: 13px;">This link is tied to your school's account and expires in 180 days. Do not share it with anyone outside your school.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 12px;">
              This email was sent from GradeFlow.
            </p>
          </div>
        `,
        text: `
GradeFlow Sign-In Link

Hello ${teacher.name},

Use the link below to sign in to GradeFlow:
${signinUrl}

This link is tied to your school's account and expires in 180 days. Do not share it with anyone outside your school.
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`[TEACHER SIGNIN LINK] Email sent to ${teacher.email}. Message ID: ${info.messageId}`);
    } catch (emailError) {
      console.error(`[TEACHER SIGNIN LINK ERROR] Failed to send email to ${teacher.email}:`, emailError);
      return res.status(502).json({
        success: false,
        message: 'Failed to send sign-in link email'
      });
    }

    res.json({
      success: true,
      message: `Sign-in link sent to ${teacher.email}`
    });
  } catch (error) {
    console.error('Error sending teacher sign-in link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send sign-in link',
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