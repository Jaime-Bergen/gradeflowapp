import express from 'express';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

const gradeToNumberExpr = `NULLIF(regexp_replace(COALESCE(s.grade, ''), '[^0-9]', '', 'g'), '')::int`;

const ensureLicensedYear = async (db: any, userId: string, schoolYearId: string) => {
  const licenseResult = await db.query(
    `SELECT 1 FROM user_school_year_licenses WHERE user_id = $1 AND school_year_id = $2 LIMIT 1`,
    [userId, schoolYearId]
  );
  return licenseResult.rows.length > 0;
};

const parseAndAdvanceGrade = (grade: string | null | undefined, shouldPromote: boolean): string | null => {
  if (!grade) return grade ?? null;
  if (!shouldPromote) return grade;

  const trimmed = String(grade).trim();
  const match = trimmed.match(/^(\D*)(\d+)(\D*)$/);
  if (!match) return trimmed;

  const prefix = match[1] || '';
  const num = Number(match[2]);
  const suffix = match[3] || '';
  if (!Number.isFinite(num)) return trimmed;
  return `${prefix}${num + 1}${suffix}`;
};

router.get('/scopes', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const schoolYearId = req.schoolYearId;

    const scopesResult = await db.query(
      `SELECT
        rs.id,
        rs.user_id,
        rs.school_year_id,
        rs.name,
        rs.min_grade,
        rs.max_grade,
        rs.teacher_id,
        rs.status,
        rs.lock_notes,
        rs.locked_at,
        rs.locked_by_teacher_id,
        rs.created_at,
        rs.updated_at,
        t.name AS teacher_name,
        t.email AS teacher_email,
        lbt.name AS locked_by_teacher_name
      FROM rollover_scopes rs
      LEFT JOIN teachers t ON t.id = rs.teacher_id
      LEFT JOIN teachers lbt ON lbt.id = rs.locked_by_teacher_id
      WHERE rs.user_id = $1 AND rs.school_year_id = $2
      ORDER BY rs.min_grade ASC, rs.name ASC`,
      [req.userId, schoolYearId]
    );

    const scopes = [];
    for (const scope of scopesResult.rows) {
      const summaryResult = await db.query(
        `WITH scoped_students AS (
           SELECT s.id
           FROM students s
           WHERE s.user_id = $1
             AND s.school_year_id = $2
             AND ${gradeToNumberExpr} BETWEEN $3 AND $4
         ),
         student_avgs AS (
           SELECT ss.id, AVG(g.percentage) AS avg_percentage
           FROM scoped_students ss
           LEFT JOIN grades g
             ON g.student_id = ss.id
            AND g.school_year_id = $2
            AND g.percentage IS NOT NULL
            AND g.percentage >= 1
           GROUP BY ss.id
         )
         SELECT
           (SELECT COUNT(*) FROM scoped_students) AS total_students,
           COUNT(*) FILTER (WHERE student_avgs.avg_percentage IS NOT NULL AND student_avgs.avg_percentage < 80) AS at_risk_students
         FROM student_avgs`,
        [req.userId, schoolYearId, scope.min_grade, scope.max_grade]
      );

      scopes.push({
        ...scope,
        total_students: Number(summaryResult.rows[0]?.total_students || 0),
        at_risk_students: Number(summaryResult.rows[0]?.at_risk_students || 0),
      });
    }

    res.json(scopes);
  } catch (error) {
    next(error);
  }
});

