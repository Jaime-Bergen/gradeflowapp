import express from 'express';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get all grading period markers for a subject
router.get('/subject/:subjectId', async (req: AuthRequest, res) => {
  const { subjectId } = req.params;
  const userId = req.userId;
  const db = getDB();
  const schoolYearId = req.schoolYearId;
  try {
    // First verify that the subject belongs to the authenticated user
    const subjectCheck = await db.query(
      'SELECT id FROM subjects WHERE id = $1 AND user_id = $2 AND school_year_id = $3',
      [subjectId, userId, schoolYearId]
    );

    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const { rows: markers } = await db.query(
      'SELECT * FROM grading_period_markers WHERE subject_id = $1 AND school_year_id = $2 ORDER BY order_index ASC',
      [subjectId, schoolYearId]
    );
    res.json(markers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch grading period markers' });
  }
});

// Create a new grading period marker
router.post('/', async (req: AuthRequest, res) => {
  const { subjectId, name, orderIndex } = req.body;
  const userId = req.userId;
  const db = getDB();
  const schoolYearId = req.schoolYearId;

  try {
    // Verify subject belongs to user
    const subjectCheck = await db.query(
      'SELECT id FROM subjects WHERE id = $1 AND user_id = $2 AND school_year_id = $3',
      [subjectId, userId, schoolYearId]
    );

    if (subjectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Get the user's grading periods setting
    const userResult = await db.query(
      'SELECT grading_periods FROM users WHERE id = $1',
      [userId]
    );

    const gradingPeriods = userResult.rows[0]?.grading_periods || 6;
    const maxMarkers = gradingPeriods - 1; // For N periods, you need N-1 markers

    // Count existing markers for this subject
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM grading_period_markers WHERE subject_id = $1 AND school_year_id = $2',
      [subjectId, schoolYearId]
    );

    if (countResult.rows[0].count >= maxMarkers) {
      return res.status(400).json({
        error: `Cannot add more grading period markers. Your grading periods setting (${gradingPeriods}) allows a maximum of ${maxMarkers} markers per subject.`
      });
    }

    // Generate numbered marker name if not provided
    const markerName = name || `End of Grading Period ${parseInt(countResult.rows[0].count) + 1}`;

    // Shift order indices of markers that come after this one
    await db.query(
      'UPDATE grading_period_markers SET order_index = order_index + 1 WHERE subject_id = $1 AND school_year_id = $3 AND order_index >= $2',
      [subjectId, orderIndex, schoolYearId]
    );

    // Also shift lesson order indices
    await db.query(
      'UPDATE lessons SET order_index = order_index + 1 WHERE subject_id = $1 AND school_year_id = $3 AND order_index >= $2',
      [subjectId, orderIndex, schoolYearId]
    );

    const result = await db.query(
      'INSERT INTO grading_period_markers (subject_id, school_year_id, name, order_index) VALUES ($1, $2, $3, $4) RETURNING *',
      [subjectId, schoolYearId, markerName, orderIndex]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating grading period marker:', err);
    res.status(500).json({ error: 'Failed to create grading period marker' });
  }
});

// Update a grading period marker
router.put('/:markerId', async (req: AuthRequest, res) => {
  const { markerId } = req.params;
  const { name, orderIndex } = req.body;
  const userId = req.userId;
  const db = getDB();
  const schoolYearId = req.schoolYearId;

  try {
    // Verify marker belongs to user's subject
    const markerCheck = await db.query(
      `SELECT gpm.*, s.user_id FROM grading_period_markers gpm
       JOIN subjects s ON gpm.subject_id = s.id
       WHERE gpm.id = $1 AND s.user_id = $2 AND gpm.school_year_id = $3`,
      [markerId, userId, schoolYearId]
    );

    if (markerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Grading period marker not found' });
    }

    const subjectId = markerCheck.rows[0].subject_id;
    const oldOrderIndex = markerCheck.rows[0].order_index;

    // If order index changed, shift other items
    if (orderIndex !== oldOrderIndex) {
      if (orderIndex > oldOrderIndex) {
        // Moving down - shift items between old and new position up
        await db.query(
          'UPDATE grading_period_markers SET order_index = order_index - 1 WHERE subject_id = $1 AND school_year_id = $4 AND order_index > $2 AND order_index <= $3',
          [subjectId, oldOrderIndex, orderIndex, schoolYearId]
        );
        await db.query(
          'UPDATE lessons SET order_index = order_index - 1 WHERE subject_id = $1 AND school_year_id = $4 AND order_index > $2 AND order_index <= $3',
          [subjectId, oldOrderIndex, orderIndex, schoolYearId]
        );
      } else {
        // Moving up - shift items between new and old position down
        await db.query(
          'UPDATE grading_period_markers SET order_index = order_index + 1 WHERE subject_id = $1 AND school_year_id = $4 AND order_index >= $2 AND order_index < $3',
          [subjectId, orderIndex, oldOrderIndex, schoolYearId]
        );
        await db.query(
          'UPDATE lessons SET order_index = order_index + 1 WHERE subject_id = $1 AND school_year_id = $4 AND order_index >= $2 AND order_index < $3',
          [subjectId, orderIndex, oldOrderIndex, schoolYearId]
        );
      }
    }

    const result = await db.query(
      'UPDATE grading_period_markers SET name = $1, order_index = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND school_year_id = $4 RETURNING *',
      [name, orderIndex, markerId, schoolYearId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating grading period marker:', err);
    res.status(500).json({ error: 'Failed to update grading period marker' });
  }
});

// Delete a grading period marker
router.delete('/:markerId', async (req: AuthRequest, res) => {
  const { markerId } = req.params;
  const userId = req.userId;
  const db = getDB();
  const schoolYearId = req.schoolYearId;

  try {
    // Verify marker belongs to user's subject
    const markerCheck = await db.query(
      `SELECT gpm.*, s.user_id FROM grading_period_markers gpm
       JOIN subjects s ON gpm.subject_id = s.id
       WHERE gpm.id = $1 AND s.user_id = $2 AND gpm.school_year_id = $3`,
      [markerId, userId, schoolYearId]
    );

    if (markerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Grading period marker not found' });
    }

    const subjectId = markerCheck.rows[0].subject_id;
    const orderIndex = markerCheck.rows[0].order_index;

    // Delete the marker
    await db.query('DELETE FROM grading_period_markers WHERE id = $1 AND school_year_id = $2', [markerId, schoolYearId]);

    // Shift order indices of remaining items
    await db.query(
      'UPDATE grading_period_markers SET order_index = order_index - 1 WHERE subject_id = $1 AND school_year_id = $3 AND order_index > $2',
      [subjectId, orderIndex, schoolYearId]
    );
    await db.query(
      'UPDATE lessons SET order_index = order_index - 1 WHERE subject_id = $1 AND school_year_id = $3 AND order_index > $2',
      [subjectId, orderIndex, schoolYearId]
    );

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting grading period marker:', err);
    res.status(500).json({ error: 'Failed to delete grading period marker' });
  }
});

export default router;