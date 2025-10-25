import express from 'express';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';
import { validateRequest, schemas } from '../middleware/validation';

const router = express.Router();

// Get all student groups for the authenticated user
router.get('/groups', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const result = await db.query(
      'SELECT * FROM student_groups WHERE user_id = $1 ORDER BY name',
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Create a new student group
router.post('/groups', validateRequest(schemas.studentGroup), async (req: AuthRequest, res, next) => {
  try {
    const { name, description } = req.body;
    const db = getDB();
    
    const result = await db.query(
      'INSERT INTO student_groups (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, name, description]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update a student group
router.put('/groups/:id', validateRequest(schemas.studentGroup), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const db = getDB();
    
    const result = await db.query(
      'UPDATE student_groups SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING *',
      [name, description, id, req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student group not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete a student group
router.delete('/groups/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    const result = await db.query(
      'DELETE FROM student_groups WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student group not found' });
    }
    
    res.json({ message: 'Student group deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get all students for the authenticated user
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.query;
    const db = getDB();
    
    let query = `
      SELECT s.*, 
             groups.group_names as group_name,
             COALESCE(json_agg(ss.subject_id) FILTER (WHERE ss.subject_id IS NOT NULL), '[]') AS subjects
      FROM students s 
      LEFT JOIN (
        SELECT sgl.student_id,
               STRING_AGG(DISTINCT sg.name, ', ' ORDER BY sg.name) as group_names
        FROM student_group_links sgl
        JOIN student_groups sg ON sgl.student_group_id = sg.id
        GROUP BY sgl.student_id
      ) groups ON s.id = groups.student_id
      LEFT JOIN student_subjects ss ON s.id = ss.student_id
      WHERE s.user_id = $1
    `;
    let params = [req.userId];
    
    if (groupId) {
      query += ' AND EXISTS (SELECT 1 FROM student_group_links sgl2 WHERE sgl2.student_id = s.id AND sgl2.student_group_id = $2)';
      params.push(groupId as string);
    }
    
    query += ' GROUP BY s.id, groups.group_names ORDER BY s.name';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get a specific student
router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    const result = await db.query(
      `SELECT s.*, 
              STRING_AGG(DISTINCT sg.name, ', ' ORDER BY sg.name) as group_name
       FROM students s 
       LEFT JOIN student_group_links sgl ON s.id = sgl.student_id
       LEFT JOIN student_groups sg ON sgl.student_group_id = sg.id
       WHERE s.id = $1 AND s.user_id = $2
       GROUP BY s.id`,
      [id, req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Create a new student
router.post('/', validateRequest(schemas.student), async (req: AuthRequest, res, next) => {
  try {
    const { name, birthday, groupName, groupIds } = req.body;
    const db = getDB();
    
    // Create the student first
    const result = await db.query(
      'INSERT INTO students (user_id, name, birthday) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, name, birthday || null]
    );
    
    const studentId = result.rows[0].id;
    
    // Handle group associations
    if (groupIds && Array.isArray(groupIds)) {
      // New format: array of group IDs
      for (const groupId of groupIds) {
        await db.query(
          'INSERT INTO student_group_links (student_id, student_group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [studentId, groupId]
        );
      }
    } else if (groupName) {
      // Legacy format: comma-separated group names
      const groupNames = groupName.split(',').map((g: string) => g.trim()).filter((g: string) => g);
      for (const gName of groupNames) {
        // Ensure the group exists
        let groupRes = await db.query(
          'SELECT id FROM student_groups WHERE user_id = $1 AND name = $2',
          [req.userId, gName]
        );
        if (groupRes.rows.length === 0) {
          groupRes = await db.query(
            'INSERT INTO student_groups (user_id, name) VALUES ($1, $2) RETURNING id',
            [req.userId, gName]
          );
        }
        // Link student to group
        await db.query(
          'INSERT INTO student_group_links (student_id, student_group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [studentId, groupRes.rows[0].id]
        );
      }
    }
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Bulk import students from CSV data
router.post('/bulk-import', async (req: AuthRequest, res, next) => {
  try {
    const { students } = req.body;
    
    if (!Array.isArray(students)) {
      return res.status(400).json({ error: 'Students must be an array' });
    }

    const db = getDB();
    const results = [];
    const createdGroups = new Set<string>();

    for (const studentData of students) {
      // Validate that all required fields are provided
      if (!studentData.name || studentData.name.trim() === '') {
        return res.status(400).json({ error: 'Student name is required for all entries' });
      }
      
      if (!studentData.group || studentData.group.trim() === '') {
        return res.status(400).json({ error: 'Student group is required for all entries' });
      }
      
      if (!studentData.birthday || studentData.birthday.trim() === '') {
        return res.status(400).json({ error: 'Student birthday is required for all entries' });
      }

      // Create the student
      const studentResult = await db.query(
        'INSERT INTO students (user_id, name, birthday) VALUES ($1, $2, $3) RETURNING *',
        [req.userId, studentData.name.trim(), studentData.birthday]
      );
      
      const student = studentResult.rows[0];
      results.push(student);

      // Handle group assignment (now always provided)
      const groupName = studentData.group.trim();
      
      // Check if group exists, create if not
      let groupResult = await db.query(
        'SELECT id FROM student_groups WHERE user_id = $1 AND name = $2',
        [req.userId, groupName]
      );
      
      if (groupResult.rows.length === 0) {
        groupResult = await db.query(
          'INSERT INTO student_groups (user_id, name) VALUES ($1, $2) RETURNING id, name',
          [req.userId, groupName]
        );
        createdGroups.add(groupName);
      }
      
      // Link student to group
      await db.query(
        'INSERT INTO student_group_links (student_id, student_group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [student.id, groupResult.rows[0].id]
      );
    }

    const message = `Successfully imported ${results.length} students`;
    const groupMessage = createdGroups.size > 0 
      ? ` and created ${createdGroups.size} new groups: ${Array.from(createdGroups).join(', ')}`
      : '';

    res.status(201).json({
      message: message + groupMessage,
      students: results,
      createdGroups: Array.from(createdGroups)
    });
  } catch (error) {
    next(error);
  }
});

// Update a student
router.put('/:id', validateRequest(schemas.student), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { name, birthday, groupName, groupIds } = req.body;
    const db = getDB();
    
    // Update the student record
    const result = await db.query(
      'UPDATE students SET name = $1, birthday = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING *',
      [name, birthday || null, id, req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Remove existing group associations
    await db.query(
      'DELETE FROM student_group_links WHERE student_id = $1',
      [id]
    );
    
    // Handle group associations
    if (groupIds && Array.isArray(groupIds)) {
      // New format: array of group IDs
      for (const groupId of groupIds) {
        await db.query(
          'INSERT INTO student_group_links (student_id, student_group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, groupId]
        );
      }
    } else if (groupName) {
      // Legacy format: comma-separated group names
      const groupNames = groupName.split(',').map((g: string) => g.trim()).filter((g: string) => g);
      for (const gName of groupNames) {
        // Ensure the group exists
        let groupRes = await db.query(
          'SELECT id FROM student_groups WHERE user_id = $1 AND name = $2',
          [req.userId, gName]
        );
        if (groupRes.rows.length === 0) {
          groupRes = await db.query(
            'INSERT INTO student_groups (user_id, name) VALUES ($1, $2) RETURNING id',
            [req.userId, gName]
          );
        }
        // Link student to group
        await db.query(
          'INSERT INTO student_group_links (student_id, student_group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, groupRes.rows[0].id]
        );
      }
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete a student
router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    const result = await db.query(
      'DELETE FROM students WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Update subjects for a student
router.put('/:id/subjects', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { subjects } = req.body;
    const db = getDB();

    // Validate subjects
    if (!Array.isArray(subjects)) {
      return res.status(400).json({ error: 'Subjects must be an array of subject IDs' });
    }

    // Verify all subjects belong to the user
    const subjectCheck = await db.query(
      'SELECT id FROM subjects WHERE id = ANY($1) AND user_id = $2',
      [subjects, req.userId]
    );

    if (subjectCheck.rows.length !== subjects.length) {
      return res.status(400).json({ error: 'One or more subjects are invalid' });
    }

    // Update the student's subjects
    await db.query('DELETE FROM student_subjects WHERE student_id = $1', [id]);

    if (subjects.length > 0) {
      const insertQuery = `INSERT INTO student_subjects (student_id, subject_id) VALUES ${subjects
        .map((_, index) => `($1, $${index + 2})`)
        .join(',')}`;
      console.log('Insert Query:', insertQuery);
      console.log('Query Parameters:', [id, ...subjects]);
      await db.query(insertQuery, [id, ...subjects]);
    }

    // After updating the student's subjects, fetch and return the updated subjects
    const updatedSubjects = await db.query(
      'SELECT subject_id FROM student_subjects WHERE student_id = $1',
      [id]
    );
    res.json({
      message: 'Subjects updated successfully',
      subjects: updatedSubjects.rows.map(row => row.subject_id),
    });
  } catch (error) {
    next(error);
  }
});

export default router;