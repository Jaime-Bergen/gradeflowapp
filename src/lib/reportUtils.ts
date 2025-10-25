// Utility functions for report generation
import { Student, Subject, Grade, ReportCard, SubjectGrade } from '@/lib/types'

export const getLetterGrade = (percentage: number): string => {
  // Add safety check for invalid numbers
  if (typeof percentage !== 'number' || isNaN(percentage)) {
    return 'N/A'
  }
  
  if (percentage >= 97) return 'A+'
  if (percentage >= 93) return 'A'
  if (percentage >= 90) return 'A-'
  if (percentage >= 87) return 'B+'
  if (percentage >= 83) return 'B'
  if (percentage >= 80) return 'B-'
  if (percentage >= 77) return 'C+'
  if (percentage >= 73) return 'C'
  if (percentage >= 70) return 'C-'
  if (percentage >= 67) return 'D+'
  if (percentage >= 63) return 'D'
  if (percentage >= 60) return 'D-'
  return 'F'
}

export const calculateSubjectGrade = (
  studentId: string, 
  subjectId: string, 
  subjects: Subject[], 
  grades: Grade[]
): SubjectGrade | null => {
  // Safety check for subjects array
  if (!subjects || !Array.isArray(subjects)) {
    console.warn('calculateSubjectGrade: subjects is not a valid array', subjects)
    return null
  }

  // Safety check for grades array
  if (!grades || !Array.isArray(grades)) {
    console.warn('calculateSubjectGrade: grades is not a valid array', grades)
    return null
  }

  const subject = subjects.find(s => s.id === subjectId)
  if (!subject || !subject.lessons || !Array.isArray(subject.lessons)) {
    console.warn('calculateSubjectGrade: subject not found or has invalid lessons array', { subjectId, subject })
    return null
  }

  const studentGrades = grades.filter(g => g.studentId === studentId && g.subjectId === subjectId && !g.skipped)
  console.log('calculateSubjectGrade: Student grades for subject', { 
    studentId, 
    subjectId, 
    totalGrades: grades.length,
    studentGrades: studentGrades.length,
    sampleGrades: studentGrades.slice(0, 3)
  })
  
  if (studentGrades.length === 0) return null

  const gradesByType = studentGrades.reduce((acc, grade) => {
    const lesson = subject.lessons.find(l => l.id === grade.lessonId)
    if (lesson) {
      if (!acc[lesson.type]) acc[lesson.type] = []
      // Convert percentage to number, handling both string and number inputs
      let percentage = 0
      if (typeof grade.percentage === 'number' && !isNaN(grade.percentage)) {
        percentage = grade.percentage
      } else if (typeof grade.percentage === 'string') {
        const parsed = parseFloat(grade.percentage)
        percentage = !isNaN(parsed) ? parsed : 0
      }
      
      console.log('calculateSubjectGrade: Processing grade', {
        gradeId: grade.id,
        originalPercentage: grade.percentage,
        convertedPercentage: percentage,
        lessonType: lesson.type
      })
      
      // Skip grades with percentage < 1 (these represent skipped/not attempted grades)
      if (percentage >= 1) {
        acc[lesson.type].push(percentage)
      }
    } else {
      console.warn('calculateSubjectGrade: Lesson not found for grade', { 
        gradeId: grade.id, 
        lessonId: grade.lessonId, 
        subjectLessons: subject.lessons.map(l => ({ id: l.id, name: l.name, type: l.type }))
      })
    }
    return acc
  }, {} as Record<string, number[]>)

  console.log('calculateSubjectGrade: Grades by type', { subjectId, gradesByType })

  let weightedTotal = 0
  let totalWeight = 0

  // Use the new dynamic weights structure from the subject
  const subjectWeights = subject.weights || {}

  // Create a mapping from lesson type to weight
  // TODO: This should be updated to use the same dynamic system as the backend reports
  // For now, we distribute weights in order among the lesson types that have grades
  
  const weightMapping: Record<string, number> = {}
  
  const subjectWeightEntries = Object.entries(subjectWeights)
  console.log('calculateSubjectGrade: Available weights', { subjectWeights, subjectWeightEntries })
  
  // For each lesson type, try to find a matching weight by name
  // This is a simplified approach - ideally we should get the actual category mappings
  // from the backend like the reports route does
  Object.keys(gradesByType).forEach(lessonType => {
    // For now, just distribute weights evenly among all lesson types
    // This is much simpler and more predictable than guessing
    const weightValues = Object.values(subjectWeights).filter(w => w > 0)
    const lessonTypes = Object.keys(gradesByType)
    const typeIndex = lessonTypes.indexOf(lessonType)
    
    if (typeIndex !== -1 && typeIndex < weightValues.length) {
      weightMapping[lessonType] = weightValues[typeIndex]
    } else if (weightValues.length > 0) {
      // If we have more lesson types than weights, distribute the remaining weight evenly
      const avgWeight = weightValues.reduce((sum, w) => sum + w, 0) / lessonTypes.length
      weightMapping[lessonType] = avgWeight
    } else {
      weightMapping[lessonType] = 1 / lessonTypes.length // Equal weight if no weights defined
    }
  })

  console.log('calculateSubjectGrade: Using weights', { 
    subjectWeights, 
    weightMapping,
    lessonTypes: Object.keys(gradesByType)
  })

  Object.keys(gradesByType).forEach(lessonType => {
    const typeGrades = gradesByType[lessonType]
    if (typeGrades && typeGrades.length > 0) {
      const typeAverage = typeGrades.reduce((sum, grade) => sum + grade, 0) / typeGrades.length
      
      // Get the weight for this lesson type
      const weight = weightMapping[lessonType] || 0
      
      console.log('calculateSubjectGrade: Processing grade type', { 
        lessonType, 
        weight, 
        typeGrades, 
        typeAverage,
        isValidNumber: typeof typeAverage === 'number' && !isNaN(typeAverage)
      })
      
      // Ensure typeAverage is a valid number and weight exists
      if (typeof typeAverage === 'number' && !isNaN(typeAverage) && weight > 0) {
        weightedTotal += typeAverage * weight // weight is already in decimal form (0-1)
        totalWeight += weight
      }
    } else {
      console.log('calculateSubjectGrade: No grades for type', { lessonType })
    }
  })

  const average = totalWeight > 0 ? weightedTotal / totalWeight : 0
  // Ensure final average is a valid number
  const finalAverage = typeof average === 'number' && !isNaN(average) ? average : 0

  console.log('calculateSubjectGrade: Final calculation', { 
    weightedTotal, 
    totalWeight, 
    average, 
    finalAverage,
    subjectId,
    studentId
  })

  return {
    subjectId,
    subjectName: subject.report_card_name && subject.report_card_name.trim() !== '' 
      ? subject.report_card_name 
      : subject.name, // Use main subject name if report_card_name is empty
    grades: studentGrades,
    average: finalAverage,
    letterGrade: getLetterGrade(finalAverage)
  }
}

