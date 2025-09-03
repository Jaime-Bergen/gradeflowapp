import express from 'express';
import { getDB } from '../database/connection';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get report data for a student
router.get('/student/:studentId', async (req: AuthRequest, res, next) => {
  try {
    const { studentId } = req.params;
    const db = getDB();
    
    // Verify student belongs to user
    const studentCheck = await db.query(
      'SELECT * FROM students WHERE id = $1 AND user_id = $2',
      [studentId, req.userId]
    );
    
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    const student = studentCheck.rows[0];
    
    // Get all subjects and grades for this student
    const subjectsResult = await db.query(
      `SELECT DISTINCT s.id, s.name, s.lesson_weight, s.review_weight, s.test_weight, s.quiz_weight
       FROM subjects s
       JOIN lessons l ON s.id = l.subject_id
       LEFT JOIN grades g ON l.id = g.lesson_id AND g.student_id = $1
       WHERE s.user_id = $2
       ORDER BY s.name`,
      [studentId, req.userId]
    );
    
    const reportData = {
      student,
      subjects: []
    };
    
    // For each subject, get detailed grade information
    for (const subject of subjectsResult.rows) {
      const gradesResult = await db.query(
        `SELECT 
          l.id as lesson_id, l.name as lesson_name, l.type as lesson_type, l.points as lesson_points,
          g.percentage, g.errors, g.points as grade_points
         FROM lessons l
         LEFT JOIN grades g ON l.id = g.lesson_id AND g.student_id = $1
         WHERE l.subject_id = $2
         ORDER BY l.order_index`,
        [studentId, subject.id]
      );
      
      // Calculate weighted average
      let totalWeightedPoints = 0;
      let totalWeight = 0;
      const gradesByType = { lesson: [], review: [], test: [], quiz: [] };
      
      gradesResult.rows.forEach(grade => {
        if (grade.percentage !== null) {
          gradesByType[grade.lesson_type].push(grade.percentage);
        }
      });
      
      // Calculate averages by type and apply weights
      const weights = {
        lesson: subject.lesson_weight,
        review: subject.review_weight,
        test: subject.test_weight,
        quiz: subject.quiz_weight
      };
      
      let weightedAverage = null;
      const typeAverages = {};
      
      Object.keys(gradesByType).forEach(type => {
        if (gradesByType[type].length > 0) {
          const avg = gradesByType[type].reduce((sum, grade) => sum + grade, 0) / gradesByType[type].length;
          typeAverages[type] = Math.round(avg * 10) / 10;
          totalWeightedPoints += avg * weights[type];
          totalWeight += weights[type];
        }
      });
      
      if (totalWeight > 0) {
        weightedAverage = Math.round((totalWeightedPoints / totalWeight) * 10) / 10;
      }
      
      reportData.subjects.push({
        ...subject,
        grades: gradesResult.rows,
        typeAverages,
        weightedAverage,
        totalGrades: gradesResult.rows.filter(g => g.percentage !== null).length,
        totalLessons: gradesResult.rows.length
      });
    }
    
    res.json(reportData);
  } catch (error) {
    next(error);
  }
});

// Get report data for all students in a group/class
router.get('/group/:groupId', async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.params;
    const db = getDB();
    
    // Verify group belongs to user
    const groupCheck = await db.query(
      'SELECT * FROM student_groups WHERE id = $1 AND user_id = $2',
      [groupId, req.userId]
    );
    
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Student group not found' });
    }
    
    const group = groupCheck.rows[0];
    
    // Get all students in this group
    const studentsResult = await db.query(
      'SELECT * FROM students WHERE student_group_id = $1 AND user_id = $2 ORDER BY name',
      [groupId, req.userId]
    );
    
    // Get all subjects for this group
    const subjectsResult = await db.query(
      'SELECT * FROM subjects WHERE student_group_id = $1 AND user_id = $2 ORDER BY name',
      [groupId, req.userId]
    );
    
    const reportData = {
      group,
      students: [],
      subjects: subjectsResult.rows
    };
    
    // For each student, calculate their overall performance
    for (const student of studentsResult.rows) {
      const studentGrades = [];
      let totalWeightedScore = 0;
      let totalSubjects = 0;
      
      for (const subject of subjectsResult.rows) {
        // Get grades for this student in this subject
        const gradesResult = await db.query(
          `SELECT g.percentage, l.type
           FROM grades g
           JOIN lessons l ON g.lesson_id = l.id
           WHERE g.student_id = $1 AND l.subject_id = $2`,
          [student.id, subject.id]
        );
        
        if (gradesResult.rows.length > 0) {
          // Calculate weighted average for this subject
          const gradesByType: { [key: string]: number[] } = { lesson: [], review: [], test: [], quiz: [] };
          
          gradesResult.rows.forEach((grade: any) => {
            gradesByType[grade.type].push(grade.percentage);
          });
          
          const weights: { [key: string]: number } = {
            lesson: subject.lesson_weight,
            review: subject.review_weight,
            test: subject.test_weight,
            quiz: subject.quiz_weight
          };
          
          let subjectWeightedPoints = 0;
          let subjectWeight = 0;
          
          Object.keys(gradesByType).forEach((type: string) => {
            if (gradesByType[type].length > 0) {
              const avg = gradesByType[type].reduce((sum: number, grade: number) => sum + grade, 0) / gradesByType[type].length;
              subjectWeightedPoints += avg * weights[type];
              subjectWeight += weights[type];
            }
          });
          
          if (subjectWeight > 0) {
            const subjectAverage = subjectWeightedPoints / subjectWeight;
            studentGrades.push({
              subjectId: subject.id,
              subjectName: subject.name,
              average: Math.round(subjectAverage * 10) / 10,
              gradeCount: gradesResult.rows.length
            });
            totalWeightedScore += subjectAverage;
            totalSubjects++;
          }
        }
      }
      
      const overallAverage = totalSubjects > 0 ? Math.round((totalWeightedScore / totalSubjects) * 10) / 10 : null;
      
      reportData.students.push({
        ...student,
        subjectGrades: studentGrades,
        overallAverage,
        totalSubjects
      });
    }
    
    res.json(reportData);
  } catch (error) {
    next(error);
  }
});

