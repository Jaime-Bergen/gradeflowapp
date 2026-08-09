import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { apiClient } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { 
  Users, 
  BookOpen, 
  TrendingUp, 
  Clock,
  AlertTriangle
} from "lucide-react"
import { Student, Grade, AttendanceRecord, AttendanceStatus, GradingPeriod } from '@/lib/types'
import { toast } from 'sonner'

type DashboardSummary = {
  overview?: {
    total_students?: number | string
    total_subjects?: number | string
    total_teachers?: number | string
    total_lessons?: number | string
    total_grades?: number | string
  }
  recentActivity?: Array<{
    percentage?: number | string | null
    updated_at?: string
    student_name?: string
    lesson_name?: string
    subject_name?: string
  }>
}

const attendanceStatusOptions: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'tardy', label: 'Tardy' },
  { value: 'absent', label: 'Absent' },
  { value: 'excused', label: 'Excused' },
]

export default function Dashboard() {
  const [students, setStudents] = useState<Student[]>([])
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [studentGroups, setStudentGroups] = useState<any[]>([])
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>({})
  const [loading, setLoading] = useState(true)
  const [currentGradingPeriod, setCurrentGradingPeriod] = useState(1)
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false)
  const [todayAttendanceMap, setTodayAttendanceMap] = useState<Record<string, AttendanceRecord>>({})
  const [weeklyAttendance, setWeeklyAttendance] = useState<AttendanceRecord[]>([]) // history view
  const [currentWeekAttendance, setCurrentWeekAttendance] = useState<AttendanceRecord[]>([]) // always current week for chips
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [attendanceSaving, setAttendanceSaving] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [historySaving, setHistorySaving] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMenuTarget, setHistoryMenuTarget] = useState<{ studentId: string; date: string } | null>(null)
  const [headerMenuDate, setHeaderMenuDate] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0) // 0 = current week, -1 = previous week, etc.
  const [selectedStudentIndex, setSelectedStudentIndex] = useState(0)
  const [teacherGroupIds, setTeacherGroupIds] = useState<string[]>([])
  const [averageDialogOpen, setAverageDialogOpen] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<Record<string, boolean>>({})
  const [gradingPeriodCount, setGradingPeriodCount] = useState<number>(6)
  const [gradingPeriods, setGradingPeriods] = useState<GradingPeriod[]>([])
  const dialogContentRef = useRef<HTMLDivElement | null>(null)
  const formatLocalISO = (d: Date) => {
    // Local date-only string without timezone shift
    const local = new Date(d)
    local.setHours(0, 0, 0, 0)
    const year = local.getFullYear()
    const month = String(local.getMonth() + 1).padStart(2, '0')
    const day = String(local.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const parseLocalDate = (iso: string) => new Date(`${iso}T00:00:00`)
  const [todayIso, setTodayIso] = useState(() => formatLocalISO(new Date()))
  const isWeekendToday = useMemo(() => {
    const day = new Date().getDay()
    return day === 0 || day === 6
  }, [])
  const refreshToday = useCallback(() => setTodayIso(formatLocalISO(new Date())), [])

  const getDaysUntilBirthday = useCallback((birthdayIso?: string | null) => {
    if (!birthdayIso) return null
    const parts = birthdayIso.split('-')
    if (parts.length < 3) return null

    const month = parseInt(parts[1], 10)
    const day = parseInt(parts[2], 10)
    if (isNaN(month) || isNaN(day)) return null

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const currentYear = today.getFullYear()

    let next = new Date(currentYear, month - 1, day)
    next.setHours(0, 0, 0, 0)
    if (isNaN(next.getTime())) return null

    if (next < today) {
      next = new Date(currentYear + 1, month - 1, day)
      next.setHours(0, 0, 0, 0)
    }

    const diffMs = next.getTime() - today.getTime()
    return Math.round(diffMs / (1000 * 60 * 60 * 24))
  }, [])

  const getNextBirthdayDate = useCallback((birthdayIso?: string | null) => {
    if (!birthdayIso) return null
    const parts = birthdayIso.split('-')
    if (parts.length < 3) return null

    const month = parseInt(parts[1], 10)
    const day = parseInt(parts[2], 10)
    if (isNaN(month) || isNaN(day)) return null

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const currentYear = today.getFullYear()

    let next = new Date(currentYear, month - 1, day)
    next.setHours(0, 0, 0, 0)
    if (isNaN(next.getTime())) return null
    if (next < today) {
      next = new Date(currentYear + 1, month - 1, day)
      next.setHours(0, 0, 0, 0)
    }
    return next
  }, [])
  // Week helper must be defined before useMemo below
  const getWeekRange = useCallback((offset: number) => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const day = now.getDay() // 0 (Sun) - 6 (Sat)
    const diffToMonday = (day + 6) % 7
    const start = new Date(now)
    start.setDate(now.getDate() - diffToMonday + offset * 7)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(0, 0, 0, 0)
    return { startDate: formatLocalISO(start), endDate: formatLocalISO(end) }
  }, [])
  const weekDates = useMemo(() => {
    const { startDate } = getWeekRange(weekOffset)
    const days: string[] = []
    const start = parseLocalDate(startDate)
    const cursor = new Date(start)
    // Only Monday-Friday
    for (let i = 0; i < 5; i++) {
      days.push(formatLocalISO(cursor))
      cursor.setDate(cursor.getDate() + 1)
      cursor.setHours(0, 0, 0, 0)
    }
    return days
  }, [getWeekRange, weekOffset])

  const weekRange = useMemo(() => getWeekRange(weekOffset), [getWeekRange, weekOffset])

  useEffect(() => {
    const safeMax = Math.max(1, gradingPeriodCount || 1)
    setCurrentGradingPeriod(prev => Math.min(Math.max(1, prev), safeMax))
  }, [gradingPeriodCount])

  const nextBirthdayInfo = useMemo<{ name: string; daysUntil: number; date: Date } | null>(() => {
    let closest: { name: string; daysUntil: number; date: Date } | null = null

    students.forEach(student => {
      const days = getDaysUntilBirthday(student.birthday)
      const nextDate = getNextBirthdayDate(student.birthday)
      if (days === null || !nextDate) return
      if (closest === null || days < closest.daysUntil || (days === closest.daysUntil && student.name < closest.name)) {
        closest = { name: student.name, daysUntil: days, date: nextDate }
      }
    })

    return closest
  }, [students, getDaysUntilBirthday, getNextBirthdayDate])

  const currentWeekDates = useMemo(() => {
    const { startDate } = getWeekRange(0)
    const days: string[] = []
    const start = parseLocalDate(startDate)
    const cursor = new Date(start)
    for (let i = 0; i < 5; i++) {
      days.push(formatLocalISO(cursor))
      cursor.setDate(cursor.getDate() + 1)
      cursor.setHours(0, 0, 0, 0)
    }
    return days
  }, [getWeekRange])

  const getPercentageValue = (grade: Grade) => {
    const raw = typeof grade.percentage === 'string' ? parseFloat(grade.percentage) : (grade.percentage || 0)
    return isNaN(raw) ? 0 : raw
  }

  const isCountableGrade = (grade: Grade) => {
    // Skip grades flagged as skipped or with percentage < 1 (represents skipped/not attempted)
    return !grade.skipped && getPercentageValue(grade) >= 1
  }

  const refreshGradingSettings = useCallback(async () => {
    let sortedGradingPeriods: GradingPeriod[] = []
    let user: any = null

    try {
      const periodsRes = await apiClient.getGradingPeriods()
      const periodsData = Array.isArray(periodsRes.data) ? periodsRes.data : []
      sortedGradingPeriods = [...periodsData].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      setGradingPeriods(sortedGradingPeriods)
    } catch (error) {
      console.error('Failed to load grading periods', error)
    }

    try {
      const profileRes = await apiClient.getProfile()
      user = profileRes?.data
    } catch (error) {
      console.error('Failed to load grading period setting', error)
    }

    const periodsFromProfile = user ? Math.min(12, Math.max(1, user.grading_periods ?? 6)) : null
    const periodCountFromPeriods = sortedGradingPeriods.length > 0 ? sortedGradingPeriods.length : null
    const resolvedCount = periodCountFromPeriods ?? periodsFromProfile ?? 6
    setGradingPeriodCount(resolvedCount)

    return { configuredPeriods: resolvedCount }
  }, [])

      const getDateRangeForPeriod = useCallback((periodIndex: number): { start: string; end: string } | null => {
        if (gradingPeriods.length === 0) return null
        const sorted = [...gradingPeriods].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
        const target = sorted[periodIndex - 1]
        if (!target || !target.startDate || !target.endDate) return null
        return { start: target.startDate, end: target.endDate }
      }, [gradingPeriods])

  // Filter grades by lesson date for the selected reporting period.
  const getFilteredGradesForPeriod = (periodIndex: number): Grade[] => {
    if (gradingPeriods.length === 0) return []

    const dateRange = getDateRangeForPeriod(periodIndex)
    if (!dateRange) return []

    return grades.filter(grade => {
      if (!grade.date) return false
      const dateOnly = grade.date.slice(0, 10)
      return dateOnly >= dateRange.start && dateOnly <= dateRange.end
    })
  }

  const currentPeriodGrades = getFilteredGradesForPeriod(currentGradingPeriod)
  const analyticsAvailable = gradingPeriods.length > 0

  const countablePeriodGrades = useMemo(() => currentPeriodGrades.filter(isCountableGrade), [currentPeriodGrades])

  const studentsForDialog = useMemo(() => (filteredStudents.length > 0 ? filteredStudents : students), [filteredStudents, students])

  const teacherGroupNames = useMemo(() => {
    if (studentGroups.length === 0) return []
    if (teacherGroupIds.length === 0) {
      return studentGroups.map(g => g.name).filter(Boolean)
    }
    return studentGroups
      .filter(g => teacherGroupIds.includes(g.id))
      .map(g => g.name)
      .filter(Boolean)
  }, [studentGroups, teacherGroupIds])

  const allGroupNames = useMemo(() => {
    const names = new Set<string>()
    const sourceStudents = teacherGroupIds.length > 0 ? filteredStudents : students

    sourceStudents.forEach(student => {
      if (!student.group_name) return
      student.group_name.split(',').map(g => g.trim()).filter(Boolean).forEach(name => names.add(name))
    })

    if (names.size === 0 && teacherGroupIds.length > 0) {
      teacherGroupNames.forEach(name => names.add(name))
    }

    return Array.from(names).sort()
  }, [filteredStudents, students, teacherGroupIds, teacherGroupNames])

  useEffect(() => {
    if (allGroupNames.length === 0) return
    setSelectedGroups(prev => {
      const next = { ...prev }
      let changed = false
      allGroupNames.forEach(name => {
        if (next[name] === undefined) {
          next[name] = true
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [allGroupNames])

  const filterStudentsByTeacher = useCallback((allStudents: Student[], allGroups: any[]) => {
    const selectedGroupIds = Array.isArray((window as any)?.SELECTED_TEACHER_GROUPS)
      ? (window as any).SELECTED_TEACHER_GROUPS
      : []

    setTeacherGroupIds(selectedGroupIds)

    if (selectedGroupIds.length === 0 || allGroups.length === 0) {
      setFilteredStudents(allStudents)
      return
    }

    const teacherGroupNames = allGroups
      .filter(g => selectedGroupIds.includes(g.id))
      .map(g => g.name)

    const filtered = allStudents.filter(student => {
      if (!student.group_name) return false
      const studentGroupNames = student.group_name.split(',').map(g => g.trim())
      return studentGroupNames.some(name => teacherGroupNames.includes(name))
    })

    setFilteredStudents(filtered)
  }, [])

  const loadTodayAttendance = useCallback(async (dateValue: string) => {
    setAttendanceLoading(true)
    try {
      const res = await apiClient.getAttendance({ date: dateValue })
      const rows = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
      const map: Record<string, AttendanceRecord> = {}
      rows.forEach((row: any) => {
        const studentId = row.studentId || row.student_id
        if (!studentId) return
        const dateOnly = typeof row.date === 'string' ? row.date.slice(0, 10) : dateValue
        map[studentId] = {
          id: row.id,
          studentId,
          date: dateOnly,
          status: row.status,
          notes: row.notes ?? '',
          student_name: row.student_name,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
      })
      setTodayAttendanceMap(map)
    } catch (error) {
      console.error('Failed to load today attendance', error)
      toast.error('Could not load today\'s attendance')
    } finally {
      setAttendanceLoading(false)
    }
  }, [])

  const fetchAttendanceRange = useCallback(async (startDate: string, endDate: string) => {
    const res = await apiClient.getAttendance({ startDate, endDate })
      const rows = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
      const normalized = rows.map((row: any) => ({
        id: row.id,
        studentId: row.studentId || row.student_id,
        date: typeof row.date === 'string' ? row.date.slice(0, 10) : row.date,
        status: row.status,
        notes: row.notes,
        student_name: row.student_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })) as AttendanceRecord[]
    return normalized
  }, [])

  const loadCurrentWeekAttendance = useCallback(async () => {
    try {
      const { startDate, endDate } = getWeekRange(0)
      const data = await fetchAttendanceRange(startDate, endDate)
      setCurrentWeekAttendance(data)
    } catch (error) {
      console.error('Failed to load current week attendance', error)
      toast.error('Could not load this week\'s attendance summary')
    }
  }, [fetchAttendanceRange])

  const loadWeeklyAttendance = useCallback(async (offset: number) => {
    setHistoryLoading(true)
    try {
      const { startDate, endDate } = getWeekRange(offset)
      const data = await fetchAttendanceRange(startDate, endDate)
      setWeeklyAttendance(data)
    } catch (error) {
      console.error('Failed to load weekly attendance', error)
      toast.error('Could not load weekly attendance summary')
    } finally {
      setHistoryLoading(false)
    }
  }, [fetchAttendanceRange, getWeekRange])

  useEffect(() => {
    refreshToday()
  }, [refreshToday])

  useEffect(() => {
    const handler = async () => {
      const { configuredPeriods } = await refreshGradingSettings()
      setCurrentGradingPeriod(prev => Math.min(Math.max(1, prev || 1), configuredPeriods))
    }
    window.addEventListener('gradeflow-profile-updated', handler)
    return () => window.removeEventListener('gradeflow-profile-updated', handler)
  }, [refreshGradingSettings])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const [
        gradingSettings,
        studentsRes,
        groupsRes,
        dashboardRes,
        gradesRes,
      ] = await Promise.all([
        refreshGradingSettings(),
        apiClient.getStudents(),
        apiClient.getStudentGroups(),
        apiClient.getDashboardStats(),
        apiClient.getGrades(),
      ])

      const { configuredPeriods } = gradingSettings
      const studentsData = Array.isArray(studentsRes.data) ? studentsRes.data : []
      setStudents(studentsData)

      const groupData = Array.isArray(groupsRes.data) ? groupsRes.data : []
      setStudentGroups(groupData)
      filterStudentsByTeacher(studentsData, groupData)

      setDashboardSummary((dashboardRes.data as DashboardSummary) || {})

      if (gradesRes.error) {
        console.error('Failed to fetch grades:', gradesRes.error)
        setGrades([])
      } else {
        setGrades(Array.isArray(gradesRes.data) ? gradesRes.data : [])
      }

      // Set current grading period to 1 by default
      setCurrentGradingPeriod(prev => Math.min(Math.max(1, prev || 1), configuredPeriods))

      await Promise.all([loadWeeklyAttendance(weekOffset), loadCurrentWeekAttendance(), loadTodayAttendance(todayIso)])

      setLoading(false)
    }
    fetchData()
    
    // Listen for teacher updates to refresh teacher count
    const handleTeacherUpdated = () => {
      fetchData()
    }
    
    window.addEventListener('gradeflow-teachers-updated', handleTeacherUpdated)
    return () => {
      window.removeEventListener('gradeflow-teachers-updated', handleTeacherUpdated)
    }
  }, [filterStudentsByTeacher, loadTodayAttendance, loadWeeklyAttendance, loadCurrentWeekAttendance, todayIso, refreshGradingSettings])

  useEffect(() => {
    const handleTeacherSelectionChange = () => filterStudentsByTeacher(students, studentGroups)
    window.addEventListener('teacher-selection-changed', handleTeacherSelectionChange)
    return () => {
      window.removeEventListener('teacher-selection-changed', handleTeacherSelectionChange)
    }
  }, [filterStudentsByTeacher, students, studentGroups])

  useEffect(() => {
    if (historyDialogOpen) {
      loadWeeklyAttendance(weekOffset)
    }
  }, [historyDialogOpen, weekOffset, loadWeeklyAttendance])

  useEffect(() => {
    if (!historyDialogOpen) return
    const handleHistoryKey = (e: KeyboardEvent) => {
      if (historyLoading) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setWeekOffset(prev => prev - 1)
      }
      if (e.key === 'ArrowRight') {
        if (weekOffset >= 0) return
        e.preventDefault()
        setWeekOffset(prev => Math.min(prev + 1, 0))
      }
    }
    window.addEventListener('keydown', handleHistoryKey)
    return () => window.removeEventListener('keydown', handleHistoryKey)
  }, [historyDialogOpen, historyLoading, weekOffset])

  useEffect(() => {
    if (attendanceDialogOpen) {
      refreshToday()
      setSelectedStudentIndex(0)
      setTimeout(() => {
        dialogContentRef.current?.focus()
      }, 0)
    }
  }, [attendanceDialogOpen, studentsForDialog.length, refreshToday])

  const weekLineData = useMemo(() => {
    const visibleIds = new Set((filteredStudents.length > 0 ? filteredStudents : students).map(s => s.id))
    const base = currentWeekDates.map(date => ({
      date,
      label: parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short' }),
      present: 0,
      tardy: 0,
      absent: 0,
      excused: 0,
    }))

    const byDate = new Map(base.map(entry => [entry.date, entry]))

    currentWeekAttendance.forEach(rec => {
      const studentId = (rec as any).studentId || (rec as any).student_id
      if (visibleIds.size > 0 && !visibleIds.has(studentId)) return
      const bucket = byDate.get(rec.date)
      if (!bucket) return
      const status = rec.status as AttendanceStatus
      if (status in bucket) {
        (bucket as any)[status] = (bucket as any)[status] + 1
      }
    })

    return base
  }, [filteredStudents, students, currentWeekDates, currentWeekAttendance])

  const startOfWeekLabel = (isoDate: string) => {
    const d = new Date(`${isoDate}T00:00:00`)
    const day = d.getDay() // 0 Sun
    const diffToMonday = (day + 6) % 7
    d.setDate(d.getDate() - diffToMonday)
    d.setHours(0, 0, 0, 0)
    return formatLocalISO(d)
  }

  const weeklyGroupAverageData = useMemo(() => {
    if (grades.length === 0 || students.length === 0 || countablePeriodGrades.length === 0) return []

    const studentMap = new Map(students.map(s => [s.id, s]))

    // Anchor to the first graded week in the selected grading period
    const earliestGradeDate = countablePeriodGrades.reduce<string | null>((min, grade) => {
      const dateOnly = grade.date?.slice(0, 10)
      if (!dateOnly) return min
      return min === null || dateOnly < min ? dateOnly : min
    }, null)

    if (!earliestGradeDate) return []

    const startWeekKey = startOfWeekLabel(earliestGradeDate)
    const startWeekDate = new Date(`${startWeekKey}T00:00:00`)

    // Build exactly six consecutive week buckets for the selected period
    const weekKeys: string[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(startWeekDate)
      d.setDate(d.getDate() + i * 7)
      weekKeys.push(formatLocalISO(d))
    }

    const buckets = new Map<string, { date: string; sums: Record<string, number>; counts: Record<string, number> }>()
    const weeksWithData = new Set<string>()

    countablePeriodGrades.forEach(grade => {
      const student = studentMap.get(grade.studentId)
      if (!student) return
      const groups = student.group_name ? student.group_name.split(',').map(g => g.trim()).filter(Boolean) : []
      if (groups.length === 0) return
      const weekKey = startOfWeekLabel(grade.date.slice(0, 10))
      // Ignore weeks outside the six-week window
      if (!weekKeys.includes(weekKey)) return

      if (!buckets.has(weekKey)) {
        const sums: Record<string, number> = {}
        const counts: Record<string, number> = {}
        buckets.set(weekKey, { date: weekKey, sums, counts })
      }

      const bucket = buckets.get(weekKey)!
      const pct = getPercentageValue(grade)
      groups.forEach(name => {
        bucket.sums[name] = (bucket.sums[name] || 0) + pct
        bucket.counts[name] = (bucket.counts[name] || 0) + 1
      })
      weeksWithData.add(weekKey)
    })

    const lastDataIndex = weekKeys.reduce((latest, key, idx) => (weeksWithData.has(key) ? idx : latest), -1)

    return weekKeys.map((weekKey, idx) => {
      const row = buckets.get(weekKey)
      const entry: Record<string, any> = {
        date: weekKey,
        label: new Date(`${weekKey}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      }

      allGroupNames.forEach(name => {
        if (idx > lastDataIndex) {
          entry[name] = null
          return
        }
        const sum = row?.sums[name] || 0
        const count = row?.counts[name] || 0
        entry[name] = count > 0 ? sum / count : null
      })

      return entry
    })
  }, [grades, students, countablePeriodGrades, allGroupNames, formatLocalISO, startOfWeekLabel])

  const statusOrder: AttendanceStatus[] = ['present', 'tardy', 'absent', 'excused']

  const markAllPresent = useCallback(() => {
    setTodayAttendanceMap(prev => {
      const next = { ...prev }
      studentsForDialog.forEach(student => {
        next[student.id] = {
          ...(next[student.id] || { studentId: student.id, date: todayIso }),
          studentId: student.id,
          date: todayIso,
          status: 'present',
        }
      })
      return next
    })
  }, [studentsForDialog, todayIso])

  const moveToStudent = useCallback((delta: number) => {
    setSelectedStudentIndex(prev => {
      const maxIndex = Math.max(0, studentsForDialog.length - 1)
      const next = Math.min(Math.max(0, prev + delta), maxIndex)
      return next
    })
  }, [studentsForDialog.length])

  useEffect(() => {
    if (!nextBirthdayInfo) return
    if (nextBirthdayInfo.daysUntil === 0) {
      toast.success(`Today is ${nextBirthdayInfo.name}'s birthday! 🎉`)
    }
  }, [nextBirthdayInfo])

  const setStatusForStudent = useCallback((studentId: string, status: AttendanceStatus, advance: boolean) => {
    setTodayAttendanceMap(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { studentId, date: todayIso }),
        studentId,
        date: todayIso,
        status,
      }
    }))
    if (advance) {
      moveToStudent(1)
    }
  }, [moveToStudent, todayIso])

  const saveTodayAttendance = useCallback(async () => {
    if (attendanceSaving) return
    const payload = Object.values(todayAttendanceMap)
      .filter(r => r.status)
      .map(r => ({ studentId: r.studentId, date: todayIso, status: r.status, notes: r.notes ?? '' }))

    if (payload.length === 0) {
      toast.warning('No attendance changes to save')
      return
    }

    setAttendanceSaving(true)
    const res = await apiClient.upsertAttendance(payload)
    setAttendanceSaving(false)

    if ((res as any).error) {
      toast.error('Failed to save attendance')
      return
    }

    toast.success('Attendance saved')
    loadCurrentWeekAttendance()
    if (weekOffset === 0) {
      loadWeeklyAttendance(weekOffset)
    }
    loadTodayAttendance(todayIso)
    setAttendanceDialogOpen(false)
  }, [attendanceSaving, todayAttendanceMap, todayIso, loadCurrentWeekAttendance, loadWeeklyAttendance, loadTodayAttendance, weekOffset])

  const handleAttendanceKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!attendanceDialogOpen || studentsForDialog.length === 0) return
    const currentStudent = studentsForDialog[selectedStudentIndex]
    if (!currentStudent) return

    const key = e.key
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'p', 'a', 't', 'e', 'P', 'A', 'T', 'E'].includes(key) || (e.shiftKey && (key === 'P' || key === 'p'))) {
      e.preventDefault()
    }

    if (e.shiftKey && (key === 'P' || key === 'p')) {
      return markAllPresent()
    }

    if (key === 'ArrowDown') return moveToStudent(1)
    if (key === 'ArrowUp') return moveToStudent(-1)
    if (key === 'Enter') return saveTodayAttendance()

    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      const currentStatus = todayAttendanceMap[currentStudent.id]?.status as AttendanceStatus | undefined
      const currentIndex = currentStatus ? statusOrder.indexOf(currentStatus) : -1
      const direction = key === 'ArrowRight' ? 1 : -1
      const nextIndex = currentIndex === -1
        ? (direction === 1 ? 0 : statusOrder.length - 1)
        : (currentIndex + direction + statusOrder.length) % statusOrder.length
      setStatusForStudent(currentStudent.id, statusOrder[nextIndex], false)
      return
    }

    const lower = key.toLowerCase()
    if (lower === 'p') return setStatusForStudent(currentStudent.id, 'present', true)
    if (lower === 'a') return setStatusForStudent(currentStudent.id, 'absent', true)
    if (lower === 't') return setStatusForStudent(currentStudent.id, 'tardy', true)
    if (lower === 'e') return setStatusForStudent(currentStudent.id, 'excused', true)
  }, [attendanceDialogOpen, studentsForDialog, selectedStudentIndex, todayAttendanceMap, statusOrder, moveToStudent, setStatusForStudent, saveTodayAttendance])

  const handleHistoryCellClick = useCallback((studentId: string, date: string) => {
    setHistoryMenuTarget({ studentId, date })
  }, [])

  const handleHeaderStatusSelect = useCallback(async (date: string, status: AttendanceStatus) => {
    if (historySaving || historyLoading) return
    const visibleStudents = (filteredStudents.length > 0 ? filteredStudents : students)
    if (visibleStudents.length === 0) return

    const visibleIds = new Set(visibleStudents.map(s => s.id))

    // Optimistic update for all visible students on that date
    setWeeklyAttendance(prev => {
      const withoutDay = prev.filter(r => !(visibleIds.has((r as any).studentId || (r as any).student_id) && r.date === date))
      const replacements = visibleStudents.map(student => {
        const existing = prev.find(r => {
          const sid = (r as any).studentId || (r as any).student_id
          return sid === student.id && r.date === date
        })
        return {
          ...(existing || { id: undefined, studentId: student.id, date, notes: '', created_at: undefined, updated_at: undefined, student_name: student.name }),
          studentId: student.id,
          date,
          status,
        } as AttendanceRecord
      })
      return [...withoutDay, ...replacements]
    })

    setHistorySaving(true)
    const payload = visibleStudents.map(student => {
      const existing = weeklyAttendance.find(r => {
        const sid = (r as any).studentId || (r as any).student_id
        return sid === student.id && r.date === date
      })
      return { studentId: student.id, date, status, notes: existing?.notes ?? '' }
    })

    const res = await apiClient.upsertAttendance(payload)
    setHistorySaving(false)
    setHeaderMenuDate(null)

    if ((res as any).error) {
      toast.error('Could not update attendance')
      loadWeeklyAttendance(weekOffset)
      if (weekOffset === 0) loadCurrentWeekAttendance()
      return
    }

    if (weekOffset === 0) loadCurrentWeekAttendance()
  }, [historySaving, historyLoading, filteredStudents, students, weeklyAttendance, loadWeeklyAttendance, loadCurrentWeekAttendance, weekOffset])

  const handleHistoryStatusSelect = useCallback(async (studentId: string, date: string, status: AttendanceStatus, notes?: string) => {
    if (historySaving) return

    const record = weeklyAttendance.find(r => {
      const sid = (r as any).studentId || (r as any).student_id
      return sid === studentId && r.date === date
    })

    // Optimistic update for the grid
    setWeeklyAttendance(prev => {
      const without = prev.filter(r => !(((r as any).studentId || (r as any).student_id) === studentId && r.date === date))
      return [...without, {
        ...(record || { id: undefined, studentId, date, notes: '', created_at: undefined, updated_at: undefined, student_name: undefined }),
        studentId,
        date,
        status,
      } as AttendanceRecord]
    })

    setHistorySaving(true)
    const res = await apiClient.upsertAttendance([{ studentId, date, status, notes: notes ?? record?.notes ?? '' }])
    setHistorySaving(false)
    setHistoryMenuTarget(null)

    if ((res as any).error) {
      toast.error('Could not update attendance')
      loadWeeklyAttendance(weekOffset)
      if (weekOffset === 0) loadCurrentWeekAttendance()
      return
    }

    if (weekOffset === 0) {
      loadCurrentWeekAttendance()
    }
  }, [historySaving, weeklyAttendance, loadWeeklyAttendance, loadCurrentWeekAttendance, weekOffset])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    )
  }

  const totalStudents = Number(dashboardSummary.overview?.total_students ?? students.length)
  const totalSubjects = Number(dashboardSummary.overview?.total_subjects ?? 0)
  const totalTeachers = Number(dashboardSummary.overview?.total_teachers ?? 0)
  // Calculate class average for current grading period
  const averageGrade = countablePeriodGrades.length > 0 
    ? countablePeriodGrades.reduce((sum, grade) => sum + getPercentageValue(grade), 0) / countablePeriodGrades.length
    : 0

  // Students at risk based on current grading period
  const studentsAtRisk = students.filter(student => {
    const studentGrades = countablePeriodGrades.filter(g => g.studentId === student.id)
    if (studentGrades.length === 0) return false
    const studentAverage = studentGrades.reduce((sum, grade) => sum + getPercentageValue(grade), 0) / studentGrades.length
    return studentAverage < 70
  })

  // Students at risk based on current grading period
  const recentGrades = Array.isArray(dashboardSummary.recentActivity)
    ? dashboardSummary.recentActivity.slice(0, 5)
    : []

  // Helper function to get grading period name
  const getGradingPeriodName = (period: number): string => {
    const namesByCount: Record<number, string[]> = {
      3: ['1st Trimester', '2nd Trimester', '3rd Trimester'],
      4: ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'],
      6: ['1st Six Weeks', '2nd Six Weeks', '3rd Six Weeks', '4th Six Weeks', '5th Six Weeks', '6th Six Weeks']
    }

    const ordinal = (value: number) => {
      const v = value % 100
      if (v >= 11 && v <= 13) return `${value}th`
      switch (value % 10) {
        case 1: return `${value}st`
        case 2: return `${value}nd`
        case 3: return `${value}rd`
        default: return `${value}th`
      }
    }

    const names = namesByCount[gradingPeriodCount] || []
    return names[period - 1] || `${ordinal(period)} Period`
  }

  // Navigation helper function
  const navigateToTab = (tab: string) => {
    window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab } }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Dashboard</h2>
        <p className="text-muted-foreground">Overview of your classes and recent activity</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer" onClick={() => navigateToTab('students')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
            <p className="text-xs text-muted-foreground">Across {totalTeachers} teachers</p>

            {nextBirthdayInfo ? (
              <div
                className={`mt-3 rounded border px-3 py-2 ${
                  nextBirthdayInfo.daysUntil <= 7 ? 'border-amber-200 bg-amber-50' : 'border-border bg-muted/50'
                }`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next birthday</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs text-foreground">{nextBirthdayInfo.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {nextBirthdayInfo.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <Badge variant={nextBirthdayInfo.daysUntil <= 7 ? 'destructive' : 'secondary'}>
                    {nextBirthdayInfo.daysUntil === 0 ? 'Today' : `${nextBirthdayInfo.daysUntil} days`}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Add student birthdays to track upcoming dates.</p>
            )}
          </CardContent>
        </Card>

        <Card className="cursor-pointer" onClick={() => navigateToTab('subjects')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subjects</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSubjects}</div>
            <p className="text-xs text-muted-foreground">
              Active this semester
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer" onClick={() => setAverageDialogOpen(true)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Class Average</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsAvailable
                ? `${(typeof averageGrade === 'number' && !isNaN(averageGrade) ? averageGrade : 0).toFixed(1)}%`
                : '---'}
            </div>
            <div className="flex items-center justify-between mt-2">
              <Progress value={analyticsAvailable && typeof averageGrade === 'number' && !isNaN(averageGrade) ? averageGrade : 0} className="flex-1 mr-2" />
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation() // Prevent card click navigation
                    setCurrentGradingPeriod(Math.max(1, currentGradingPeriod - 1))
                  }}
                  disabled={currentGradingPeriod <= 1}
                  className="text-xs px-1 py-0.5 rounded bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ←
                </button>
                <span className="text-xs font-medium px-1">
                  {currentGradingPeriod}/{gradingPeriodCount}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation() // Prevent card click navigation
                    setCurrentGradingPeriod(Math.min(gradingPeriodCount, currentGradingPeriod + 1))
                  }}
                  disabled={currentGradingPeriod >= gradingPeriodCount}
                  className="text-xs px-1 py-0.5 rounded bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  →
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {analyticsAvailable
                ? `${getGradingPeriodName(currentGradingPeriod)} • ${countablePeriodGrades.length} grades`
                : 'Set grading period dates in Admin settings to enable period analytics.'}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer" onClick={() => navigateToTab('grades')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{analyticsAvailable ? studentsAtRisk.length : '---'}</div>
            <p className="text-xs text-muted-foreground">Students below 70%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock size={20} />
              Recent Grades
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentGrades.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No grades entered yet</p>
            ) : (
              <div className="space-y-3">
                {recentGrades.map((grade, index) => {
                  const percentage = typeof grade.percentage === 'string' ? parseFloat(grade.percentage) : (grade.percentage || 0)
                  return (
                    <div key={`${grade.id}-${index}`} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{grade.student_name || 'Unknown student'}</p>
                        <p className="text-xs text-muted-foreground">
                          {grade.subject_name || 'Unknown subject'} - {grade.lesson_name || 'Unknown lesson'}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={percentage >= 90 ? "default" : percentage >= 70 ? "secondary" : "destructive"}>
                          {percentage.toFixed(0)}%
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {grade.updated_at ? new Date(grade.updated_at).toLocaleDateString() : ''}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock size={20} />
              Attendance
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setHistoryDialogOpen(true); loadWeeklyAttendance(weekOffset) }}>
                View history
              </Button>
              <Button size="sm" onClick={() => {
                const newToday = formatLocalISO(new Date())
                setTodayIso(newToday)
                setSelectedStudentIndex(0)
                setAttendanceDialogOpen(true)
                loadTodayAttendance(newToday)
              }} disabled={isWeekendToday} title={isWeekendToday ? 'Attendance marking is unavailable on weekends' : undefined}>
                Mark today
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Quickly mark presence, tardiness, or absence without leaving the dashboard.</p>
            <div className="mt-4 h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weekLineData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                  <Tooltip formatter={(value: any, name) => [value, name]} labelFormatter={(label) => `Day: ${label}`} />
                  <Line type="monotone" dataKey="present" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, stroke: '#065f46', fill: '#22c55e' }} name="Present" />
                  <Line type="monotone" dataKey="tardy" stroke="#fb923c" strokeWidth={2} dot={{ r: 3, stroke: '#c2410c', fill: '#fb923c' }} name="Tardy" />
                  <Line type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, stroke: '#991b1b', fill: '#ef4444' }} name="Absent" />
                  <Line type="monotone" dataKey="excused" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} name="Excused" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={attendanceDialogOpen} onOpenChange={(open) => {
        if (open) {
          const newToday = formatLocalISO(new Date())
          setTodayIso(newToday)
          setSelectedStudentIndex(0)
          loadTodayAttendance(newToday)
        }
        setAttendanceDialogOpen(open)
      }}>
        <DialogContent ref={dialogContentRef} tabIndex={-1} onKeyDown={handleAttendanceKeyDown} className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Today&apos;s attendance</DialogTitle>
            <DialogDescription>Mark status for {todayIso}. Use arrow (or letter) keys for quick entry.</DialogDescription>
          </DialogHeader>

          {attendanceLoading ? (
            <p className="text-muted-foreground">Loading attendance...</p>
          ) : filteredStudents.length === 0 ? (
            <p className="text-muted-foreground">No students available for the current selection.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-green-500" />[p]resent</div>
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-orange-500" />[t]ardy</div>
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-500" />[a]bsent</div>
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-sky-500" />[e]xcused</div>
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-green-500" />all present [Shift + p]</div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                {studentsForDialog.map((student, idx) => {
                  const record = todayAttendanceMap[student.id]
                  const isSelected = idx === selectedStudentIndex
                  return (
                    <div key={student.id} className={`rounded-md border border-border p-2 ${isSelected ? 'ring-2 ring-primary/50 border-primary/60' : ''}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-sm">{student.name}</p>
                          <p className="text-xs text-muted-foreground">{student.group_name || 'No group'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {attendanceStatusOptions.map(option => {
                            const checked = record?.status === option.value
                            const colorClass =
                              option.value === 'present' ? 'bg-green-500' :
                              option.value === 'tardy' ? 'bg-orange-500' :
                              option.value === 'absent' ? 'bg-red-500' : 'bg-sky-500'
                            return (
                              <button
                                key={option.value}
                                aria-label={option.label}
                                className={`h-8 w-8 rounded-full border transition ${colorClass} ${checked ? 'ring-2 ring-offset-2 ring-primary' : 'border-border hover:ring-2 hover:ring-offset-2 hover:ring-primary/50'}`}
                                onClick={() => setStatusForStudent(student.id, option.value, false)}
                              />
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAttendanceDialogOpen(false)}>Close</Button>
            <Button disabled={attendanceSaving || attendanceLoading || studentsForDialog.length === 0}
              onClick={saveTodayAttendance}>
              {attendanceSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialogOpen} onOpenChange={(open) => setHistoryDialogOpen(open)}>
        <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Attendance history (current week)</DialogTitle>
            <DialogDescription>Per-day status with frozen names; colors match the legend.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 overflow-hidden flex-1 min-h-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button variant="outline" size="sm" disabled={historyLoading} onClick={() => setWeekOffset(prev => prev - 1)}>
                ← Previous week
              </Button>
              <Button variant="outline" size="sm" disabled={weekOffset >= 0 || historyLoading} onClick={() => setWeekOffset(prev => prev + 1)}>
                Next week →
              </Button>
              <span>{new Date(`${weekRange.startDate}T00:00:00`).toLocaleDateString()} - {new Date(`${weekRange.endDate}T00:00:00`).toLocaleDateString()}</span>
              {historyLoading && <span className="text-xs text-muted-foreground">Loading...</span>}
              <span className="text-xs text-muted-foreground">Use ← / →</span>
            </div>

            <div className="overflow-auto flex-1 min-h-0">
              <table className="min-w-max w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-background border-b border-border text-left px-2 py-2">Student</th>
                    {weekDates.map(date => {
                      const isOpen = headerMenuDate === date
                      return (
                        <th
                          key={date}
                          className="border-b border-border px-2 py-2 text-center text-xs text-muted-foreground cursor-pointer relative"
                          onClick={() => setHeaderMenuDate(prev => (prev === date ? null : date))}
                        >
                          {parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short' })}
                          {isOpen && (
                            <div className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 rounded border border-border bg-popover shadow-lg p-2 flex gap-2">
                              {attendanceStatusOptions.map(option => (
                                <button
                                  key={option.value}
                                  className={`h-7 w-7 rounded-full border ${option.value === 'present' ? 'bg-green-500' : option.value === 'tardy' ? 'bg-orange-500' : option.value === 'absent' ? 'bg-red-500' : 'bg-sky-500'} border-border hover:ring-2 hover:ring-offset-1 hover:ring-primary/50`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleHeaderStatusSelect(date, option.value as AttendanceStatus)
                                  }}
                                  aria-label={`${option.label} for all`}
                                  title={`${option.label} for all`}
                                  disabled={historySaving || historyLoading}
                                />
                              ))}
                              <button
                                className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
                                onClick={(e) => { e.stopPropagation(); setHeaderMenuDate(null) }}
                                disabled={historySaving || historyLoading}
                              >
                                Close
                              </button>
                            </div>
                          )}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(filteredStudents.length > 0 ? filteredStudents : students).map(student => {
                    const statusForDay = (day: string) => {
                      const rec = weeklyAttendance.find(r => {
                        const sid = (r as any).studentId || (r as any).student_id
                        return sid === student.id && r.date === day
                      })
                      return rec?.status as AttendanceStatus | undefined
                    }

                    const dotClass = (status?: AttendanceStatus) => {
                      if (status === 'present') return 'bg-green-500'
                      if (status === 'tardy') return 'bg-orange-500'
                      if (status === 'absent') return 'bg-red-500'
                      if (status === 'excused') return 'bg-sky-500'
                      return 'bg-muted'
                    }

                    return (
                      <tr key={student.id} className="border-b border-border last:border-0">
                        <td className="sticky left-0 bg-background px-2 py-2 font-medium text-sm">
                          <div className="flex flex-col">
                            <span>{student.name}</span>
                            <span className="text-xs text-muted-foreground">{student.group_name || 'No group'}</span>
                          </div>
                        </td>
                        {weekDates.map(day => {
                          const status = statusForDay(day)
                          const isOpen = historyMenuTarget?.studentId === student.id && historyMenuTarget?.date === day
                          return (
                            <td
                              key={day}
                              className="px-2 py-2 text-center cursor-pointer relative"
                              onClick={() => handleHistoryCellClick(student.id, day)}
                            >
                              <span className={`inline-block h-3 w-3 rounded-full ${dotClass(status)}`} title={status || 'No entry'} />
                              {isOpen && (
                                <div className="absolute z-10 top-full left-1/2 -translate-x-1/2 mt-1 rounded border border-border bg-popover shadow-lg p-2 flex gap-2">
                                  {attendanceStatusOptions.map(option => (
                                    <button
                                      key={option.value}
                                      className={`h-7 w-7 rounded-full border ${option.value === 'present' ? 'bg-green-500' : option.value === 'tardy' ? 'bg-orange-500' : option.value === 'absent' ? 'bg-red-500' : 'bg-sky-500'} ${status === option.value ? 'ring-2 ring-offset-1 ring-primary' : 'border-border hover:ring-2 hover:ring-offset-1 hover:ring-primary/50'}`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleHistoryStatusSelect(student.id, day, option.value as AttendanceStatus, status === option.value ? undefined : undefined)
                                      }}
                                      aria-label={option.label}
                                      title={option.label}
                                      disabled={historySaving}
                                    />
                                  ))}
                                  <button
                                    className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
                                    onClick={(e) => { e.stopPropagation(); setHistoryMenuTarget(null) }}
                                    disabled={historySaving}
                                  >
                                    Close
                                  </button>
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={averageDialogOpen} onOpenChange={setAverageDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Weekly average by group</DialogTitle>
            <DialogDescription>Select groups to show or hide. Skipped and zero-percent grades are excluded.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              {allGroupNames.length === 0 ? (
                <span className="text-sm text-muted-foreground">No groups available.</span>
              ) : (
                allGroupNames.map(name => (
                  <label key={name} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedGroups[name] ?? false}
                      onCheckedChange={(checked) => setSelectedGroups(prev => ({ ...prev, [name]: Boolean(checked) }))}
                    />
                    <span>{name}</span>
                  </label>
                ))
              )}
            </div>
            <div className="h-72 w-full">
              {analyticsAvailable ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyGroupAverageData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                    <Tooltip
                      formatter={(value: any, name) => {
                        if (value === null || value === undefined) return ['—', name]
                        const num = typeof value === 'number' ? value : parseFloat(value)
                        const display = isNaN(num) ? value : num.toFixed(1)
                        return [display, name]
                      }}
                      labelFormatter={(label) => `Week of ${label}`}
                    />
                    {allGroupNames.map((name, idx) => {
                      if (!selectedGroups[name]) return null
                      const colors = ['#2563eb', '#22c55e', '#f97316', '#ef4444', '#a855f7', '#0ea5e9', '#84cc16', '#d946ef']
                      const color = colors[idx % colors.length]
                      return (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={color}
                          strokeWidth={2}
                          dot={{ r: 3, stroke: '#0f172a', fill: color }}
                          connectNulls
                          name={name}
                        />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Set grading period dates in Admin settings to enable this chart.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}