export const generateReportCard = (
  studentId: string,
  reportPeriod: string,
  comments: Record<string, string>,
  students: Student[],
  subjects: Subject[],
  grades: Grade[]
): ReportCard | null => {
  // Safety checks for all required arrays
  if (!students || !Array.isArray(students)) {
    console.warn('generateReportCard: students is not a valid array', students)
    return null
  }
  if (!subjects || !Array.isArray(subjects)) {
    console.warn('generateReportCard: subjects is not a valid array', subjects)
    return null
  }
  if (!grades || !Array.isArray(grades)) {
    console.warn('generateReportCard: grades is not a valid array', grades)
    return null
  }

  const student = students.find(s => s.id === studentId)
  if (!student) return null

  // Calculate subjects for this student from grades data
  const studentSubjectIds = [...new Set(grades
    .filter(g => g.studentId === studentId && g.subjectId)
    .map(g => g.subjectId)
  )].filter((id): id is string => Boolean(id))

  const studentSubjects = studentSubjectIds
    .map(subjectId => calculateSubjectGrade(studentId, subjectId, subjects, grades))
    .filter(Boolean) as SubjectGrade[]

  if (studentSubjects.length === 0) return null

  // Calculate overall GPA with safety checks
  const validAverages = studentSubjects
    .map(s => s.average)
    .filter(avg => typeof avg === 'number' && !isNaN(avg))
  
  const overallGPA = validAverages.length > 0 
    ? validAverages.reduce((sum, avg) => sum + avg, 0) / validAverages.length
    : 0

  return {
    studentId,
    period: reportPeriod,
    subjects: studentSubjects,
    overallGPA: typeof overallGPA === 'number' && !isNaN(overallGPA) ? overallGPA : 0,
    comments: comments[studentId]
  }
}