router.post('/scopes', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const schoolYearId = req.schoolYearId;
    const { name, minGrade, maxGrade, teacherId } = req.body;

    if (!name || minGrade === undefined || maxGrade === undefined) {
      return res.status(400).json({ error: 'name, minGrade, and maxGrade are required' });
    }

    const parsedMin = Number(minGrade);
    const parsedMax = Number(maxGrade);
    if (!Number.isInteger(parsedMin) || !Number.isInteger(parsedMax) || parsedMin < 0 || parsedMax < parsedMin) {
      return res.status(400).json({ error: 'Invalid grade range' });
    }

    let teacherIdToUse: string | null = teacherId || null;
    if (teacherIdToUse) {
      const teacherCheck = await db.query(
        `SELECT id FROM teachers WHERE id = $1 AND user_id = $2`,
        [teacherIdToUse, req.userId]
      );
      if (teacherCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Assigned teacher does not belong to this user' });
      }
    }

    const insertResult = await db.query(
      `INSERT INTO rollover_scopes (user_id, school_year_id, name, min_grade, max_grade, teacher_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.userId, schoolYearId, String(name).trim(), parsedMin, parsedMax, teacherIdToUse]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(400).json({ error: 'A rollover scope with this name already exists for the current year' });
    }
    next(error);
  }
});

router.put('/scopes/:scopeId', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const schoolYearId = req.schoolYearId;
    const { scopeId } = req.params;
    const { name, minGrade, maxGrade, teacherId } = req.body;

    const existingScope = await db.query(
      `SELECT id, status FROM rollover_scopes WHERE id = $1 AND user_id = $2 AND school_year_id = $3`,
      [scopeId, req.userId, schoolYearId]
    );

    if (existingScope.rows.length === 0) {
      return res.status(404).json({ error: 'Rollover scope not found' });
    }

    if (existingScope.rows[0].status === 'locked') {
      return res.status(409).json({ error: 'Locked scopes must be unlocked before editing' });
    }

    const parsedMin = Number(minGrade);
    const parsedMax = Number(maxGrade);
    if (!Number.isInteger(parsedMin) || !Number.isInteger(parsedMax) || parsedMin < 0 || parsedMax < parsedMin) {
      return res.status(400).json({ error: 'Invalid grade range' });
    }

    let teacherIdToUse: string | null = teacherId || null;
    if (teacherIdToUse) {
      const teacherCheck = await db.query(
        `SELECT id FROM teachers WHERE id = $1 AND user_id = $2`,
        [teacherIdToUse, req.userId]
      );
      if (teacherCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Assigned teacher does not belong to this user' });
      }
    }

    const result = await db.query(
      `UPDATE rollover_scopes
       SET name = $1,
           min_grade = $2,
           max_grade = $3,
           teacher_id = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6 AND school_year_id = $7
       RETURNING *`,
      [String(name).trim(), parsedMin, parsedMax, teacherIdToUse, scopeId, req.userId, schoolYearId]
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(400).json({ error: 'A rollover scope with this name already exists for the current year' });
    }
    next(error);
  }
});

router.post('/scopes/:scopeId/lock', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const schoolYearId = req.schoolYearId;
    const { scopeId } = req.params;
    const { teacherId, notes } = req.body;

    const scopeResult = await db.query(
      `SELECT id, teacher_id, status
       FROM rollover_scopes
       WHERE id = $1 AND user_id = $2 AND school_year_id = $3`,
      [scopeId, req.userId, schoolYearId]
    );

    if (scopeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rollover scope not found' });
    }

    const scope = scopeResult.rows[0];
    if (scope.status === 'locked') {
      return res.status(409).json({ error: 'Scope is already locked' });
    }

    const lockTeacherId = teacherId || scope.teacher_id || null;

    if (lockTeacherId) {
      const teacherCheck = await db.query(
        `SELECT id FROM teachers WHERE id = $1 AND user_id = $2`,
        [lockTeacherId, req.userId]
      );
      if (teacherCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Teacher does not belong to this user' });
      }
    }

    const result = await db.query(
      `UPDATE rollover_scopes
       SET status = 'locked',
           lock_notes = $1,
           locked_at = CURRENT_TIMESTAMP,
           locked_by_teacher_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4 AND school_year_id = $5
       RETURNING *`,
      [notes || null, lockTeacherId, scopeId, req.userId, schoolYearId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post('/scopes/:scopeId/unlock', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const schoolYearId = req.schoolYearId;
    const { scopeId } = req.params;

    const result = await db.query(
      `UPDATE rollover_scopes
       SET status = 'draft',
           lock_notes = NULL,
           locked_at = NULL,
           locked_by_teacher_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND school_year_id = $3
       RETURNING *`,
      [scopeId, req.userId, schoolYearId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rollover scope not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get('/scopes/:scopeId/preview', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const schoolYearId = req.schoolYearId;
    const { scopeId } = req.params;
    const threshold = Number(req.query.riskThreshold || 80);

    const scopeResult = await db.query(
      `SELECT id, name, min_grade, max_grade, status
       FROM rollover_scopes
       WHERE id = $1 AND user_id = $2 AND school_year_id = $3`,
      [scopeId, req.userId, schoolYearId]
    );

    if (scopeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rollover scope not found' });
    }

    const scope = scopeResult.rows[0];

    const studentsResult = await db.query(
      `WITH student_avgs AS (
         SELECT
           s.id,
           s.name,
           s.grade,
           AVG(g.percentage) FILTER (WHERE g.percentage IS NOT NULL AND g.percentage >= 1) AS average_percentage
         FROM students s
         LEFT JOIN grades g ON g.student_id = s.id AND g.school_year_id = $2
         WHERE s.user_id = $1
           AND s.school_year_id = $2
           AND ${gradeToNumberExpr} BETWEEN $3 AND $4
         GROUP BY s.id, s.name, s.grade
       )
       SELECT
         id,
         name,
         grade,
         ROUND(average_percentage::numeric, 1) AS average_percentage,
         CASE
           WHEN average_percentage IS NULL THEN false
           WHEN average_percentage < $5 THEN true
           ELSE false
         END AS suggested_hold_back
       FROM student_avgs
       ORDER BY grade NULLS LAST, name`,
      [req.userId, schoolYearId, scope.min_grade, scope.max_grade, threshold]
    );

    res.json({
      scope,
      riskThreshold: threshold,
      students: studentsResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/scopes/:scopeId/execute/students', async (req: AuthRequest, res, next) => {
  const db = getDB();
  const schoolYearId = req.schoolYearId;
  const { scopeId } = req.params;
  const { targetSchoolYearId, holdBackStudentIds = [] } = req.body || {};

  if (!targetSchoolYearId) {
    return res.status(400).json({ error: 'targetSchoolYearId is required' });
  }

  try {
    const scopeResult = await db.query(
      `SELECT id, name, min_grade, max_grade, status
       FROM rollover_scopes
       WHERE id = $1 AND user_id = $2 AND school_year_id = $3`,
      [scopeId, req.userId, schoolYearId]
    );

    if (scopeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rollover scope not found' });
    }

    const scope = scopeResult.rows[0];
    if (scope.status !== 'locked') {
      return res.status(409).json({ error: 'Scope must be locked before executing rollover steps' });
    }

    if (String(targetSchoolYearId) === String(schoolYearId)) {
      return res.status(400).json({ error: 'Target school year must be different from source school year' });
    }

    const hasLicense = await ensureLicensedYear(db, req.userId!, targetSchoolYearId);
    if (!hasLicense) {
      return res.status(403).json({ error: 'You are not licensed for the target school year' });
    }

    const holdBackSet = new Set((Array.isArray(holdBackStudentIds) ? holdBackStudentIds : []).map((id: any) => String(id)));

    const sourceStudentsResult = await db.query(
      `SELECT s.id, s.name, s.birthday, s.grade, s.created_at, s.updated_at
       FROM students s
       WHERE s.user_id = $1
         AND s.school_year_id = $2
         AND ${gradeToNumberExpr} BETWEEN $3 AND $4
       ORDER BY s.name`,
      [req.userId, schoolYearId, scope.min_grade, scope.max_grade]
    );

    await db.query('BEGIN');
    try {
      let createdStudents = 0;
      let reusedStudents = 0;
      let promotedStudents = 0;
      let heldBackStudents = 0;
      let groupLinksCreated = 0;

      const sourceToTargetStudentMap = new Map<string, string>();

      for (const student of sourceStudentsResult.rows) {
        const shouldPromote = !holdBackSet.has(String(student.id));
        const nextGrade = parseAndAdvanceGrade(student.grade, shouldPromote);

        if (shouldPromote) promotedStudents += 1;
        else heldBackStudents += 1;

        const existingStudent = await db.query(
          `SELECT id
           FROM students
           WHERE user_id = $1
             AND school_year_id = $2
             AND name = $3
             AND COALESCE(birthday::text, '') = COALESCE($4::text, '')
           LIMIT 1`,
          [req.userId, targetSchoolYearId, student.name, student.birthday || null]
        );

        let targetStudentId: string;
        if (existingStudent.rows.length > 0) {
          targetStudentId = existingStudent.rows[0].id;
          reusedStudents += 1;
          await db.query(
            `UPDATE students
             SET grade = COALESCE($1, grade),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [nextGrade, targetStudentId]
          );
        } else {
          const insertStudent = await db.query(
            `INSERT INTO students (user_id, school_year_id, name, birthday, grade, created_at, updated_at)
             VALUES ($1, $2, $3, $4::date, $5, $6, $7)
             RETURNING id`,
            [
              req.userId,
              targetSchoolYearId,
              student.name,
              student.birthday || null,
              nextGrade,
              student.created_at || new Date().toISOString(),
              student.updated_at || new Date().toISOString(),
            ]
          );
          targetStudentId = insertStudent.rows[0].id;
          createdStudents += 1;
        }

        sourceToTargetStudentMap.set(String(student.id), targetStudentId);

        const sourceGroups = await db.query(
          `SELECT sg.name
           FROM student_group_links sgl
           JOIN student_groups sg ON sg.id = sgl.student_group_id
           WHERE sgl.student_id = $1
             AND sgl.school_year_id = $2`,
          [student.id, schoolYearId]
        );

        for (const group of sourceGroups.rows) {
          let targetGroup = await db.query(
            `SELECT id FROM student_groups
             WHERE user_id = $1 AND school_year_id = $2 AND name = $3
             LIMIT 1`,
            [req.userId, targetSchoolYearId, group.name]
          );

          if (targetGroup.rows.length === 0) {
            targetGroup = await db.query(
              `INSERT INTO student_groups (user_id, school_year_id, name)
               VALUES ($1, $2, $3)
               RETURNING id`,
              [req.userId, targetSchoolYearId, group.name]
            );
          }

          const linkResult = await db.query(
            `INSERT INTO student_group_links (student_id, student_group_id, school_year_id)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING
             RETURNING student_id`,
            [targetStudentId, targetGroup.rows[0].id, targetSchoolYearId]
          );
          if (linkResult.rows.length > 0) groupLinksCreated += 1;
        }
      }

      await db.query('COMMIT');

      res.json({
        scopeId,
        sourceSchoolYearId: schoolYearId,
        targetSchoolYearId,
        counts: {
          sourceStudents: sourceStudentsResult.rows.length,
          createdStudents,
          reusedStudents,
          promotedStudents,
          heldBackStudents,
          groupLinksCreated,
        },
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.post('/scopes/:scopeId/execute/subjects', async (req: AuthRequest, res, next) => {
  const db = getDB();
  const schoolYearId = req.schoolYearId;
  const { scopeId } = req.params;
  const { targetSchoolYearId } = req.body || {};

  if (!targetSchoolYearId) {
    return res.status(400).json({ error: 'targetSchoolYearId is required' });
  }

  try {
    const scopeResult = await db.query(
      `SELECT id, name, min_grade, max_grade, status
       FROM rollover_scopes
       WHERE id = $1 AND user_id = $2 AND school_year_id = $3`,
      [scopeId, req.userId, schoolYearId]
    );

    if (scopeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rollover scope not found' });
    }

    const scope = scopeResult.rows[0];
    if (scope.status !== 'locked') {
      return res.status(409).json({ error: 'Scope must be locked before executing rollover steps' });
    }

    if (String(targetSchoolYearId) === String(schoolYearId)) {
      return res.status(400).json({ error: 'Target school year must be different from source school year' });
    }

    const hasLicense = await ensureLicensedYear(db, req.userId!, targetSchoolYearId);
    if (!hasLicense) {
      return res.status(403).json({ error: 'You are not licensed for the target school year' });
    }

    const scopedStudentsResult = await db.query(
      `SELECT s.id, s.name, s.birthday
       FROM students s
       WHERE s.user_id = $1
         AND s.school_year_id = $2
         AND ${gradeToNumberExpr} BETWEEN $3 AND $4`,
      [req.userId, schoolYearId, scope.min_grade, scope.max_grade]
    );

    await db.query('BEGIN');
    try {
      let subjectsCreated = 0;
      let subjectsReused = 0;
      let lessonsCreated = 0;
      let weightsUpserted = 0;
      let markersCreated = 0;
      let subjectGroupLinksCreated = 0;
      let enrollmentsCreated = 0;

      const sourceToTargetStudentMap = new Map<string, string>();
      for (const s of scopedStudentsResult.rows) {
        const targetStudent = await db.query(
          `SELECT id
           FROM students
           WHERE user_id = $1
             AND school_year_id = $2
             AND name = $3
             AND COALESCE(birthday::text, '') = COALESCE($4::text, '')
           LIMIT 1`,
          [req.userId, targetSchoolYearId, s.name, s.birthday || null]
        );
        if (targetStudent.rows.length > 0) {
          sourceToTargetStudentMap.set(String(s.id), targetStudent.rows[0].id);
        }
      }

      const scopedStudentIds = scopedStudentsResult.rows.map((s: any) => s.id);
      if (scopedStudentIds.length === 0) {
        await db.query('COMMIT');
        return res.json({
          scopeId,
          sourceSchoolYearId: schoolYearId,
          targetSchoolYearId,
          counts: {
            subjectsCreated,
            subjectsReused,
            lessonsCreated,
            weightsUpserted,
            markersCreated,
            subjectGroupLinksCreated,
            enrollmentsCreated,
          },
        });
      }

      const sourceSubjectsResult = await db.query(
        `SELECT DISTINCT sub.id, sub.name, sub.report_card_name, sub.description
         FROM student_subjects ss
         JOIN subjects sub ON sub.id = ss.subject_id
         WHERE ss.school_year_id = $2
           AND sub.school_year_id = $2
           AND sub.user_id = $1
           AND ss.student_id = ANY($3::uuid[])
         ORDER BY sub.name`,
        [req.userId, schoolYearId, scopedStudentIds]
      );

      const sourceToTargetSubjectMap = new Map<string, string>();

      for (const sourceSubject of sourceSubjectsResult.rows) {
        let targetSubject = await db.query(
          `SELECT id
           FROM subjects
           WHERE user_id = $1
             AND school_year_id = $2
             AND name = $3
           LIMIT 1`,
          [req.userId, targetSchoolYearId, sourceSubject.name]
        );

        let targetSubjectId: string;
        if (targetSubject.rows.length > 0) {
          targetSubjectId = targetSubject.rows[0].id;
          subjectsReused += 1;
        } else {
          const inserted = await db.query(
            `INSERT INTO subjects (user_id, school_year_id, name, report_card_name, description)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [
              req.userId,
              targetSchoolYearId,
              sourceSubject.name,
              sourceSubject.report_card_name || sourceSubject.name,
              sourceSubject.description || null,
            ]
          );
          targetSubjectId = inserted.rows[0].id;
          subjectsCreated += 1;
        }

        sourceToTargetSubjectMap.set(String(sourceSubject.id), targetSubjectId);

        const sourceLessons = await db.query(
          `SELECT name, category_id, points, order_index, date
           FROM lessons
           WHERE subject_id = $1 AND school_year_id = $2
           ORDER BY order_index`,
          [sourceSubject.id, schoolYearId]
        );

        for (const lesson of sourceLessons.rows) {
          const existingLesson = await db.query(
            `SELECT id
             FROM lessons
             WHERE subject_id = $1
               AND school_year_id = $2
               AND name = $3
               AND order_index = $4
             LIMIT 1`,
            [targetSubjectId, targetSchoolYearId, lesson.name, lesson.order_index]
          );

          if (existingLesson.rows.length === 0) {
            await db.query(
              `INSERT INTO lessons (subject_id, school_year_id, name, category_id, points, order_index, date)
               VALUES ($1, $2, $3, $4, $5, $6, $7::date)`,
              [
                targetSubjectId,
                targetSchoolYearId,
                lesson.name,
                lesson.category_id,
                lesson.points,
                lesson.order_index,
                lesson.date || null,
              ]
            );
            lessonsCreated += 1;
          }
        }

        const sourceWeights = await db.query(
          `SELECT category_id, weight
           FROM subject_weights
           WHERE subject_id = $1 AND school_year_id = $2`,
          [sourceSubject.id, schoolYearId]
        );

        for (const weight of sourceWeights.rows) {
          await db.query(
            `INSERT INTO subject_weights (subject_id, category_id, weight, school_year_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (subject_id, category_id)
             DO UPDATE SET
               weight = EXCLUDED.weight,
               school_year_id = EXCLUDED.school_year_id`,
            [targetSubjectId, weight.category_id, weight.weight, targetSchoolYearId]
          );
          weightsUpserted += 1;
        }

        const sourceMarkers = await db.query(
          `SELECT name, order_index
           FROM grading_period_markers
           WHERE subject_id = $1 AND school_year_id = $2
           ORDER BY order_index`,
          [sourceSubject.id, schoolYearId]
        );

        for (const marker of sourceMarkers.rows) {
          const existingMarker = await db.query(
            `SELECT id
             FROM grading_period_markers
             WHERE subject_id = $1
               AND school_year_id = $2
               AND name = $3
               AND order_index = $4
             LIMIT 1`,
            [targetSubjectId, targetSchoolYearId, marker.name, marker.order_index]
          );
          if (existingMarker.rows.length === 0) {
            await db.query(
              `INSERT INTO grading_period_markers (subject_id, school_year_id, name, order_index)
               VALUES ($1, $2, $3, $4)`,
              [targetSubjectId, targetSchoolYearId, marker.name, marker.order_index]
            );
            markersCreated += 1;
          }
        }

        const sourceSubjectGroups = await db.query(
          `SELECT sg.name
           FROM subject_groups sgrp
           JOIN student_groups sg ON sg.id = sgrp.student_group_id
           WHERE sgrp.subject_id = $1 AND sgrp.school_year_id = $2`,
          [sourceSubject.id, schoolYearId]
        );

        for (const srcGroup of sourceSubjectGroups.rows) {
          let targetGroup = await db.query(
            `SELECT id FROM student_groups
             WHERE user_id = $1 AND school_year_id = $2 AND name = $3
             LIMIT 1`,
            [req.userId, targetSchoolYearId, srcGroup.name]
          );
          if (targetGroup.rows.length === 0) {
            targetGroup = await db.query(
              `INSERT INTO student_groups (user_id, school_year_id, name)
               VALUES ($1, $2, $3)
               RETURNING id`,
              [req.userId, targetSchoolYearId, srcGroup.name]
            );
          }

          const linkResult = await db.query(
            `INSERT INTO subject_groups (subject_id, student_group_id, school_year_id)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING
             RETURNING subject_id`,
            [targetSubjectId, targetGroup.rows[0].id, targetSchoolYearId]
          );
          if (linkResult.rows.length > 0) subjectGroupLinksCreated += 1;
        }
      }

      const sourceEnrollments = await db.query(
        `SELECT ss.student_id, ss.subject_id
         FROM student_subjects ss
         WHERE ss.school_year_id = $2
           AND ss.student_id = ANY($3::uuid[])`,
        [req.userId, schoolYearId, scopedStudentIds]
      );

      for (const enrollment of sourceEnrollments.rows) {
        const targetStudentId = sourceToTargetStudentMap.get(String(enrollment.student_id));
        const targetSubjectId = sourceToTargetSubjectMap.get(String(enrollment.subject_id));
        if (!targetStudentId || !targetSubjectId) continue;

        const insertResult = await db.query(
          `INSERT INTO student_subjects (student_id, subject_id, school_year_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING
           RETURNING student_id`,
          [targetStudentId, targetSubjectId, targetSchoolYearId]
        );
        if (insertResult.rows.length > 0) enrollmentsCreated += 1;
      }

      await db.query('COMMIT');

      res.json({
        scopeId,
        sourceSchoolYearId: schoolYearId,
        targetSchoolYearId,
        counts: {
          scopedStudents: scopedStudentsResult.rows.length,
          subjectsCreated,
          subjectsReused,
          lessonsCreated,
          weightsUpserted,
          markersCreated,
          subjectGroupLinksCreated,
          enrollmentsCreated,
        },
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.post('/finalize', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    const sourceSchoolYearId = req.schoolYearId;
    const { targetSchoolYearId, firstDayOfSchool } = req.body || {};

    if (!targetSchoolYearId) {
      return res.status(400).json({ error: 'targetSchoolYearId is required' });
    }

    if (String(targetSchoolYearId) === String(sourceSchoolYearId)) {
      return res.status(400).json({ error: 'Target school year must be different from source school year' });
    }

    const hasLicense = await ensureLicensedYear(db, req.userId!, targetSchoolYearId);
    if (!hasLicense) {
      return res.status(403).json({ error: 'You are not licensed for the target school year' });
    }

    const scopesResult = await db.query(
      `SELECT id, name, status
       FROM rollover_scopes
       WHERE user_id = $1 AND school_year_id = $2
       ORDER BY min_grade ASC, name ASC`,
      [req.userId, sourceSchoolYearId]
    );

    const unlocked = scopesResult.rows.filter((s: any) => s.status !== 'locked');
    if (unlocked.length > 0) {
      return res.status(409).json({
        error: 'All rollover scopes must be locked before finalizing',
        unlockedScopes: unlocked.map((s: any) => ({ id: s.id, name: s.name, status: s.status })),
      });
    }

    await db.query(
      `UPDATE users
       SET active_school_year_id = $2,
           first_day_of_school = COALESCE($3::date, first_day_of_school),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [req.userId, targetSchoolYearId, firstDayOfSchool || null]
    );

    res.json({
      success: true,
      sourceSchoolYearId,
      targetSchoolYearId,
      scopesLocked: scopesResult.rows.length,
      firstDayOfSchool: firstDayOfSchool || null,
      message: 'Rollover finalized and active school year switched',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
