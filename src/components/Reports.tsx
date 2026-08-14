import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Eye, Users, FilePdf, Gear, CaretUp, CaretDown } from "@phosphor-icons/react"
import { Student, Subject, Grade, ReportCard, AttendanceRecord, AttendanceSummary, GradingPeriod } from '@/lib/types'
import { getLetterGrade, generateReportCard, getSubjectCalculationBreakdown } from '@/lib/reportUtils'
import { toast } from 'sonner'
import { pdf } from '@react-pdf/renderer'
import ReportCardPDF from './ReportCardPDF.tsx'
import { apiClient } from '@/lib/api'

type SubjectDisplayMode = 'percentage' | 'letter' | 'gpa'
type SubjectTier = 'primary' | 'secondary'

type ReportSubjectPreference = {
  displayMode: SubjectDisplayMode
  tier: SubjectTier
}

type ReportOptionsState = {
  groupSubjectOrder: Record<string, string[]>
  subjectPreferences: Record<string, ReportSubjectPreference>
  primaryWeightingEnabled: boolean
  primaryWeightPercent: number
}

const REPORT_OPTIONS_STORAGE_KEY = 'gradeflow-report-options-v1'

export default function Reports() {
  const [students, setStudents] = useState<Student[]>([])
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([])
  const [studentGroups, setStudentGroups] = useState<any[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [gradingPeriods, setGradingPeriods] = useState<GradingPeriod[]>([])
  const [attendanceStartDate, setAttendanceStartDate] = useState("")
  const [attendanceEndDate, setAttendanceEndDate] = useState("")
  const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceRecord[]>>({})
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [reportPeriod, setReportPeriod] = useState("")
  const [includeComments, setIncludeComments] = useState(true)
  const [showPercentage, setShowPercentage] = useState(true) // Default to percentage instead of GPA
  const [comments, setComments] = useState<Record<string, string>>({})
  const [previewStudent, setPreviewStudent] = useState<string>("")
  const [showCalculationDetails, setShowCalculationDetails] = useState(false)
  const [showReportOptionsDialog, setShowReportOptionsDialog] = useState(false)
  const [selectedOptionsGroup, setSelectedOptionsGroup] = useState<string>('')
  const [groupSubjectOrder, setGroupSubjectOrder] = useState<Record<string, string[]>>({})
  const [subjectPreferences, setSubjectPreferences] = useState<Record<string, ReportSubjectPreference>>({})
  const [primaryWeightingEnabled, setPrimaryWeightingEnabled] = useState(false)
  const [primaryWeightPercent, setPrimaryWeightPercent] = useState(60)
  const [hasLoadedReportPreferences, setHasLoadedReportPreferences] = useState(false)
  const [schoolSettings, setSchoolSettings] = useState({
    schoolName: '',
    firstDayOfSchool: '',
    gradingPeriods: 6,
    gradingMode: 'dates' as 'dates'
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const getSubjectDisplayName = useCallback((subject: Subject) => {
    return subject.report_card_name && subject.report_card_name.trim() !== ''
      ? subject.report_card_name
      : subject.name
  }, [])

  const getGPAPoints = useCallback((percentage: number): number => {
    if (typeof percentage !== 'number' || isNaN(percentage)) return 0.0
    if (percentage >= 97) return 4.0
    if (percentage >= 93) return 4.0
    if (percentage >= 90) return 3.7
    if (percentage >= 87) return 3.3
    if (percentage >= 83) return 3.0
    if (percentage >= 80) return 2.7
    if (percentage >= 77) return 2.3
    if (percentage >= 73) return 2.0
    if (percentage >= 70) return 1.7
    if (percentage >= 67) return 1.3
    if (percentage >= 65) return 1.0
    if (percentage >= 60) return 0.7
    return 0.0
  }, [])

  // Helper function to extract grade number from group name for sorting
  const extractGradeNumber = (groupName: string): number => {
    const match = groupName.match(/Grade\s+(\d+)/i)
    return match ? parseInt(match[1], 10) : 999 // Put non-grade groups at the end
  }

  // Helper function to get the first group from a student's group_name
  const getFirstGroup = (groupName: string | null | undefined): string => {
    if (!groupName) return 'No Group'
    return groupName.split(',')[0].trim()
  }

  // Helper function to group and sort students by their first group
  const groupAndSortStudents = (students: Student[]) => {
    // Group students by their first group
    const grouped = students.reduce((acc, student) => {
      const firstGroup = getFirstGroup(student.group_name)
      if (!acc[firstGroup]) {
        acc[firstGroup] = []
      }
      acc[firstGroup].push(student)
      return acc
    }, {} as Record<string, Student[]>)

    // Sort groups by grade number, then alphabetically
    const sortedGroupNames = Object.keys(grouped).sort((a, b) => {
      const gradeA = extractGradeNumber(a)
      const gradeB = extractGradeNumber(b)
      
      // If both are grades, sort numerically
      if (gradeA !== 999 && gradeB !== 999) {
        return gradeA - gradeB
      }
      
      // If one is a grade and one isn't, put grade first
      if (gradeA !== 999 && gradeB === 999) return -1
      if (gradeA === 999 && gradeB !== 999) return 1
      
      // If neither are grades, sort alphabetically
      return a.localeCompare(b)
    })

    // Return sorted groups with their students (also sorted by name)
    return sortedGroupNames.map(groupName => ({
      groupName,
      students: grouped[groupName].sort((a, b) => a.name.localeCompare(b.name))
    }))
  }

  const availableGroupNames = useMemo(() => {
    const names = new Set<string>()
    filteredStudents.forEach(student => {
      names.add(getFirstGroup(student.group_name))
    })
    return Array.from(names).sort((a, b) => {
      const gradeA = extractGradeNumber(a)
      const gradeB = extractGradeNumber(b)
      if (gradeA !== 999 && gradeB !== 999) return gradeA - gradeB
      if (gradeA !== 999 && gradeB === 999) return -1
      if (gradeA === 999 && gradeB !== 999) return 1
      return a.localeCompare(b)
    })
  }, [filteredStudents])

  const getSubjectsForGroup = useCallback((groupName: string) => {
    const inGroup = subjects.filter(subject => {
      if (!subject.group_name) return false
      const names = subject.group_name.split(',').map(name => name.trim()).filter(Boolean)
      return names.includes(groupName)
    })

    // If group assignments are unavailable, fall back to all subjects.
    const source = inGroup.length > 0 ? inGroup : subjects
    return [...source].sort((a, b) => getSubjectDisplayName(a).localeCompare(getSubjectDisplayName(b)))
  }, [subjects, getSubjectDisplayName])

  const getOrderedSubjectsForGroup = useCallback((groupName: string) => {
    const baseSubjects = getSubjectsForGroup(groupName)
    const baseIds = baseSubjects.map(subject => subject.id)
    const configured = groupSubjectOrder[groupName] || []
    const filteredConfigured = configured.filter(id => baseIds.includes(id))
    const missing = baseIds.filter(id => !filteredConfigured.includes(id))
    const finalOrder = [...filteredConfigured, ...missing]

    return finalOrder
      .map(id => baseSubjects.find(subject => subject.id === id))
      .filter(Boolean) as Subject[]
  }, [getSubjectsForGroup, groupSubjectOrder])

  const moveSubjectOrder = useCallback((groupName: string, subjectId: string, direction: 'up' | 'down') => {
    const ordered = getOrderedSubjectsForGroup(groupName).map(subject => subject.id)
    const currentIndex = ordered.indexOf(subjectId)
    if (currentIndex === -1) return

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= ordered.length) return

    const next = [...ordered]
    ;[next[currentIndex], next[swapIndex]] = [next[swapIndex], next[currentIndex]]

    setGroupSubjectOrder(prev => ({
      ...prev,
      [groupName]: next,
    }))
  }, [getOrderedSubjectsForGroup])

  const getSubjectPreference = useCallback((subjectId: string): ReportSubjectPreference => {
    return subjectPreferences[subjectId] || { displayMode: 'percentage', tier: 'secondary' }
  }, [subjectPreferences])

  const setSubjectPreference = useCallback((subjectId: string, next: Partial<ReportSubjectPreference>) => {
    setSubjectPreferences(prev => ({
      ...prev,
      [subjectId]: {
        ...getSubjectPreference(subjectId),
        ...next,
      },
    }))
  }, [getSubjectPreference])

  const secondaryWeightPercent = Math.max(0, Math.min(100, 100 - primaryWeightPercent))
  const weightingSkewedWarning = primaryWeightingEnabled && secondaryWeightPercent > primaryWeightPercent

  useEffect(() => {
    if (availableGroupNames.length > 0 && !selectedOptionsGroup) {
      setSelectedOptionsGroup(availableGroupNames[0])
    }
  }, [availableGroupNames, selectedOptionsGroup])

  const applyReportPreferences = useCallback((parsed: Partial<ReportOptionsState>) => {
    if (parsed.groupSubjectOrder && typeof parsed.groupSubjectOrder === 'object') {
      setGroupSubjectOrder(parsed.groupSubjectOrder)
    }
    if (parsed.subjectPreferences && typeof parsed.subjectPreferences === 'object') {
      setSubjectPreferences(parsed.subjectPreferences)
    }
    if (typeof parsed.primaryWeightingEnabled === 'boolean') {
      setPrimaryWeightingEnabled(parsed.primaryWeightingEnabled)
    }
    if (typeof parsed.primaryWeightPercent === 'number' && !isNaN(parsed.primaryWeightPercent)) {
      setPrimaryWeightPercent(Math.max(0, Math.min(100, parsed.primaryWeightPercent)))
    }
  }, [])

  const loadLocalReportPreferences = useCallback(() => {
    try {
      const raw = localStorage.getItem(REPORT_OPTIONS_STORAGE_KEY)
      if (!raw) return false
      const parsed = JSON.parse(raw) as Partial<ReportOptionsState>
      applyReportPreferences(parsed)
      return true
    } catch (error) {
      console.warn('Failed to load report options from local storage', error)
      return false
    }
  }, [applyReportPreferences])

  const loadReportPreferences = useCallback(async () => {
    try {
      const response = await apiClient.getReportPreferences()
      if (response.error || !response.data?.preferences) {
        loadLocalReportPreferences()
        return
      }

      applyReportPreferences(response.data.preferences)
    } catch (error) {
      console.warn('Failed to load report options from API, falling back to local storage', error)
      loadLocalReportPreferences()
    } finally {
      setHasLoadedReportPreferences(true)
    }
  }, [applyReportPreferences, loadLocalReportPreferences])

  useEffect(() => {
    loadReportPreferences()
  }, [loadReportPreferences])

  useEffect(() => {
    if (!hasLoadedReportPreferences) return

    const payload: ReportOptionsState = {
      groupSubjectOrder,
      subjectPreferences,
      primaryWeightingEnabled,
      primaryWeightPercent,
    }

    localStorage.setItem(REPORT_OPTIONS_STORAGE_KEY, JSON.stringify(payload))

    const timer = setTimeout(async () => {
      const response = await apiClient.updateReportPreferences(payload)
      if (response.error) {
        console.warn('Failed to persist report options to API', response.error)
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [groupSubjectOrder, subjectPreferences, primaryWeightingEnabled, primaryWeightPercent, hasLoadedReportPreferences])

  const filterDataByTeacherGroups = useCallback(() => {
    const selectedGroupIds = window.SELECTED_TEACHER_GROUPS
    
    // Don't filter if we don't have student groups data yet
    if (studentGroups.length === 0) {
      return
    }
    
    if (!selectedGroupIds || selectedGroupIds.length === 0) {
      // If no teacher selected or no groups, show all data
      setFilteredStudents(students)
      return
    }

    // Filter students by their group membership
    const filtered = students.filter(student => {
      if (!student.group_name) return false
      
      // Parse student's group names and check if any match selected teacher's groups
      const studentGroupNames = student.group_name.split(',').map(g => g.trim())
      const teacherGroupNames = studentGroups
        .filter(group => selectedGroupIds.includes(group.id))
        .map(group => group.name)
      
      return studentGroupNames.some(studentGroup => 
        teacherGroupNames.includes(studentGroup)
      )
    })

    setFilteredStudents(filtered)
  }, [students, studentGroups])

  // Load all data from API
  useEffect(() => {
    loadData()
  }, [])

  // Filter data when teacher selection changes or data is updated
  useEffect(() => {
    filterDataByTeacherGroups()
  }, [filterDataByTeacherGroups])

  // Ensure a report period is always selected.
  useEffect(() => {
    if (!reportPeriod && gradingPeriods.length > 0) {
      setReportPeriod(gradingPeriods[0].id)
    }
  }, [gradingPeriods, reportPeriod])

  // Listen for teacher selection changes
  useEffect(() => {
    const handleTeacherChange = () => {
      filterDataByTeacherGroups()
    }
    
    window.addEventListener('teacher-selection-changed', handleTeacherChange)
    return () => {
      window.removeEventListener('teacher-selection-changed', handleTeacherChange)
    }
  }, [filterDataByTeacherGroups])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Load all data in parallel
      const [studentsRes, subjectsRes, gradesRes, groupsRes, periodsRes] = await Promise.all([
        apiClient.getStudents(),
        apiClient.getSubjects(), 
        apiClient.getGrades(),
        apiClient.getStudentGroups(),
        apiClient.getGradingPeriods()
      ])

      const studentsData = Array.isArray(studentsRes.data) ? studentsRes.data : []
      const subjectsData = Array.isArray(subjectsRes.data) ? subjectsRes.data : []
      const gradesData = Array.isArray(gradesRes.data) ? gradesRes.data : []
      const rawGroups = Array.isArray(groupsRes.data) 
        ? groupsRes.data 
        : (groupsRes.data as any)?.groups || []

      setStudents(studentsData)
      setGrades(gradesData)
      const periodsData = Array.isArray(periodsRes.data) ? periodsRes.data : []
      setGradingPeriods(periodsData)
      if (periodsData.length > 0) {
        const first = periodsData[0]
        setReportPeriod(prev => prev || first.id)
        setAttendanceStartDate(prev => prev || first.startDate)
        setAttendanceEndDate(prev => prev || first.endDate)
      }
      
      // Deduplicate groups by ID to prevent React key conflicts
      const uniqueGroups = rawGroups.filter((group: any, index: number, self: any[]) => 
        index === self.findIndex((g: any) => g.id === group.id)
      )
      setStudentGroups(uniqueGroups)

      // Load lessons for each subject
      const subjectsWithLessons = await Promise.all(
        subjectsData.map(async (subject) => {
          try {
            const lessonsRes = await apiClient.getLessonsForSubject(subject.id)
            const lessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : []
            
            return { ...subject, lessons }
          } catch (error) {
            console.warn(`Failed to load lessons for subject ${subject.name}:`, error)
            return { ...subject, lessons: [] }
          }
        })
      )

      setSubjects(subjectsWithLessons)

      // Also load settings
      await loadSettings()
      await loadReportPreferences()
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error('Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }

  const loadSettings = async () => {
    try {
      const response = await apiClient.getProfile()
      if (response.data) {
        const user = response.data
        // Format date for HTML input (YYYY-MM-DD)
        const formattedDate = user.first_day_of_school 
          ? new Date(user.first_day_of_school).toISOString().split('T')[0]
          : ''

        setSchoolSettings({
          schoolName: user.school_name || 'School Name',
          firstDayOfSchool: formattedDate,
          gradingPeriods: user.grading_periods || 6,
          gradingMode: 'dates'
        })

        const today = new Date().toISOString().split('T')[0]
        setAttendanceStartDate(prev => prev || formattedDate || today)
        setAttendanceEndDate(prev => prev || today)
        
        // Auto-select first configured reporting period.
        if (gradingPeriods.length > 0) {
          setReportPeriod(prev => prev || gradingPeriods[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const fetchAttendanceForRange = useCallback(async (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (start > end) {
      toast.error('Attendance start date must be before the end date')
      return
    }

    setAttendanceLoading(true)
    try {
      const res = await apiClient.getAttendance({ startDate, endDate })
      const rawData = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
      const grouped: Record<string, AttendanceRecord[]> = {}

      rawData.forEach((record: any) => {
        const studentId = record.studentId || record.student_id
        if (!studentId) return

        const normalized: AttendanceRecord = {
          id: record.id,
          studentId,
          date: record.date,
          status: record.status,
          notes: record.notes ?? '',
          student_name: record.student_name,
          created_at: record.created_at,
          updated_at: record.updated_at
        }

        if (!grouped[studentId]) {
          grouped[studentId] = []
        }
        grouped[studentId].push(normalized)
      })

      setAttendanceData(grouped)
    } catch (error) {
      console.error('Failed to load attendance range', error)
      toast.error('Could not load attendance for the selected range')
    } finally {
      setAttendanceLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!attendanceStartDate || !attendanceEndDate) return
    const start = new Date(attendanceStartDate)
    const end = new Date(attendanceEndDate)
    if (start > end) return
    fetchAttendanceForRange(attendanceStartDate, attendanceEndDate)
  }, [attendanceStartDate, attendanceEndDate, fetchAttendanceForRange])

  const getAttendanceSummaryForStudent = useCallback((studentId: string): AttendanceSummary => {
    const records = attendanceData[studentId] || []
    const present = records.filter(r => r.status === 'present').length
    const absent = records.filter(r => r.status === 'absent').length
    const tardy = records.filter(r => r.status === 'tardy').length
    const excused = records.filter(r => r.status === 'excused').length
    const total = records.length

    return {
      startDate: attendanceStartDate,
      endDate: attendanceEndDate,
      present,
      absent,
      tardy,
      excused,
      total
    }
  }, [attendanceData, attendanceStartDate, attendanceEndDate])

  const goToSettings = () => {
    // Navigate to Admin tab first
    window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab: 'admin' } }))
    // Then select the Settings tab within Admin after a brief delay
    setTimeout(() => {
      window?.dispatchEvent(new CustomEvent('gradeflow-admin-goto-settings'))
    }, 100)
  }

  // Filter grades by lesson date for the given reporting period.
  const getFilteredGradesForPeriod = useCallback((periodId: string): Grade[] => {
    if (gradingPeriods.length === 0) return []
    const period = gradingPeriods.find(p => p.id === periodId) || gradingPeriods[0]
    if (!period) return []

    const start = new Date(period.startDate)
    const end = new Date(period.endDate)

    return grades.filter(grade => {
      if (!grade.subjectId) return false
      const subject = subjects.find(s => s.id === grade.subjectId)
      if (!subject || !subject.lessons) return false
      const lesson = subject.lessons.find(l => l.id === grade.lessonId)
      if (!lesson || !lesson.date) return false
      const lessonDate = new Date(lesson.date)
      return lessonDate >= start && lessonDate <= end
    })
  }, [grades, gradingPeriods, subjects])

  const sortedPeriods = useMemo(
    () => [...gradingPeriods].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
    [gradingPeriods]
  )

  const selectedPeriodIndex = useMemo(() => {
    const idx = sortedPeriods.findIndex(period => period.id === reportPeriod)
    return idx >= 0 ? idx : 0
  }, [sortedPeriods, reportPeriod])

  const visiblePeriods = useMemo(
    () => sortedPeriods.slice(0, selectedPeriodIndex + 1),
    [sortedPeriods, selectedPeriodIndex]
  )

  const handleReportPeriodChange = (value: string) => {
    setReportPeriod(value)
    const period = gradingPeriods.find(p => p.id === value)
    if (period) {
      setAttendanceStartDate(period.startDate)
      setAttendanceEndDate(period.endDate)
    }
  }

  const generateReportCardForStudent = (studentId: string): ReportCard | null => {
    try {
      // Safety check to ensure all data is loaded
      if (!students.length || !subjects.length || !grades.length) {
        console.warn('generateReportCardForStudent: Missing required data', {
          students: students.length,
          subjects: subjects.length, 
          grades: grades.length
        })
        return null
      }
      
      if (gradingPeriods.length === 0) {
        console.warn('No grading periods are configured')
        return null
      }
      
      if (visiblePeriods.length === 0) {
        console.warn('No visible periods are available for report generation')
        return null
      }

      // Build report snapshots for each visible period so we can render historical columns.
      const periodReports = visiblePeriods.map(period => {
        const periodGrades = getFilteredGradesForPeriod(period.id)
        const periodReport = generateReportCard(studentId, period.name, comments, students, subjects, periodGrades)
        return { period, periodReport }
      })

      const currentSnapshot = periodReports[periodReports.length - 1]?.periodReport
      if (!currentSnapshot || currentSnapshot.subjects.length === 0) return null

      const student = students.find(s => s.id === studentId)
      if (!student) return null

      const firstGroup = getFirstGroup(student.group_name)
      const orderedSubjects = getOrderedSubjectsForGroup(firstGroup)
      const reportSubjectIds = new Set<string>()

      periodReports.forEach(({ periodReport }) => {
        ;(periodReport?.subjects || []).forEach(subject => reportSubjectIds.add(subject.subjectId))
      })

      const prioritizedSubjectIds = orderedSubjects
        .map(subject => subject.id)
        .filter(id => reportSubjectIds.has(id))

      const remainingSubjectIds = Array.from(reportSubjectIds).filter(id => !prioritizedSubjectIds.includes(id))
      remainingSubjectIds.sort((a, b) => {
        const subjectA = subjects.find(subject => subject.id === a)
        const subjectB = subjects.find(subject => subject.id === b)
        const nameA = subjectA ? getSubjectDisplayName(subjectA) : a
        const nameB = subjectB ? getSubjectDisplayName(subjectB) : b
        return nameA.localeCompare(nameB)
      })

      const orderedSubjectIds = [...prioritizedSubjectIds, ...remainingSubjectIds]

      const builtSubjects = orderedSubjectIds.map(subjectId => {
        const currentSubject = currentSnapshot.subjects.find(subject => subject.subjectId === subjectId)
        const fallbackSubject = subjects.find(subject => subject.id === subjectId)
        const preference = getSubjectPreference(subjectId)
        const periodValues = periodReports.map(({ periodReport }) => {
          const periodSubject = periodReport?.subjects.find(subject => subject.subjectId === subjectId)
          return periodSubject?.average ?? null
        })

        const currentAverage = periodValues[periodValues.length - 1]
        const safeAverage = typeof currentAverage === 'number' && !isNaN(currentAverage)
          ? currentAverage
          : (currentSubject?.average ?? 0)

        return {
          subjectId,
          subjectName: currentSubject?.subjectName || (fallbackSubject ? getSubjectDisplayName(fallbackSubject) : 'Unknown Subject'),
          grades: currentSubject?.grades || [],
          average: safeAverage,
          letterGrade: getLetterGrade(safeAverage),
          periodValues,
          displayMode: preference.displayMode,
          tier: preference.tier,
        }
      })

      const subjectsWithCurrentValues = builtSubjects.filter(subject => {
        const currentValue = subject.periodValues[subject.periodValues.length - 1]
        return typeof currentValue === 'number' && !isNaN(currentValue)
      })

      let overallGPA = 0
      if (subjectsWithCurrentValues.length > 0) {
        if (primaryWeightingEnabled) {
          const primarySubjects = subjectsWithCurrentValues.filter(subject => subject.tier === 'primary')
          const secondarySubjects = subjectsWithCurrentValues.filter(subject => subject.tier !== 'primary')

          const averageOf = (values: number[]) => values.length > 0
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : null

          const primaryAverage = averageOf(primarySubjects.map(subject => subject.periodValues[subject.periodValues.length - 1] as number))
          const secondaryAverage = averageOf(secondarySubjects.map(subject => subject.periodValues[subject.periodValues.length - 1] as number))

          const primaryWeight = Math.max(0, Math.min(100, primaryWeightPercent)) / 100
          const secondaryWeight = Math.max(0, Math.min(100, 100 - primaryWeightPercent)) / 100

          if (primaryAverage !== null && secondaryAverage !== null) {
            overallGPA = (primaryAverage * primaryWeight) + (secondaryAverage * secondaryWeight)
          } else if (primaryAverage !== null) {
            overallGPA = primaryAverage
          } else if (secondaryAverage !== null) {
            overallGPA = secondaryAverage
          }
        } else {
          overallGPA = subjectsWithCurrentValues.reduce((sum, subject) => {
            const currentValue = subject.periodValues[subject.periodValues.length - 1] as number
            return sum + currentValue
          }, 0) / subjectsWithCurrentValues.length
        }
      }

      // Use human-readable period name for the PDF header when grading periods are date-based
      const selectedPeriod = gradingPeriods.find(p => p.id === reportPeriod)
      const displayPeriod = (() => {
        if (selectedPeriod) {
          // Use configured grading periods count when present so the header reflects the intended total (e.g., 6 even if only 3 are entered so far)
          const configuredTotal = schoolSettings.gradingPeriods || gradingPeriods.length || 1
          const total = Math.max(configuredTotal, gradingPeriods.length || 1)
          const position = typeof selectedPeriod.orderIndex === 'number'
            ? selectedPeriod.orderIndex
            : gradingPeriods.findIndex(p => p.id === selectedPeriod.id) + 1
          const safePosition = Math.min(Math.max(1, position), total)
          return `${safePosition} of ${total}`
        }
        return reportPeriod
      })()

      const attendanceSummary = getAttendanceSummaryForStudent(studentId)
      return {
        studentId,
        period: displayPeriod,
        subjects: builtSubjects,
        overallGPA,
        comments: comments[studentId],
        attendanceSummary,
        periodColumns: visiblePeriods.map(period => ({
          id: period.id,
          label: period.name,
          startDate: period.startDate,
          endDate: period.endDate,
        })),
        primaryWeightingEnabled,
        primaryWeightPercent,
      } as ReportCard
    } catch (error) {
      console.error('Error generating report card for student:', studentId, error)
      return null
    }
  }

  const toggleStudent = (studentId: string) => {
    setSelectedStudents(current =>
      current.includes(studentId)
        ? current.filter(id => id !== studentId)
        : [...current, studentId]
    )
  }

  const selectAllStudents = () => {
    setSelectedStudents(filteredStudents.map(s => s.id))
  }

  const clearSelection = () => {
    setSelectedStudents([])
  }

  const generateReports = async () => {
    if (selectedStudents.length === 0) {
      toast.error("Please select at least one student")
      return
    }

    setIsGenerating(true)
    
    try {
      // First, let's validate our data without generating PDFs
      const reportCards = selectedStudents
        .map(studentId => {
          try {
            return generateReportCardForStudent(studentId)
          } catch (error) {
            console.error(`Error generating report for student ${studentId}:`, error)
            return null
          }
        })
        .filter(Boolean) as ReportCard[]

      if (reportCards.length === 0) {
        toast.error("No grades found for selected students")
        setIsGenerating(false)
        return
      }

      console.log('Report cards generated:', reportCards)

      // Generate individual PDFs for each student
      if (reportCards.length === 1) {
        // Single student - direct download
        const reportCard = reportCards[0]
        const student = students.find(s => s.id === reportCard.studentId)!
        
        // Validate data before creating PDF
        if (!reportCard.subjects || reportCard.subjects.length === 0) {
          toast.error("No subject grades found for this student")
          setIsGenerating(false)
          return
        }
        
        // Ensure student object is valid
        if (!student || !student.name) {
          toast.error("Invalid student data")
          setIsGenerating(false)
          return
        }
        
        // Validate report card data structure
        if (!reportCard.subjects) {
          toast.error("Report card has no subjects data")
          setIsGenerating(false)
          return
        }
        
        // Ensure all subject averages are valid numbers
        const validatedReportCard = {
          ...reportCard,
          overallGPA: typeof reportCard.overallGPA === 'number' && !isNaN(reportCard.overallGPA) ? reportCard.overallGPA : 0,
          subjects: reportCard.subjects.map(subject => ({
            ...subject,
            average: typeof subject.average === 'number' && !isNaN(subject.average) ? subject.average : 0
          }))
        }

        console.log('Validated report card:', validatedReportCard)
        console.log('Student data:', student)
        
        try {
          const pdfDoc = <ReportCardPDF reportCard={validatedReportCard} student={student} schoolName={schoolSettings.schoolName} firstDayOfSchool={schoolSettings.firstDayOfSchool} showPercentage={showPercentage} />
          console.log('PDF component created successfully')
          
          const asPdf = pdf(pdfDoc)
          console.log('PDF instance created')
          
          const blob = await asPdf.toBlob()
          console.log('PDF blob generated successfully')
          
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${student.name.replace(/\s+/g, '_')}_Report_Card_${new Date().toISOString().split('T')[0]}.pdf`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
          
          toast.success(`Generated report card for ${student.name}`)
        } catch (pdfError) {
          console.error('PDF generation error:', pdfError)
          toast.error(`PDF generation failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`)
        }
      } else {
        // Multiple students - generate ZIP file with individual PDFs
        const JSZip = (await import('jszip')).default
        const zip = new JSZip()
        
        for (const reportCard of reportCards) {
          const student = students.find(s => s.id === reportCard.studentId)!
          
          // Validate data before creating PDF
          if (!reportCard.subjects || reportCard.subjects.length === 0) {
            console.warn(`Skipping ${student.name} - no subject grades found`)
            continue
          }
          
          // Ensure student object is valid
          if (!student || !student.name) {
            console.warn(`Skipping student - invalid data`)
            continue
          }
          
          // Validate report card data structure
          if (!reportCard.subjects) {
            console.warn(`Skipping ${student.name} - no subjects data`)
            continue
          }
          
          // Ensure all subject averages are valid numbers
          const validatedReportCard = {
            ...reportCard,
            overallGPA: typeof reportCard.overallGPA === 'number' && !isNaN(reportCard.overallGPA) ? reportCard.overallGPA : 0,
            subjects: reportCard.subjects.map(subject => ({
              ...subject,
              average: typeof subject.average === 'number' && !isNaN(subject.average) ? subject.average : 0
            }))
          }
          
          try {
            const pdfDoc = <ReportCardPDF reportCard={validatedReportCard} student={student} schoolName={schoolSettings.schoolName} firstDayOfSchool={schoolSettings.firstDayOfSchool} showPercentage={showPercentage} />
            const asPdf = pdf(pdfDoc)
            const blob = await asPdf.toBlob()
            
            const fileName = `${student.name.replace(/\s+/g, '_')}_Report_Card.pdf`
            zip.file(fileName, blob, { binary: true })
          } catch (pdfError) {
            console.error(`Failed to generate PDF for ${student.name}:`, pdfError)
            toast.error(`Failed to generate PDF for ${student.name}`)
          }
        }
        
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(zipBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Report_Cards_${new Date().toISOString().split('T')[0]}.zip`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        toast.success(`Generated ${reportCards.length} report cards`)
      }
    } catch (error) {
      console.error('Error generating reports:', error)
      // More detailed error handling
      if (error instanceof Error) {
        if (error.message.includes('toFixed')) {
          toast.error("Data formatting error. Please check that all grades are properly entered.")
        } else if (error.message.includes('props')) {
          toast.error("PDF generation error. Please try again or contact support.")
        } else if (error.message.includes('font')) {
          toast.error("Font loading error in PDF generation. Please try again.")
        } else {
          toast.error(`Failed to generate reports: ${error.message}`)
        }
      } else {
        toast.error("Failed to generate reports. Please try again.")
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const previewReportPDF = async () => {
    if (!previewStudent) {
      toast.error("Please select a student to preview")
      return
    }

    let reportCard, student
    
    try {
      reportCard = generateReportCardForStudent(previewStudent)
      student = students.find(s => s.id === previewStudent)
      
      if (!reportCard || !student) {
        toast.error("Unable to generate preview")
        return
      }

      // Validate data before creating PDF
      if (!reportCard.subjects || reportCard.subjects.length === 0) {
        toast.error("No subject grades found for this student")
        return
      }
      
      // Ensure student object is valid
      if (!student || !student.name) {
        toast.error("Invalid student data")
        return
      }
      
      // Validate report card data structure
      if (!reportCard.subjects) {
        toast.error("Report card has no subjects data")
        return
      }
      
      // Ensure all subject averages are valid numbers
      const validatedReportCard = {
        ...reportCard,
        overallGPA: typeof reportCard.overallGPA === 'number' && !isNaN(reportCard.overallGPA) ? reportCard.overallGPA : 0,
        subjects: reportCard.subjects.map(subject => ({
          ...subject,
          average: typeof subject.average === 'number' && !isNaN(subject.average) ? subject.average : 0
        }))
      }

      console.log('Preview - Validated report card:', validatedReportCard)
      console.log('Preview - Student data:', student)

      const pdfDoc = <ReportCardPDF reportCard={validatedReportCard} student={student} schoolName={schoolSettings.schoolName} firstDayOfSchool={schoolSettings.firstDayOfSchool} showPercentage={showPercentage} />
      console.log('Preview - PDF component created successfully')
      
      const asPdf = pdf(pdfDoc)
      console.log('Preview - PDF instance created')
      
      const blob = await asPdf.toBlob()
      console.log('Preview - PDF blob generated successfully')
      
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      
      // Clean up after a delay
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      console.error('Error generating preview:', error)
      // More detailed error handling for preview
      if (error instanceof Error) {
        if (error.message.includes('toFixed')) {
          toast.error("Data formatting error. Please check that all grades are properly entered.")
        } else if (error.message.includes('props')) {
          toast.error("PDF generation error. Please try again or contact support.")
        } else if (error.message.includes('font')) {
          toast.error("Font loading error in PDF generation. Please try again.")
        } else {
          toast.error(`Failed to generate preview: ${error.message}`)
        }
      } else {
        toast.error("Failed to generate preview")
      }
    }
  }

  const previewReport = useMemo(() => {
    return previewStudent ? generateReportCardForStudent(previewStudent) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    previewStudent, 
    reportPeriod, 
    subjects.length, 
    grades.length, 
    // Create a stable key from subjects with lessons
    subjects.map(s => `${s.id}:${s.lessons?.length || 0}`).join(',')
  ])

  const previewWeightingBreakdown = useMemo(() => {
    if (!previewReport) return null

    const subjectsWithCurrentValues = previewReport.subjects
      .map(subject => {
        const currentValue = subject.periodValues?.[subject.periodValues.length - 1]
        const value = typeof currentValue === 'number' && !isNaN(currentValue)
          ? currentValue
          : subject.average
        return {
          ...subject,
          currentValue: typeof value === 'number' && !isNaN(value) ? value : null,
          tier: subject.tier || 'secondary' as SubjectTier,
        }
      })
      .filter(subject => subject.currentValue !== null)

    if (subjectsWithCurrentValues.length === 0) return null

    if (primaryWeightingEnabled) {
      const primarySubjects = subjectsWithCurrentValues.filter(subject => subject.tier === 'primary')
      const secondarySubjects = subjectsWithCurrentValues.filter(subject => subject.tier !== 'primary')

      const primaryAverage = primarySubjects.length > 0
        ? primarySubjects.reduce((sum, subject) => sum + (subject.currentValue as number), 0) / primarySubjects.length
        : null
      const secondaryAverage = secondarySubjects.length > 0
        ? secondarySubjects.reduce((sum, subject) => sum + (subject.currentValue as number), 0) / secondarySubjects.length
        : null

      const primaryWeight = Math.max(0, Math.min(100, primaryWeightPercent)) / 100
      const secondaryWeight = (100 - Math.max(0, Math.min(100, primaryWeightPercent))) / 100

      let finalAverage = 0
      if (primaryAverage !== null && secondaryAverage !== null) {
        finalAverage = (primaryAverage * primaryWeight) + (secondaryAverage * secondaryWeight)
      } else if (primaryAverage !== null) {
        finalAverage = primaryAverage
      } else if (secondaryAverage !== null) {
        finalAverage = secondaryAverage
      }

      return {
        mode: 'primary-secondary' as const,
        primarySubjects,
        secondarySubjects,
        primaryAverage,
        secondaryAverage,
        primaryWeight,
        secondaryWeight,
        finalAverage,
      }
    }

    const values = subjectsWithCurrentValues.map(subject => subject.currentValue as number)
    const equalAverage = values.reduce((sum, value) => sum + value, 0) / values.length

    return {
      mode: 'equal' as const,
      subjects: subjectsWithCurrentValues,
      equalAverage,
    }
  }, [previewReport, primaryWeightingEnabled, primaryWeightPercent])
  
  const previewStudentData = students.find(s => s.id === previewStudent)
  const attendanceRangeInvalid = Boolean(
    attendanceStartDate &&
    attendanceEndDate &&
    new Date(attendanceStartDate) > new Date(attendanceEndDate)
  )
  const selectedPeriod = gradingPeriods.find(p => p.id === reportPeriod)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Reports</h2>
          <p className="text-muted-foreground">Generate customizable report cards for students</p>
        </div>
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading data...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Reports</h2>
        <p className="text-muted-foreground">Generate customizable report cards for students</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users size={20} />
                Student Selection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllStudents}>
                  Select All ({filteredStudents.length})
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  Clear Selection
                </Button>
                <Badge variant="secondary">
                  {selectedStudents.length} selected
                </Badge>
              </div>

              {filteredStudents.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No students available
                </p>
              ) : (
                <div className="space-y-6">
                  {groupAndSortStudents(filteredStudents).map(({ groupName, students: groupStudents }) => (
                    <div key={groupName}>
                      <h4 className="text-lg font-semibold mb-3 pb-2 border-b">{groupName}</h4>
                      <div className="grid gap-3 md:grid-cols-2">
                        {groupStudents.map(student => {
                    const isSelected = selectedStudents.includes(student.id)
                    const hasGrades = grades.some(g => g.studentId === student.id)
                    // Calculate subjects for this student from grades
                    const studentSubjects = [...new Set(grades
                      .filter(g => g.studentId === student.id)
                      .map(g => g.subjectId)
                    )]
                    
                    return (
                      <div
                        key={student.id}
                        className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/5 border-primary' : 'bg-card border-border hover:bg-muted/50'
                        }`}
                        onClick={() => toggleStudent(student.id)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleStudent(student.id)}
                          onClick={(e) => e.stopPropagation()} // Prevent double-triggering from parent click
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{student.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {studentSubjects.length} subjects
                            </Badge>
                            {hasGrades ? (
                              <Badge variant="secondary" className="text-xs">
                                Has grades
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                No grades
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {includeComments && (
            <Card>
              <CardHeader>
                <CardTitle>Teacher Comments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedStudents.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Select students to add comments
                  </p>
                ) : (
                  <div className="space-y-4">
                    {selectedStudents.map(studentId => {
                      const student = students.find(s => s.id === studentId)
                      return (
                        <div key={studentId}>
                          <Label htmlFor={`comment-${studentId}`}>
                            {student?.name}
                          </Label>
                          <Textarea
                            id={`comment-${studentId}`}
                            value={comments[studentId] || ''}
                            onChange={(e) => setComments(prev => ({
                              ...prev,
                              [studentId]: e.target.value
                            }))}
                            placeholder="Add comments for this student..."
                            className="mt-1"
                            rows={3}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Report Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>School Name</Label>
                <div className="flex items-center gap-2 p-3 border rounded-md bg-gray-50">
                  <span className="flex-1">{schoolSettings.schoolName || 'School Name'}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goToSettings}
                    className="h-8 w-8 p-0"
                  >
                    <Gear className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="report-period">Reporting Period</Label>
                <Select value={reportPeriod} onValueChange={handleReportPeriodChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {gradingPeriods.map(period => (
                      <SelectItem key={period.id} value={period.id}>
                        {period.name} ({period.startDate} → {period.endDate})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {gradingPeriods.length === 0 && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
                    No grading periods are configured. Add period dates in Settings.
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Attendance Date Range</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    type="date"
                    value={attendanceStartDate}
                    onChange={(e) => setAttendanceStartDate(e.target.value)}
                  />
                  <Input
                    type="date"
                    value={attendanceEndDate}
                    onChange={(e) => setAttendanceEndDate(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Attendance summary (present, tardy, absent, total) will use this range in previews and PDFs.
                </p>
                {attendanceRangeInvalid && (
                  <p className="text-xs text-destructive">Start date must be on or before end date.</p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-comments"
                  checked={includeComments}
                  onCheckedChange={(checked) => setIncludeComments(checked === true)}
                />
                <Label htmlFor="include-comments">Include teacher comments</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-percentage"
                  checked={showPercentage}
                  onCheckedChange={(checked) => setShowPercentage(checked === true)}
                />
                <Label htmlFor="show-percentage">Show overall percentage instead of GPA</Label>
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Subject Report Options</p>
                    <p className="text-xs text-muted-foreground">Order subjects by group, set display mode, and optional primary weighting.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setShowReportOptionsDialog(true)}>
                    Configure
                  </Button>
                </div>
                {primaryWeightingEnabled && (
                  <p className="text-xs text-muted-foreground">
                    Primary weight {primaryWeightPercent}% / Secondary weight {secondaryWeightPercent}%
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Button 
                  onClick={generateReports} 
                  className="w-full"
                  disabled={selectedStudents.length === 0 || isGenerating || attendanceRangeInvalid || attendanceLoading}
                >
                  <FilePdf size={16} className="mr-2" />
                  {isGenerating 
                    ? `Generating ${selectedStudents.length > 1 ? 'ZIP with ' : ''}${selectedStudents.length} PDF${selectedStudents.length > 1 ? 's' : ''}...`
                    : `Generate PDF${selectedStudents.length > 1 ? 's' : ''} (${selectedStudents.length})`
                  }
                </Button>
                
                {selectedStudents.length > 1 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Multiple reports will be packaged in a ZIP file
                  </p>
                )}
                {attendanceLoading && (
                  <p className="text-xs text-muted-foreground text-center">Loading attendance for the selected range…</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye size={18} />
                Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="preview-student">Preview Student</Label>
                <Select value={previewStudent} onValueChange={setPreviewStudent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select student to preview" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredStudents.map(student => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {previewReport && previewStudentData && (
                <div className="space-y-4">
                  <div className="p-4 border border-border rounded-lg bg-muted/30 space-y-3">
                    <div className="text-center border-b border-border pb-3">
                      <h3 className="font-bold text-lg">{previewStudentData.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Report Card - {selectedPeriod ? `${selectedPeriod.name} (${selectedPeriod.startDate} to ${selectedPeriod.endDate})` : reportPeriod}
                      </p>
                      <p className="text-sm font-medium mt-1">
                        Overall GPA: {(previewReport.overallGPA ?? 0).toFixed(2)} ({getLetterGrade(previewReport.overallGPA ?? 0)})
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Subjects</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowCalculationDetails(!showCalculationDetails)}
                          className="text-xs h-6 px-2"
                        >
                          {showCalculationDetails ? 'Hide Details' : 'Show Calculation'}
                        </Button>
                      </div>
                      
                      {previewReport.subjects.map(subject => {
                        // Use filtered grades for the breakdown calculation
                        const filteredGrades = getFilteredGradesForPeriod(reportPeriod)
                        const breakdown = getSubjectCalculationBreakdown(previewStudent, subject.subjectId, subjects, filteredGrades)
                        const periodColumns = (previewReport as any).periodColumns || []
                        const displayMode: SubjectDisplayMode = (subject as any).displayMode || 'percentage'
                        const periodValues: Array<number | null> = (subject as any).periodValues || []
                        const tier: SubjectTier = (subject as any).tier || 'secondary'
                        
                        return (
                          <div key={subject.subjectId} className="space-y-2">
                            <div className="flex flex-col gap-2 text-sm">
                              <div className="flex items-center justify-between">
                                <span>{subject.subjectName}</span>
                                <div className="flex items-center gap-2">
                                  {primaryWeightingEnabled && (
                                    <Badge variant={tier === 'primary' ? 'default' : 'outline'}>
                                      {tier === 'primary' ? 'Primary' : 'Secondary'}
                                    </Badge>
                                  )}
                                  <Badge variant={(subject.average ?? 0) >= 90 ? "default" : (subject.average ?? 0) >= 70 ? "secondary" : "destructive"}>
                                    {subject.letterGrade}
                                  </Badge>
                                </div>
                              </div>
                              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(periodColumns.length, 1)}, minmax(0, 1fr))` }}>
                                {(periodColumns.length > 0 ? periodColumns : [{ id: 'current', label: 'Current' }]).map((column: any, idx: number) => {
                                  const value = periodValues[idx]
                                  const cellValue = (() => {
                                    if (value === null || value === undefined || isNaN(value)) return '—'
                                    if (displayMode === 'letter') return getLetterGrade(value)
                                    if (displayMode === 'gpa') return getGPAPoints(value).toFixed(1)
                                    return `${value.toFixed(1)}%`
                                  })()
                                  return (
                                    <div key={`${subject.subjectId}-${column.id}`} className="rounded border border-border bg-white/50 px-2 py-1 text-xs">
                                      <div className="text-[10px] text-muted-foreground truncate">{column.label}</div>
                                      <div className="font-medium">{cellValue}</div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                            
                            {showCalculationDetails && breakdown && (
                              <div className="ml-4 p-3 bg-muted/50 rounded-md space-y-2 text-xs">
                                <div className="font-medium">Grade Calculation:</div>
                                {breakdown.categories.map((category, idx) => (
                                  <div key={idx} className="space-y-1">
                                    <div className="flex justify-between items-center">
                                      <span className="font-medium">{category.categoryName}:</span>
                                      <span>{category.average.toFixed(1)}% (Weight: {(category.weight * 100).toFixed(0)}%)</span>
                                    </div>
                                    <div className="text-muted-foreground ml-2">
                                      Grades: {category.grades.map(g => g.toFixed(0)).join(', ')}
                                      {category.grades.length > 1 && ` → Avg: ${category.average.toFixed(1)}%`}
                                    </div>
                                    <div className="text-muted-foreground ml-2">
                                      Weighted: {category.average.toFixed(1)}% × {(category.weight * 100).toFixed(0)}% = {category.weightedValue.toFixed(1)}
                                    </div>
                                  </div>
                                ))}
                                <div className="pt-2 border-t border-border">
                                  <div className="font-medium">
                                    Final: {breakdown.categories.map(c => c.weightedValue.toFixed(1)).join(' + ')} 
                                    ÷ {(breakdown.categories.reduce((sum, c) => sum + c.weight, 0) * 100).toFixed(0)}% = {breakdown.finalAverage.toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {showCalculationDetails && previewWeightingBreakdown && (
                        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-2">
                          <div className="font-medium">Subject Weighting Calculation:</div>

                          {previewWeightingBreakdown.mode === 'primary-secondary' ? (
                            <>
                              <div className="text-muted-foreground">
                                Primary group ({Math.round(previewWeightingBreakdown.primaryWeight * 100)}%):
                                {' '}
                                {previewWeightingBreakdown.primarySubjects.length > 0
                                  ? previewWeightingBreakdown.primarySubjects.map(s => `${s.subjectName} (${(s.currentValue as number).toFixed(1)}%)`).join(', ')
                                  : 'No primary subjects selected'}
                              </div>
                              <div className="text-muted-foreground">
                                Secondary group ({Math.round(previewWeightingBreakdown.secondaryWeight * 100)}%):
                                {' '}
                                {previewWeightingBreakdown.secondarySubjects.length > 0
                                  ? previewWeightingBreakdown.secondarySubjects.map(s => `${s.subjectName} (${(s.currentValue as number).toFixed(1)}%)`).join(', ')
                                  : 'No secondary subjects selected'}
                              </div>
                              <div className="pt-2 border-t border-border font-medium">
                                {previewWeightingBreakdown.primaryAverage !== null && previewWeightingBreakdown.secondaryAverage !== null
                                  ? `Final: (${previewWeightingBreakdown.primaryAverage.toFixed(1)}% × ${Math.round(previewWeightingBreakdown.primaryWeight * 100)}%) + (${previewWeightingBreakdown.secondaryAverage.toFixed(1)}% × ${Math.round(previewWeightingBreakdown.secondaryWeight * 100)}%) = ${previewWeightingBreakdown.finalAverage.toFixed(1)}%`
                                  : previewWeightingBreakdown.primaryAverage !== null
                                    ? `Final: primary average only = ${previewWeightingBreakdown.finalAverage.toFixed(1)}%`
                                    : `Final: secondary average only = ${previewWeightingBreakdown.finalAverage.toFixed(1)}%`
                                }
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-muted-foreground">
                                Equal-weight subjects:
                                {' '}
                                {previewWeightingBreakdown.subjects
                                  .map(s => `${s.subjectName} (${(s.currentValue as number).toFixed(1)}%)`)
                                  .join(', ')}
                              </div>
                              <div className="pt-2 border-t border-border font-medium">
                                Final: average of {previewWeightingBreakdown.subjects.length} subjects = {previewWeightingBreakdown.equalAverage.toFixed(1)}%
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {previewReport.attendanceSummary && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-sm">Attendance</h4>
                          <span className="text-xs text-muted-foreground">
                            {previewReport.attendanceSummary.startDate || 'Start'} – {previewReport.attendanceSummary.endDate || 'End'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center justify-between rounded-md border border-border bg-white/40 p-2">
                            <span>Present</span>
                            <Badge variant="secondary">{previewReport.attendanceSummary.present}</Badge>
                          </div>
                          <div className="flex items-center justify-between rounded-md border border-border bg-white/40 p-2">
                            <span>Tardy</span>
                            <Badge variant="secondary">{previewReport.attendanceSummary.tardy}</Badge>
                          </div>
                          <div className="flex items-center justify-between rounded-md border border-border bg-white/40 p-2">
                            <span>Absent</span>
                            <Badge variant="destructive">{previewReport.attendanceSummary.absent}</Badge>
                          </div>
                          <div className="flex items-center justify-between rounded-md border border-border bg-white/40 p-2">
                            <span>Total Days</span>
                            <Badge variant="outline">{previewReport.attendanceSummary.total}</Badge>
                          </div>
                        </div>
                      </div>
                    )}

                    {includeComments && comments[previewStudent] && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Teacher Comments</h4>
                        <p className="text-sm text-muted-foreground">
                          {comments[previewStudent]}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <Button 
                    onClick={previewReportPDF}
                    variant="outline" 
                    className="w-full"
                    size="sm"
                  >
                    <Eye size={16} className="mr-2" />
                    Preview PDF Report
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Grading Scale</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>A+ (97-100%)</span>
                  <span>4.0</span>
                </div>
                <div className="flex justify-between">
                  <span>A (93-96%)</span>
                  <span>4.0</span>
                </div>
                <div className="flex justify-between">
                  <span>A- (90-92%)</span>
                  <span>3.7</span>
                </div>
                <div className="flex justify-between">
                  <span>B+ (87-89%)</span>
                  <span>3.3</span>
                </div>
                <div className="flex justify-between">
                  <span>B (83-86%)</span>
                  <span>3.0</span>
                </div>
                <div className="flex justify-between">
                  <span>B- (80-82%)</span>
                  <span>2.7</span>
                </div>
                <div className="flex justify-between">
                  <span>C+ (77-79%)</span>
                  <span>2.3</span>
                </div>
                <div className="flex justify-between">
                  <span>C (73-76%)</span>
                  <span>2.0</span>
                </div>
                <div className="flex justify-between">
                  <span>C- (70-72%)</span>
                  <span>1.7</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>F (0-59%)</span>
                  <span>0.0</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showReportOptionsDialog} onOpenChange={setShowReportOptionsDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Subject Report Options</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Student Group</Label>
                <Select value={selectedOptionsGroup} onValueChange={setSelectedOptionsGroup}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGroupNames.map(groupName => (
                      <SelectItem key={groupName} value={groupName}>{groupName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="primary-weighting-toggle">Primary subject average weighting</Label>
                  <Switch
                    id="primary-weighting-toggle"
                    checked={primaryWeightingEnabled}
                    onCheckedChange={setPrimaryWeightingEnabled}
                  />
                </div>
                {primaryWeightingEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="primary-weight-slider">Primary weight (%)</Label>
                    <Input
                      id="primary-weight-slider"
                      type="range"
                      min={0}
                      max={100}
                      value={primaryWeightPercent}
                      onChange={(e) => setPrimaryWeightPercent(parseInt(e.target.value || '0', 10))}
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Primary: {primaryWeightPercent}%</span>
                      <span>Secondary: {secondaryWeightPercent}%</span>
                    </div>
                    {weightingSkewedWarning && (
                      <p className="text-xs text-amber-700">Secondary weight is greater than primary weight.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Subject Order and Display (on report cards)</Label>
              {selectedOptionsGroup ? (
                <div className="max-h-[50vh] overflow-y-auto space-y-2 rounded-md border border-border p-2">
                  {getOrderedSubjectsForGroup(selectedOptionsGroup).map((subject, idx, arr) => {
                    const preference = getSubjectPreference(subject.id)
                    return (
                      <div key={subject.id} className="grid gap-2 rounded border border-border bg-muted/30 p-2 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                        <div>
                          <p className="text-sm font-medium">{getSubjectDisplayName(subject)}</p>
                          <p className="text-xs text-muted-foreground">{subject.name}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            disabled={idx === 0}
                            onClick={() => moveSubjectOrder(selectedOptionsGroup, subject.id, 'up')}
                            aria-label="Move subject up"
                          >
                            <CaretUp size={14} />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            disabled={idx === arr.length - 1}
                            onClick={() => moveSubjectOrder(selectedOptionsGroup, subject.id, 'down')}
                            aria-label="Move subject down"
                          >
                            <CaretDown size={14} />
                          </Button>
                        </div>
                        <Select
                          value={preference.displayMode}
                          onValueChange={(value: SubjectDisplayMode) => setSubjectPreference(subject.id, { displayMode: value })}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">Percentage</SelectItem>
                            <SelectItem value="letter">Letter</SelectItem>
                            <SelectItem value="gpa">GPA</SelectItem>
                          </SelectContent>
                        </Select>
                        {primaryWeightingEnabled ? (
                          <div className="flex items-center gap-2 rounded border border-border px-2 py-1">
                            <span className="text-[11px] text-muted-foreground">S</span>
                            <Switch
                              checked={preference.tier === 'primary'}
                              onCheckedChange={(checked) => setSubjectPreference(subject.id, { tier: checked ? 'primary' : 'secondary' })}
                              aria-label="Toggle primary or secondary"
                            />
                            <span className="text-[11px] text-muted-foreground">P</span>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">Primary/secondary hidden (off)</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No groups available.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}