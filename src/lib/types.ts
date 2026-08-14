export interface User {
  id: string
  email: string
  name: string
  created_at: string
  email_verified: boolean
  school_name?: string
  first_day_of_school?: string
  grading_periods?: number
  grading_mode?: 'dates' | 'markers'
  auto_enroll_subjects?: boolean
  active_school_year_id?: string | null
  active_school_year_label?: string | null
  active_school_year_start_date?: string | null
  active_school_year_end_date?: string | null
  active_license_tier?: 'full' | 'single' | 'trial' | null
  licensed_school_years?: LicensedSchoolYear[]
}

export interface SchoolYear {
  id: string
  label: string
  start_date: string
  end_date: string
  license_tier?: 'full' | 'single' | 'trial'
  created_at?: string
  updated_at?: string
}

export interface LicensedSchoolYear extends SchoolYear {
  license_id: string
  grant_source?: string
  license_tier?: 'full' | 'single' | 'trial'
  licensed_at?: string
}

export interface UserSchoolYearLicense {
  id: string
  user_id: string
  school_year_id: string
  grant_source: string
  license_tier?: 'full' | 'single' | 'trial'
  notes?: string | null
  created_at: string
  updated_at: string
  label: string
  start_date: string
  end_date: string
  is_active: boolean
}

export interface RolloverScope {
  id: string
  user_id: string
  school_year_id: string
  name: string
  min_grade: number
  max_grade: number
  teacher_id?: string | null
  teacher_name?: string | null
  teacher_email?: string | null
  status: 'draft' | 'locked'
  lock_notes?: string | null
  locked_at?: string | null
  locked_by_teacher_id?: string | null
  locked_by_teacher_name?: string | null
  total_students?: number
  at_risk_students?: number
  created_at: string
  updated_at: string
}

export interface RolloverScopePreviewStudent {
  id: string
  name: string
  grade?: string | null
  average_percentage?: number | null
  suggested_hold_back: boolean
}

export interface RolloverScopePreview {
  scope: {
    id: string
    name: string
    min_grade: number
    max_grade: number
    status: 'draft' | 'locked'
  }
  riskThreshold: number
  students: RolloverScopePreviewStudent[]
}

export interface Student {
  id: string
  name: string
  birthday?: string
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
  gradingPeriodMarkers?: GradingPeriodMarker[]
  // Dynamic weights structure using category IDs
  weights: { [categoryId: string]: number }
}

export interface Lesson {
  id: string
  name: string
  subjectId: string
  type: string // Grade category type name (from JOIN)
  type_color?: string // Grade category color (from JOIN)
  categoryId?: string // Foreign key to grade_category_types
  points?: number // For compatibility with backend bulk add
  maxPoints?: number // For compatibility with other endpoints
  orderIndex?: number // Used for ordering lessons in a subject
  date?: string // YYYY-MM-DD
  dueDate?: string
  description?: string
}

export interface GradingPeriodMarker {
  id: string
  name: string
  subjectId: string
  orderIndex: number
}

export interface GradingPeriod {
  id: string
  name: string
  startDate: string
  endDate: string
  orderIndex: number
}

export interface GradeCategoryType {
  id: string
  name: string
  description?: string
  is_default: boolean
  is_active: boolean
  color: string
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
  attendanceSummary?: AttendanceSummary
  periodColumns?: Array<{
    id: string
    label: string
    startDate?: string
    endDate?: string
  }>
  primaryWeightingEnabled?: boolean
  primaryWeightPercent?: number
}

export interface SubjectGrade {
  subjectId: string
  subjectName: string
  grades: Grade[]
  average: number
  letterGrade: string
  periodValues?: Array<number | null>
  displayMode?: 'percentage' | 'letter' | 'gpa'
  tier?: 'primary' | 'secondary'
}

export type AttendanceStatus = 'present' | 'absent' | 'tardy' | 'excused'

export interface AttendanceRecord {
  id?: string
  studentId: string
  date: string
  status: AttendanceStatus
  notes?: string | null
  student_name?: string
  created_at?: string
  updated_at?: string
}

export interface AttendanceSummary {
  startDate?: string
  endDate?: string
  present: number
  absent: number
  tardy: number
  excused: number
  total: number
}