import express from 'express';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Add multiple lessons to a subject (bulk create)
// MUST come before any parameterized routes to avoid matching issues
router.post('/bulk', async (req: AuthRequest, res, next) => {
  try {
    const { subjectId, count, namePrefix = 'Lesson', categoryId, points = 100 } = req.body;
    const db = getDB();

    if (!subjectId) {
      return res.status(400).json({ error: 'Subject ID is required' });
    }

    if (!count || count < 1 || count > 200) {
      return res.status(400).json({ error: 'Count must be between 1 and 200' });
    }

    // Verify subject belongs to user
    const subjectCheck = await db.query(
      'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
      [subjectId, req.userId]
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

    // Get the lesson with the highest order_index to extract its number
    const lastLessonResult = await db.query(
      'SELECT name, order_index, points FROM lessons WHERE subject_id = $1 ORDER BY order_index DESC LIMIT 1',
      [subjectId]
    );

    // Get the max order_index across BOTH lessons and markers to determine where to insert
    const maxOrderResult = await db.query(
      `SELECT COALESCE(MAX(order_index), 0) as max_order FROM (
        SELECT order_index FROM lessons WHERE subject_id = $1
        UNION ALL
        SELECT order_index FROM grading_period_markers WHERE subject_id = $1
      ) AS combined`,
      [subjectId]
    );

    let startNumber = 1;
    let startOrder = maxOrderResult.rows[0].max_order + 1; // Use max across both tables
    let lessonPoints = points; // Default to the provided points
    
    if (lastLessonResult.rows.length > 0) {
      const lastLesson = lastLessonResult.rows[0];
      lessonPoints = lastLesson.points; // Copy points from last lesson
      
      // Try to extract number from the lesson name (e.g., "Lesson 15" -> 15)
      const match = lastLesson.name.match(/(\d+)$/);
      if (match) {
        startNumber = parseInt(match[1], 10) + 1;
      } else {
        // If no number found, count lessons to get the next number
        const lessonCountResult = await db.query(
          'SELECT COUNT(*) as count FROM lessons WHERE subject_id = $1',
          [subjectId]
        );
        startNumber = parseInt(lessonCountResult.rows[0].count) + 1;
      }
    }

    // Create lessons in a transaction
    await db.query('BEGIN');

    try {
      const lessons = [];
      for (let i = 0; i < count; i++) {
        // First insert the lesson
        const insertResult = await db.query(
          'INSERT INTO lessons (subject_id, name, category_id, points, order_index) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [subjectId, `${namePrefix} ${startNumber + i}`, finalCategoryId, lessonPoints, startOrder + i]
        );
        
        const lessonId = insertResult.rows[0].id;
        
        // Then fetch the lesson with joined category data
        const lessonResult = await db.query(
          'SELECT l.*, gct.name as type, gct.color as type_color FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id AND gct.user_id = $2 WHERE l.id = $1',
          [lessonId, req.userId]
        );
        
        lessons.push(lessonResult.rows[0]);
      }

      await db.query('COMMIT');
      res.status(201).json(lessons);
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Get all lessons for a subject
router.get('/subject/:subjectId', async (req: AuthRequest, res) => {
  const { subjectId } = req.params;
  const userId = req.userId;
  const db = getDB();
  try {
    // First verify that the subject belongs to the authenticated user
    const subjectCheck = await db.query(
      'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
      [subjectId, userId]
    );
    
    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const { rows: lessons } = await db.query(
      'SELECT l.*, gct.name as type, gct.color as type_color FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id AND gct.user_id = $2 WHERE l.subject_id = $1 ORDER BY l.order_index ASC',
      [subjectId, userId]
    );
    res.json(lessons);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// Get a single lesson by id
router.get('/:lessonId', async (req: AuthRequest, res) => {
  const { lessonId } = req.params;
  const userId = req.userId;
  const db = getDB();
  try {
    const { rows } = await db.query(
      `SELECT l.*, gct.name as type, gct.color as type_color 
       FROM lessons l 
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id AND gct.user_id = $2
       LEFT JOIN subjects s ON l.subject_id = s.id
       WHERE l.id = $1 AND s.user_id = $2`, 
      [lessonId, userId]
    );
    const lesson = rows[0];
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// Add a lesson to a subject
router.post('/subject/:subjectId', async (req: AuthRequest, res) => {
  const { subjectId } = req.params;
  const { name, categoryId, maxPoints, orderIndex } = req.body;
  const userId = req.userId;
  const db = getDB();
  try {
    console.log('➕ Inserting lesson:', { subjectId, name, orderIndex, categoryId, maxPoints });
    
    // First verify that the subject belongs to the authenticated user
    const subjectCheck = await db.query(
      'SELECT id FROM subjects WHERE id = $1 AND user_id = $2',
      [subjectId, userId]
    );
    
    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    console.log('📈 Shifting lessons >= order_index', orderIndex ?? 1);
    
    // Shift order indices of existing lessons and markers at or after this position
    const lessonsShifted = await db.query(
      'UPDATE lessons SET order_index = order_index + 1 WHERE subject_id = $1 AND order_index >= $2 RETURNING id, name, order_index',
      [subjectId, orderIndex ?? 1]
    );
    
    console.log('📈 Shifted lessons:', lessonsShifted.rows);
    
    const markersShifted = await db.query(
      'UPDATE grading_period_markers SET order_index = order_index + 1 WHERE subject_id = $1 AND order_index >= $2 RETURNING id, name, order_index',
      [subjectId, orderIndex ?? 1]
    );
    
    console.log('📈 Shifted markers:', markersShifted.rows);

    const { rows } = await db.query(
      'INSERT INTO lessons (subject_id, name, category_id, points, order_index) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [subjectId, name, categoryId, maxPoints, orderIndex ?? 1]
    );
    
    console.log('✅ Inserted lesson:', { id: rows[0].id, name: rows[0].name, order_index: rows[0].order_index });
    
    // Fetch the lesson with category name for response
    const { rows: lessonRows } = await db.query(
      'SELECT l.*, gct.name as type, gct.color as type_color FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id WHERE l.id = $1',
      [rows[0].id]
    );
    
    res.status(201).json(lessonRows[0]);
  } catch (err) {
    console.error('❌ Error inserting lesson:', err);
    res.status(500).json({ error: 'Failed to add lesson' });
  }
});

// Update a lesson
router.put('/:lessonId', async (req: AuthRequest, res) => {
  const { lessonId } = req.params;
  const { name, categoryId, maxPoints, points, orderIndex } = req.body;
  const userId = req.userId;
  const db = getDB();
  
  try {
    // First, get the current lesson data and verify user access
    const { rows: currentRows } = await db.query(
      `SELECT l.*, gct.name as type, gct.color as type_color 
       FROM lessons l 
       LEFT JOIN grade_category_types gct ON l.category_id = gct.id AND gct.user_id = $2
       LEFT JOIN subjects s ON l.subject_id = s.id
       WHERE l.id = $1 AND s.user_id = $2`,
      [lessonId, userId]
    );
    const currentLesson = currentRows[0];
    
    if (!currentLesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    // Use current values as defaults for any undefined fields
    const updatedName = name !== undefined ? name : currentLesson.name;
    const updatedCategoryId = categoryId !== undefined ? categoryId : currentLesson.category_id;
    
    // Accept either 'points' or 'maxPoints' for backwards compatibility
    const updatedMaxPoints = (maxPoints !== undefined ? maxPoints : points !== undefined ? points : currentLesson.points);
    const updatedOrderIndex = orderIndex !== undefined ? orderIndex : currentLesson.order_index;
    
    const { rows } = await db.query(
      'UPDATE lessons SET name = $1, category_id = $2, points = $3, order_index = $4 WHERE id = $5 RETURNING *',
      [updatedName, updatedCategoryId, updatedMaxPoints, updatedOrderIndex, lessonId]
    );
    
    // Fetch the updated lesson with category name for response
    const { rows: lessonRows } = await db.query(
      'SELECT l.*, gct.name as type, gct.color as type_color FROM lessons l LEFT JOIN grade_category_types gct ON l.category_id = gct.id WHERE l.id = $1',
      [lessonId]
    );
    
    res.json(lessonRows[0]);
  } catch (err) {
    console.error('Error updating lesson:', err);
    res.status(500).json({ error: 'Failed to update lesson', details: err.message });
  }
});

// Delete a lesson
router.delete('/:lessonId', async (req: AuthRequest, res) => {
  const { lessonId } = req.params;
  const userId = req.userId;
  const db = getDB();
  try {
    // First verify that the lesson belongs to a subject owned by the authenticated user
    const { rows } = await db.query(
      `SELECT l.id, l.subject_id, l.order_index FROM lessons l 
       JOIN subjects s ON l.subject_id = s.id 
       WHERE l.id = $1 AND s.user_id = $2`,
      [lessonId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    const deletedLesson = rows[0];
    const subjectId = deletedLesson.subject_id;
    const deletedOrderIndex = deletedLesson.order_index;
    
    console.log('🗑️  Deleting lesson:', { lessonId, subjectId, deletedOrderIndex });
    
    // Delete the lesson
    await db.query('DELETE FROM lessons WHERE id = $1', [lessonId]);
    
    // Shift down all subsequent lessons in the same subject
    const lessonsShifted = await db.query(
      `UPDATE lessons 
       SET order_index = order_index - 1 
       WHERE subject_id = $1 AND order_index > $2
       RETURNING id, name, order_index`,
      [subjectId, deletedOrderIndex]
    );
    
    console.log('📉 Shifted lessons:', lessonsShifted.rows);
    
    // Shift down all subsequent markers in the same subject
    const markersShifted = await db.query(
      `UPDATE grading_period_markers 
       SET order_index = order_index - 1 
       WHERE subject_id = $1 AND order_index > $2
       RETURNING id, name, order_index`,
      [subjectId, deletedOrderIndex]
    );
    
    console.log('📉 Shifted markers:', markersShifted.rows);
    
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

export default router;