export interface CalculationBreakdown {
  subjectId: string
  subjectName: string
  categories: {
    categoryName: string
    grades: number[]
    average: number
    weight: number
    weightedValue: number
  }[]
  finalAverage: number
  letterGrade: string
}

export const getSubjectCalculationBreakdown = (
  studentId: string,
  subjectId: string,
  subjects: Subject[],
  grades: Grade[]
): CalculationBreakdown | null => {
  const subject = subjects.find(s => s.id === subjectId)
  if (!subject) return null

  const studentGrades = grades.filter(g => g.studentId === studentId)
  if (studentGrades.length === 0) return null

  const gradesByType = studentGrades.reduce((acc, grade) => {
    const lesson = subject.lessons.find(l => l.id === grade.lessonId)
    if (lesson) {
      if (!acc[lesson.type]) acc[lesson.type] = []
      let percentage = 0
      if (typeof grade.percentage === 'number' && !isNaN(grade.percentage)) {
        percentage = grade.percentage
      } else if (typeof grade.percentage === 'string') {
        const parsed = parseFloat(grade.percentage)
        percentage = !isNaN(parsed) ? parsed : 0
      }
      // Skip grades with percentage < 1 (these represent skipped/not attempted grades)
      if (percentage >= 1) {
        acc[lesson.type].push(percentage)
      }
    }
    return acc
  }, {} as Record<string, number[]>)

  const subjectWeights = subject.weights || {}
  const weightMapping: Record<string, number> = {}
  
  // Create weight mapping (same logic as calculateSubjectGrade)
  Object.keys(gradesByType).forEach(lessonType => {
    const weightValues = Object.values(subjectWeights).filter(w => w > 0)
    const lessonTypes = Object.keys(gradesByType)
    const typeIndex = lessonTypes.indexOf(lessonType)
    
    if (typeIndex !== -1 && typeIndex < weightValues.length) {
      weightMapping[lessonType] = weightValues[typeIndex]
    } else if (weightValues.length > 0) {
      const avgWeight = weightValues.reduce((sum, w) => sum + w, 0) / lessonTypes.length
      weightMapping[lessonType] = avgWeight
    } else {
      weightMapping[lessonType] = 1 / lessonTypes.length
    }
  })

  const categories = Object.keys(gradesByType).map(lessonType => {
    const typeGrades = gradesByType[lessonType]
    const typeAverage = typeGrades.reduce((sum, grade) => sum + grade, 0) / typeGrades.length
    const weight = weightMapping[lessonType] || 0
    const weightedValue = typeAverage * weight

    return {
      categoryName: lessonType,
      grades: typeGrades,
      average: typeAverage,
      weight: weight,
      weightedValue: weightedValue
    }
  })

  const totalWeight = categories.reduce((sum, cat) => sum + cat.weight, 0)
  const weightedTotal = categories.reduce((sum, cat) => sum + cat.weightedValue, 0)
  const finalAverage = totalWeight > 0 ? weightedTotal / totalWeight : 0

  return {
    subjectId,
    subjectName: subject.report_card_name && subject.report_card_name.trim() !== '' 
      ? subject.report_card_name 
      : subject.name,
    categories,
    finalAverage,
    letterGrade: getLetterGrade(finalAverage)
  }
}

export const formatReportPeriod = (period: string): string => {
  // Handle six weeks periods (sw1, sw2, etc.) -> "1 of 6", "2 of 6", etc.
  if (period.startsWith('sw')) {
    const periodNumber = period.replace('sw', '')
    return `${periodNumber} of 6`
  }
  
  // Handle trimester periods (t1, t2, t3) -> "1 of 3", "2 of 3", "3 of 3"
  if (period.startsWith('t')) {
    const periodNumber = period.replace('t', '')
    return `${periodNumber} of 3`
  }
  
  // Handle quarter periods (q1, q2, q3, q4) -> "1 of 4", "2 of 4", etc.
  if (period.startsWith('q')) {
    const periodNumber = period.replace('q', '')
    return `${periodNumber} of 4`
  }
  
  // Fallback for other periods
  const periods: Record<string, string> = {
    'current': 'Current Semester'
  }
  return periods[period] || period
}