// Get dashboard summary statistics
router.get('/dashboard', async (req: AuthRequest, res, next) => {
  try {
    const db = getDB();
    
    // Get overall statistics
    const overallStats = await db.query(
      `SELECT 
        COUNT(DISTINCT s.id) as total_students,
        COUNT(DISTINCT sg.id) as total_groups,
        COUNT(DISTINCT sub.id) as total_subjects,
        COUNT(DISTINCT l.id) as total_lessons,
        COUNT(g.id) as total_grades
       FROM students s
       LEFT JOIN student_groups sg ON s.student_group_id = sg.id
       LEFT JOIN subjects sub ON sub.user_id = s.user_id
       LEFT JOIN lessons l ON l.subject_id = sub.id
       LEFT JOIN grades g ON g.student_id = s.id AND g.lesson_id = l.id
       WHERE s.user_id = $1`,
      [req.userId]
    );
    
    // Get recent activity (last 10 grades entered)
    const recentActivity = await db.query(
      `SELECT 
        g.percentage, g.updated_at,
        s.name as student_name,
        l.name as lesson_name,
        sub.name as subject_name
       FROM grades g
       JOIN students s ON g.student_id = s.id
       JOIN lessons l ON g.lesson_id = l.id
       JOIN subjects sub ON l.subject_id = sub.id
       WHERE s.user_id = $1
       ORDER BY g.updated_at DESC
       LIMIT 10`,
      [req.userId]
    );
    
    // Get subject performance summary
    const subjectPerformance = await db.query(
      `SELECT 
        sub.name as subject_name,
        COUNT(DISTINCT s.id) as student_count,
        COUNT(g.id) as grade_count,
        AVG(g.percentage) as average_percentage
       FROM subjects sub
       LEFT JOIN lessons l ON l.subject_id = sub.id
       LEFT JOIN grades g ON g.lesson_id = l.id
       LEFT JOIN students s ON g.student_id = s.id
       WHERE sub.user_id = $1
       GROUP BY sub.id, sub.name
       ORDER BY sub.name`,
      [req.userId]
    );
    
    // Get grade distribution
    const gradeDistribution = await db.query(
      `SELECT 
        CASE 
          WHEN percentage >= 90 THEN 'A (90-100%)'
          WHEN percentage >= 80 THEN 'B (80-89%)'
          WHEN percentage >= 70 THEN 'C (70-79%)'
          WHEN percentage >= 60 THEN 'D (60-69%)'
          ELSE 'F (Below 60%)'
        END as grade_range,
        COUNT(*) as count
       FROM grades g
       JOIN students s ON g.student_id = s.id
       WHERE s.user_id = $1 AND g.percentage IS NOT NULL
       GROUP BY 
         CASE 
           WHEN percentage >= 90 THEN 'A (90-100%)'
           WHEN percentage >= 80 THEN 'B (80-89%)'
           WHEN percentage >= 70 THEN 'C (70-79%)'
           WHEN percentage >= 60 THEN 'D (60-69%)'
           ELSE 'F (Below 60%)'
         END
       ORDER BY MIN(percentage) DESC`,
      [req.userId]
    );
    
    res.json({
      overview: overallStats.rows[0],
      recentActivity: recentActivity.rows,
      subjectPerformance: subjectPerformance.rows,
      gradeDistribution: gradeDistribution.rows
    });
  } catch (error) {
    next(error);
  }
});

export default router;