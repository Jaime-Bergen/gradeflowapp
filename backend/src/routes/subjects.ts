import express from 'express';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';
import { validateRequest, schemas } from '../middleware/validation';

const router = express.Router();

// Helper function to auto-enroll students in a new subject based on their groups
const autoEnrollStudentsInSubject = async (subjectId: string, userId: string) => {
  try {
    const db = getDB();
    
    // Check if user has auto-enrollment enabled
    const userResult = await db.query(
      'SELECT auto_enroll_subjects FROM users WHERE id = $1',
      [userId]
    );
    
    if (!userResult.rows[0]?.auto_enroll_subjects) {
      return; // Auto-enrollment is disabled
    }
    
    // Get all group IDs for this subject
    const subjectGroupsResult = await db.query(`
      SELECT sg.student_group_id 
      FROM subject_groups sg 
      WHERE sg.subject_id = $1
    `, [subjectId]);
    
    const subjectGroupIds = subjectGroupsResult.rows.map(row => row.student_group_id);
    
    // If subject has no group restrictions, enroll ALL students
    if (subjectGroupIds.length === 0) {
      const allStudentsResult = await db.query(`
        SELECT id FROM students WHERE user_id = $1
      `, [userId]);
      
      for (const student of allStudentsResult.rows) {
        await db.query(
          'INSERT INTO student_subjects (student_id, subject_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [student.id, subjectId]
        );
      }
      
      console.log(`Auto-enrolled ${allStudentsResult.rows.length} students in unrestricted subject ${subjectId}`);
      return;
    }
    
    // Find all students in these groups
    const studentsResult = await db.query(`
      SELECT DISTINCT sgl.student_id 
      FROM student_group_links sgl 
      WHERE sgl.student_group_id = ANY($1::uuid[])
    `, [subjectGroupIds]);
    
    // Auto-enroll students in this subject
    for (const student of studentsResult.rows) {
      await db.query(
        'INSERT INTO student_subjects (student_id, subject_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [student.student_id, subjectId]
      );
    }
    
    console.log(`Auto-enrolled ${studentsResult.rows.length} students in subject ${subjectId}`);
  } catch (error) {
    console.error('Error in subject auto-enrollment:', error);
    // Don't throw error to avoid breaking subject creation
  }
};

// Get all subjects for the authenticated user
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.query;
    const db = getDB();
    
    let query = `
      SELECT s.*, 
        COUNT(DISTINCT l.id) as lesson_count,
        STRING_AGG(DISTINCT sg.name, ', ' ORDER BY sg.name) as group_name
      FROM subjects s 
      LEFT JOIN lessons l ON s.id = l.subject_id
      LEFT JOIN subject_groups sg_rel ON s.id = sg_rel.subject_id
      LEFT JOIN student_groups sg ON sg_rel.student_group_id = sg.id
      WHERE s.user_id = $1
    `;
    let params = [req.userId];
    
    if (groupId) {
      query += ' AND sg_rel.student_group_id = $2';
      params.push(groupId as string);
    }
    
    query += ' GROUP BY s.id ORDER BY s.name';
    
    const result = await db.query(query, params);
    
    // Load weights for each subject
    const subjects = await Promise.all(result.rows.map(async (subject) => {
      const weightsResult = await db.query(`
        SELECT sw.category_id, sw.weight, gct.name as category_name
        FROM subject_weights sw
        JOIN grade_category_types gct ON sw.category_id = gct.id
        WHERE sw.subject_id = $1
      `, [subject.id]);
      
      const weights = {};
      weightsResult.rows.forEach(row => {
        weights[row.category_id] = parseFloat(row.weight);
      });
      
      return { ...subject, weights };
    }));
    
    res.json(subjects);
  } catch (error) {
    next(error);
  }
});

// Get a specific subject with lessons
router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    // Get subject details with associated groups
    const subjectResult = await db.query(
      `SELECT s.*, 
        STRING_AGG(DISTINCT sg.name, ', ' ORDER BY sg.name) as group_name 
       FROM subjects s 
       LEFT JOIN subject_groups sg_rel ON s.id = sg_rel.subject_id
       LEFT JOIN student_groups sg ON sg_rel.student_group_id = sg.id
       WHERE s.id = $1 AND s.user_id = $2
       GROUP BY s.id`,
      [id, req.userId]
    );
    
    if (subjectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const subjectData = subjectResult.rows[0];

    // Load weights for this subject
    const weightsResult = await db.query(`
      SELECT sw.category_id, sw.weight, gct.name as category_name
      FROM subject_weights sw
      JOIN grade_category_types gct ON sw.category_id = gct.id
      WHERE sw.subject_id = $1
    `, [id]);
    
    const weights = {};
    weightsResult.rows.forEach(row => {
      weights[row.category_id] = parseFloat(row.weight);
    });

    subjectData.weights = weights;

    // Get lessons for this subject
    const lessonsResult = await db.query(
      `SELECT l.*, gct.name as type, gct.color as type_color 
       FROM lessons l 
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id 
       WHERE l.subject_id = $1 
       ORDER BY l.order_index`,
      [id]
    );
    
    subjectData.lessons = lessonsResult.rows;
    
    res.json(subjectData);
  } catch (error) {
    next(error);
  }
});

