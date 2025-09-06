export interface User {
  id: string
  email: string
  name: string
  created_at: string
  email_verified: boolean
  school_name?: string
  first_day_of_school?: string
  grading_periods?: number
}

export interface Student {
  id: string
  name: string
  grade?: string
  studentGroupId?: string
  group_name?: string
  subjects: string[]
}

export interface Subject {
  id: string
  name: string
  report_card_name?: string
  description?: string
  grade?: string
  studentGroupId?: string
  group_name?: string
  lessons: Lesson[]
  // Dynamic weights structure using category IDs
  weights: { [categoryId: string]: number }
}

export interface Lesson {
  id: string
  name: string
  subjectId: string
  type: string // Allow any custom grade category type
  categoryId?: string // Foreign key to grade_category_types
  points?: number // For compatibility with backend bulk add
  maxPoints?: number // For compatibility with other endpoints
  orderIndex?: number // Used for ordering lessons in a subject
  dueDate?: string
  description?: string
}

export interface GradeCategoryType {
  id: string
  name: string
  description?: string
  is_default: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Grade {
  id: string
  studentId: string
  lessonId: string
  subjectId?: string // Derived from lesson, not stored in DB
  points: number // Earned points (calculated from maxPoints - errors)
  maxPoints: number // Total possible points (stored as 'points' in DB)
  percentage: number
  errors?: number // Number of errors made
  date: string // Mapped from created_at/updated_at
  notes?: string
  skipped?: boolean // Mark lessons as skipped with "S" input (frontend only)
  created_at?: string
  updated_at?: string
}

export interface ReportCard {
  studentId: string
  period: string
  subjects: SubjectGrade[]
  overallGPA: number
  comments?: string
}

export interface SubjectGrade {
  subjectId: string
  subjectName: string
  grades: Grade[]
  average: number
  letterGrade: string
}