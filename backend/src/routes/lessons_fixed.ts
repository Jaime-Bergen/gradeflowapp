import express from 'express';
import { getDB } from '../database/connection';

const router = express.Router();

// Get all lessons for a subject
router.get('/subject/:subjectId', async (req, res) => {
  const { subjectId } = req.params;
  const db = getDB();
  try {
    const { rows: lessons } = await db.query(
      'SELECT * FROM lessons WHERE subject_id = $1 ORDER BY order_index ASC',
      [subjectId]
    );
    
    // Map the database 'points' column to 'maxPoints' for frontend compatibility
    const mappedLessons = lessons.map(lesson => ({
      ...lesson,
      maxPoints: lesson.points
    }));
    
    res.json(mappedLessons);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// Get a single lesson by id
router.get('/:lessonId', async (req, res) => {
  const { lessonId } = req.params;
  const db = getDB();
  try {
    const { rows } = await db.query('SELECT * FROM lessons WHERE id = $1', [lessonId]);
    const lesson = rows[0];
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    
    // Map the database 'points' column to 'maxPoints' for frontend compatibility
    const mappedLesson = {
      ...lesson,
      maxPoints: lesson.points
    };
    
    res.json(mappedLesson);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// Add a lesson to a subject
router.post('/subject/:subjectId', async (req, res) => {
  const { subjectId } = req.params;
  const { name, type, maxPoints, orderIndex } = req.body;
  const db = getDB();
  try {
    const { rows } = await db.query(
      'INSERT INTO lessons (subject_id, name, type, points, order_index) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [subjectId, name, type, maxPoints, orderIndex ?? 0]
    );
    
    // Map the database 'points' column to 'maxPoints' for frontend compatibility
    const mappedLesson = {
      ...rows[0],
      maxPoints: rows[0].points
    };
    
    res.status(201).json(mappedLesson);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add lesson' });
  }
});

// Update a lesson
router.put('/:lessonId', async (req, res) => {
  const { lessonId } = req.params;
  const { name, type, maxPoints, orderIndex } = req.body;
  const db = getDB();
  
  try {
    // First, get the current lesson data
    const { rows: currentRows } = await db.query('SELECT * FROM lessons WHERE id = $1', [lessonId]);
    const currentLesson = currentRows[0];
    
    if (!currentLesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    // Use current values as defaults for any undefined fields
    const updatedName = name !== undefined ? name : currentLesson.name;
    const updatedType = type !== undefined ? type : currentLesson.type;
    const updatedPoints = maxPoints !== undefined ? maxPoints : currentLesson.points;
    const updatedOrderIndex = orderIndex !== undefined ? orderIndex : currentLesson.order_index;
    
    // Update the lesson
    const { rows } = await db.query(
      'UPDATE lessons SET name = $1, type = $2, points = $3, order_index = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [updatedName, updatedType, updatedPoints, updatedOrderIndex, lessonId]
    );
    
    // Map the database 'points' column to 'maxPoints' for frontend compatibility
    const mappedLesson = {
      ...rows[0],
      maxPoints: rows[0].points
    };
    
    res.json(mappedLesson);
  } catch (err) {
    console.error('Error updating lesson:', err);
    res.status(500).json({ error: 'Failed to update lesson' });
  }
});

// Delete a lesson
router.delete('/:lessonId', async (req, res) => {
  const { lessonId } = req.params;
  const db = getDB();
  
  try {
    const { rows } = await db.query('DELETE FROM lessons WHERE id = $1 RETURNING *', [lessonId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    res.json({ message: 'Lesson deleted successfully' });
  } catch (err) {
    console.error('Error deleting lesson:', err);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

export default router;