// Create a new subject
router.post('/', validateRequest(schemas.subject), async (req: AuthRequest, res, next) => {
  try {
    const { name, report_card_name, description, groupName, groupIds = [], weights = {} } = req.body;
    const db = getDB();
    
    await db.query('BEGIN');
    
    try {
      // Create the subject (now includes report_card_name)
      const subjectResult = await db.query(
        `INSERT INTO subjects (user_id, name, report_card_name, description)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.userId, name, report_card_name, description]
      );
      
      const subject = subjectResult.rows[0];
      
      // Handle group associations
      let finalGroupIds = groupIds;
      
      // If groupName is provided (legacy support), convert to group IDs
      if (groupName && groupName.trim()) {
        const groupNames = groupName.split(',').map((g: string) => g.trim());
        finalGroupIds = [];
        
        for (const groupNameStr of groupNames) {
          // Find existing group or create new one
          let groupResult = await db.query(
            'SELECT id FROM student_groups WHERE user_id = $1 AND name = $2',
            [req.userId, groupNameStr]
          );
          
          if (groupResult.rows.length === 0) {
            // Create new group
            groupResult = await db.query(
              'INSERT INTO student_groups (user_id, name) VALUES ($1, $2) RETURNING id',
              [req.userId, groupNameStr]
            );
          }
          
          finalGroupIds.push(groupResult.rows[0].id);
        }
      }
      
      // Create subject-group associations
      for (const groupId of finalGroupIds) {
        await db.query(
          'INSERT INTO subject_groups (subject_id, student_group_id) VALUES ($1, $2)',
          [subject.id, groupId]
        );
      }

      // Save subject weights for each category
      for (const [categoryId, weight] of Object.entries(weights)) {
        if (weight && parseFloat(weight as string) > 0) {
          await db.query(
            'INSERT INTO subject_weights (subject_id, category_id, weight) VALUES ($1, $2, $3) ON CONFLICT (subject_id, category_id) DO UPDATE SET weight = $3',
            [subject.id, categoryId, parseFloat(weight as string)]
          );
        }
      }

      await db.query('COMMIT');
      
      // Auto-enroll students in this subject based on groups (if setting is enabled)
      await autoEnrollStudentsInSubject(subject.id, req.userId);
      
      // Return subject with group names
      const finalResult = await db.query(
        `SELECT s.*, 
          STRING_AGG(DISTINCT sg.name, ', ' ORDER BY sg.name) as group_name
         FROM subjects s 
         LEFT JOIN subject_groups sg_rel ON s.id = sg_rel.subject_id
         LEFT JOIN student_groups sg ON sg_rel.student_group_id = sg.id
         WHERE s.id = $1
         GROUP BY s.id`,
        [subject.id]
      );
      
      res.status(201).json(finalResult.rows[0]);
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Update a subject
router.put('/:id', validateRequest(schemas.subject), async (req: AuthRequest, res, next): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, report_card_name, description, groupName, groupIds = [], weights = {} } = req.body;
    const db = getDB();
    
    await db.query('BEGIN');
    
    try {
      // Update the subject (now includes report_card_name)
      const result = await db.query(
        `UPDATE subjects SET 
          name = $1, report_card_name = $2, description = $3, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $4 AND user_id = $5 RETURNING *`,
        [name, report_card_name, description, id, req.userId]
      );
      
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Subject not found' });
        return;
      }
      
      // Remove existing group associations
      await db.query('DELETE FROM subject_groups WHERE subject_id = $1', [id]);
      
      // Handle new group associations
      let finalGroupIds = groupIds;
      
      // If groupName is provided (legacy support), convert to group IDs
      if (groupName && groupName.trim()) {
        const groupNames = groupName.split(',').map((g: string) => g.trim());
        finalGroupIds = [];
        
        for (const groupNameStr of groupNames) {
          // Find existing group or create new one
          let groupResult = await db.query(
            'SELECT id FROM student_groups WHERE user_id = $1 AND name = $2',
            [req.userId, groupNameStr]
          );
          
          if (groupResult.rows.length === 0) {
            // Create new group
            groupResult = await db.query(
              'INSERT INTO student_groups (user_id, name) VALUES ($1, $2) RETURNING id',
              [req.userId, groupNameStr]
            );
          }
          
          finalGroupIds.push(groupResult.rows[0].id);
        }
      }
      
      // Create new subject-group associations
      for (const groupId of finalGroupIds) {
        await db.query(
          `INSERT INTO subject_groups (subject_id, student_group_id) VALUES ($1, $2)
           ON CONFLICT (subject_id, student_group_id) DO NOTHING`,
          [id, groupId]
        );
      }

      // Update subject weights
      // First, delete existing weights for this subject
      await db.query('DELETE FROM subject_weights WHERE subject_id = $1', [id]);
      
      // Then insert new weights
      for (const [categoryId, weight] of Object.entries(weights)) {
        if (weight && parseFloat(weight as string) > 0) {
          await db.query(
            'INSERT INTO subject_weights (subject_id, category_id, weight) VALUES ($1, $2, $3)',
            [id, categoryId, parseFloat(weight as string)]
          );
        }
      }
      
      await db.query('COMMIT');
      
      // Return subject with group names
      const finalResult = await db.query(
        `SELECT s.*, 
          STRING_AGG(DISTINCT sg.name, ', ' ORDER BY sg.name) as group_name
         FROM subjects s 
         LEFT JOIN subject_groups sg_rel ON s.id = sg_rel.subject_id
         LEFT JOIN student_groups sg ON sg_rel.student_group_id = sg.id
         WHERE s.id = $1
         GROUP BY s.id`,
        [id]
      );
      
      res.json(finalResult.rows[0]);
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Delete a subject
router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    const result = await db.query(
      'DELETE FROM subjects WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    
    res.json({ message: 'Subject deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get lessons for a subject
router.get('/:id/lessons', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const db = getDB();
    
    // Verify subject belongs to user
    const subjectCheck = await db.query(
      'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    
    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    
    const result = await db.query(
      `SELECT l.*, gct.name as type 
       FROM lessons l 
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id 
       WHERE l.subject_id = $1 
       ORDER BY l.order_index`,
      [id]
    );
    
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Add a single lesson to a subject
router.post('/:id/lessons', validateRequest(schemas.lesson), async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { name, categoryId, points } = req.body;
    const db = getDB();
    
    // Verify subject belongs to user
    const subjectCheck = await db.query(
      'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    
    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    let finalCategoryId = categoryId;
    
    // If no category provided, use the first available category (prefer default, then active, then any)
    if (!finalCategoryId) {
      const defaultCategoryResult = await db.query(
        'SELECT id FROM grade_category_types WHERE user_id = $1 AND is_default = true ORDER BY created_at LIMIT 1',
        [req.userId]
      );
      if (defaultCategoryResult.rows.length > 0) {
        finalCategoryId = defaultCategoryResult.rows[0].id;
      } else {
        // No default found, try active categories
        const activeCategoryResult = await db.query(
          'SELECT id FROM grade_category_types WHERE user_id = $1 AND is_active = true ORDER BY created_at LIMIT 1',
          [req.userId]
        );
        if (activeCategoryResult.rows.length > 0) {
          finalCategoryId = activeCategoryResult.rows[0].id;
        } else {
          // No active found, use any category
          const anyCategoryResult = await db.query(
            'SELECT id FROM grade_category_types WHERE user_id = $1 ORDER BY created_at LIMIT 1',
            [req.userId]
          );
          if (anyCategoryResult.rows.length > 0) {
            finalCategoryId = anyCategoryResult.rows[0].id;
          } else {
            return res.status(400).json({ error: 'No grade categories found. Please create grade categories first.' });
          }
        }
      }
    }
    
    // Get next order index
    const maxOrderResult = await db.query(
      'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM lessons WHERE subject_id = $1',
      [id]
    );
    
    const nextOrder = maxOrderResult.rows[0].next_order;
    
    const result = await db.query(
      `INSERT INTO lessons (subject_id, name, category_id, points, order_index) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING l.*, gct.name as type, gct.color as type_color 
       FROM lessons l 
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id 
       WHERE l.id = (SELECT currval(pg_get_serial_sequence('lessons', 'id')))`,
      [id, name, finalCategoryId, points, nextOrder]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update a lesson
router.put('/:subjectId/lessons/:lessonId', validateRequest(schemas.lesson), async (req: AuthRequest, res, next) => {
  try {
    const { subjectId, lessonId } = req.params;
    const { name, categoryId, points } = req.body;
    const db = getDB();
    
    // Verify subject belongs to user and lesson belongs to subject, then update
    const result = await db.query(
      `UPDATE lessons SET name = $1, category_id = $2, points = $3, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4 AND subject_id = $5 
       AND EXISTS (SELECT 1 FROM subjects WHERE id = $5 AND user_id = $6)
       RETURNING l.*, gct.name as type, gct.color as type_color 
       FROM lessons l 
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id 
       WHERE l.id = $4`,
      [name, categoryId, points, lessonId, subjectId, req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Bulk import subjects from CSV data
router.post('/bulk-import', async (req: AuthRequest, res, next) => {
  try {
    const { subjects } = req.body;
    
    if (!Array.isArray(subjects)) {
      return res.status(400).json({ error: 'Subjects must be an array' });
    }

    const db = getDB();
    const results = [];
    const createdGroups = new Set<string>();

    // Get grade category types for default weights (same logic as frontend)
    const categoriesResult = await db.query(
      'SELECT id, name, is_active FROM grade_category_types WHERE user_id = $1',
      [req.userId]
    );
    const categories = categoriesResult.rows;
    const activeCategories = categories.filter(cat => cat.is_active !== false);

    // Helper function to normalize names for comparison
    const normalizeName = (name: string) => name.toLowerCase().replace(/[\s\-_]/g, '');

    // Find homework-like category for 34% weight
    let homeworkCategory = activeCategories.find(cat => 
      normalizeName(cat.name) === 'homework'
    );

    if (!homeworkCategory) {
      homeworkCategory = activeCategories.find(cat => 
        ['lesson', 'normal'].includes(normalizeName(cat.name))
      );
    }

    if (!homeworkCategory) {
      // Find first category that's not test/quiz/project/participation
      const excludeNames = ['test', 'tests', 'quiz', 'quizzes', 'project', 'projects', 'participation'];
      homeworkCategory = activeCategories.find(cat => 
        !excludeNames.includes(normalizeName(cat.name))
      );
    }

    // Find test-like category for 66% weight
    let testCategory = activeCategories.find(cat => 
      ['test', 'tests'].includes(normalizeName(cat.name))
    );

    for (const subjectData of subjects) {
      // Validate that required fields are provided
      if (!subjectData.name || subjectData.name.trim() === '') {
        return res.status(400).json({ error: 'Subject name is required for all entries' });
      }

      // Create the subject
      const subjectResult = await db.query(
        'INSERT INTO subjects (user_id, name, report_card_name) VALUES ($1, $2, $3) RETURNING *',
        [req.userId, subjectData.name.trim(), subjectData.reportCardName || subjectData.name.trim()]
      );
      
      const subject = subjectResult.rows[0];
      results.push(subject);

      // Set default weights (34% homework-like, 66% test-like)
      if (homeworkCategory) {
        await db.query(
          'INSERT INTO subject_weights (subject_id, category_id, weight) VALUES ($1, $2, $3)',
          [subject.id, homeworkCategory.id, 0.34]
        );
      }

      if (testCategory && testCategory.id !== homeworkCategory?.id) {
        await db.query(
          'INSERT INTO subject_weights (subject_id, category_id, weight) VALUES ($1, $2, $3)',
          [subject.id, testCategory.id, 0.66]
        );
      } else if (!testCategory && activeCategories.length > 1) {
        // If no test category found, give 66% to the last active category (if different from homework)
        const lastCategory = activeCategories[activeCategories.length - 1];
        if (lastCategory.id !== homeworkCategory?.id) {
          await db.query(
            'INSERT INTO subject_weights (subject_id, category_id, weight) VALUES ($1, $2, $3)',
            [subject.id, lastCategory.id, 0.66]
          );
        }
      }

      // Handle group assignment if provided
      if (subjectData.group && subjectData.group.trim()) {
        const groupName = subjectData.group.trim();
        
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
        
        // Link subject to group
        await db.query(
          'INSERT INTO subject_groups (subject_id, student_group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [subject.id, groupResult.rows[0].id]
        );
      }

      // Auto-enroll students if user has auto-enrollment enabled
      await autoEnrollStudentsInSubject(subject.id, req.userId);
    }

    const message = `Successfully imported ${results.length} subjects`;
    const groupMessage = createdGroups.size > 0 
      ? ` and created ${createdGroups.size} new groups: ${Array.from(createdGroups).join(', ')}`
      : '';

    res.status(201).json({
      message: message + groupMessage,
      subjects: results,
      createdGroups: Array.from(createdGroups)
    });
  } catch (error) {
    next(error);
  }
});

// Get all lessons for a subject

export default router;