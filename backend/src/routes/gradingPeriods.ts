import express from 'express'
import { getDB } from '../database/connection'
import { AuthRequest } from '../middleware/auth'
import { validateRequest, schemas } from '../middleware/validation'

const router = express.Router()

// List grading periods for current user
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB()
    const { rows } = await db.query(
      `SELECT id, name, start_date AS "startDate", end_date AS "endDate", order_index AS "orderIndex"
       FROM grading_periods
       WHERE user_id = $1
       ORDER BY order_index ASC`,
      [req.userId]
    )
    res.json(rows)
  } catch (error) {
    next(error)
  }
})

// Replace all grading periods for the user (idempotent upsert style)
router.put('/', validateRequest(schemas.gradingPeriodsBulk), async (req: AuthRequest, res, next) => {
  const { periods } = req.body as { periods: Array<{ id?: string; name: string; startDate: string; endDate: string; orderIndex: number }> }
  try {
    const db = getDB()
    await db.query('BEGIN')
    try {
      // delete missing ones first to keep things clean
      await db.query('DELETE FROM grading_periods WHERE user_id = $1', [req.userId])

      for (const period of periods) {
        await db.query(
          `INSERT INTO grading_periods (id, user_id, name, start_date, end_date, order_index)
           VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             start_date = EXCLUDED.start_date,
             end_date = EXCLUDED.end_date,
             order_index = EXCLUDED.order_index,
             updated_at = CURRENT_TIMESTAMP`,
          [period.id ?? null, req.userId, period.name, period.startDate, period.endDate, period.orderIndex]
        )
      }

      await db.query('COMMIT')
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }

    res.json({ success: true, count: periods.length })
  } catch (error) {
    next(error)
  }
})

export default router
