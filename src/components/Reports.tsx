import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Eye, Users, FilePdf, Gear } from "@phosphor-icons/react"
import { Student, Subject, Grade, ReportCard, AttendanceRecord, AttendanceSummary, GradingPeriod } from '@/lib/types'
import { getLetterGrade, generateReportCard, getSubjectCalculationBreakdown } from '@/lib/reportUtils'
import { toast } from 'sonner'
import { pdf } from '@react-pdf/renderer'
import ReportCardPDF from './ReportCardPDF.tsx'
import { apiClient } from '@/lib/api'

export default function Reports() {
  const [students, setStudents] = useState<Student[]>([])
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([])
  const [studentGroups, setStudentGroups] = useState<any[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [subjectMarkers, setSubjectMarkers] = useState<Record<string, any[]>>({})
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
  const [schoolSettings, setSchoolSettings] = useState({
    schoolName: '',
    firstDayOfSchool: '',
    gradingPeriods: 6,
    gradingMode: 'dates' as 'dates' | 'markers'
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

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

  // Compute marker validation errors using useMemo to avoid infinite loops
  const markerErrors = useMemo(() => {
    if (schoolSettings.gradingMode === 'dates') return [] // date-based mode disables marker validation
    if (!reportPeriod || subjects.length === 0) return []
    
    const periodMatch = reportPeriod.match(/(\d+)$/)
    const periodIndex = periodMatch ? parseInt(periodMatch[1], 10) : 1
    
    const errors: Array<{ subjectId: string; subjectName: string; message: string }> = []
    const subjectsWithGrades = new Set(grades.map(g => g.subjectId).filter((id): id is string => Boolean(id)))
    
    subjectsWithGrades.forEach(subjectId => {
      const subject = subjects.find(s => s.id === subjectId)
      if (!subject) return
      
      const markers = subjectMarkers[subjectId] || []
      const requiredMarkers = periodIndex === 1 ? 1 : periodIndex - 1
      
      if (markers.length < requiredMarkers) {
        errors.push({
          subjectId: subject.id,
          subjectName: subject.name,
          message: `${subject.name} needs at least ${requiredMarkers} marker(s) for this reporting period`
        })
      }
    })
    
    return errors
  }, [reportPeriod, subjects.length, grades.length, Object.keys(subjectMarkers).length, schoolSettings.gradingMode])

  // Load all data from API
  useEffect(() => {
    loadData()
  }, [])

  // Filter data when teacher selection changes or data is updated
  useEffect(() => {
    filterDataByTeacherGroups()
  }, [filterDataByTeacherGroups])

  // Ensure a report period is always selected based on the active grading mode
  useEffect(() => {
    if (schoolSettings.gradingMode === 'dates') {
      if (!reportPeriod && gradingPeriods.length > 0) {
        setReportPeriod(gradingPeriods[0].id)
      }
    } else {
      if (!reportPeriod) {
        const firstOption = getReportingPeriodOptions(schoolSettings.gradingPeriods)[0]
        if (firstOption) {
          setReportPeriod(firstOption.value)
        }
      }
    }
  }, [schoolSettings.gradingMode, schoolSettings.gradingPeriods, gradingPeriods, reportPeriod])

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

      // Load lessons and markers for each subject
      const subjectsWithLessons = await Promise.all(
        subjectsData.map(async (subject) => {
          try {
            const [lessonsRes, markersRes] = await Promise.all([
              apiClient.getLessonsForSubject(subject.id),
              apiClient.getGradingPeriodMarkersForSubject(subject.id)
            ])
            const lessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : []
            const markers = Array.isArray(markersRes.data) ? markersRes.data : []
            
            // Store markers separately
            setSubjectMarkers(prev => ({ ...prev, [subject.id]: markers }))
            
            return { ...subject, lessons }
          } catch (error) {
            console.warn(`Failed to load lessons/markers for subject ${subject.name}:`, error)
            return { ...subject, lessons: [] }
          }
        })
      )

      setSubjects(subjectsWithLessons)

      // Also load settings
      await loadSettings()
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

        const persistedMode = localStorage.getItem('gradeflow-grading-mode') as 'dates' | 'markers' | null
        const hasConfiguredPeriods = gradingPeriods.length > 0
        const resolvedMode: 'dates' | 'markers' = (user as any)?.grading_mode === 'markers'
          ? 'markers'
          : (user as any)?.grading_mode === 'dates'
            ? 'dates'
            : persistedMode === 'markers' || persistedMode === 'dates'
              ? persistedMode
              : hasConfiguredPeriods
                ? 'dates'
                : 'markers'
        
        setSchoolSettings({
          schoolName: user.school_name || 'School Name',
          firstDayOfSchool: formattedDate,
          gradingPeriods: user.grading_periods || 6,
          gradingMode: resolvedMode
        })

        // Persist locally as a fallback when backend omits grading_mode
        localStorage.setItem('gradeflow-grading-mode', resolvedMode)

        const today = new Date().toISOString().split('T')[0]
        setAttendanceStartDate(prev => prev || formattedDate || today)
        setAttendanceEndDate(prev => prev || today)
        
        // Auto-select current reporting period
        if (resolvedMode === 'dates' && gradingPeriods.length > 0) {
          const currentPeriod = getCurrentReportingPeriod(
            formattedDate, 
            user.grading_periods || 6
          )
          setReportPeriod(prev => prev || currentPeriod)
        } else if (resolvedMode === 'markers') {
          const firstOption = getReportingPeriodOptions(user.grading_periods || 6)[0]
          setReportPeriod(prev => prev || firstOption?.value || 'q1')
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

  // Calculate current reporting period based on today's date and first day of school
  const getCurrentReportingPeriod = (firstDayOfSchool: string, gradingPeriods: number): string => {
    if (!firstDayOfSchool) return getReportingPeriodOptions(gradingPeriods)[0]?.value || ''
    
    const schoolStart = new Date(firstDayOfSchool)
    const today = new Date()
    const daysDiff = Math.floor((today.getTime() - schoolStart.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysDiff < 0) return getReportingPeriodOptions(gradingPeriods)[0]?.value || ''
    
    let periodLength: number
    switch (gradingPeriods) {
      case 3: // Trimesters
        periodLength = 120 // ~4 months
        break
      case 4: // Quarters  
        periodLength = 90 // ~3 months
        break
      case 6: // Six weeks
        periodLength = 42 // 6 weeks
        break
      default:
        periodLength = 42
    }
    
    const currentPeriod = Math.floor(daysDiff / periodLength) + 1
    const maxPeriod = gradingPeriods
    const safePeriod = Math.min(Math.max(currentPeriod, 1), maxPeriod)
    
    const options = getReportingPeriodOptions(gradingPeriods)
    return options[safePeriod - 1]?.value || options[0]?.value || ''
  }

  // Generate reporting period options based on grading periods setting
  const getReportingPeriodOptions = (gradingPeriods: number) => {
    switch (gradingPeriods) {
      case 3:
        return [
          { value: 't1', label: '1st Trimester' },
          { value: 't2', label: '2nd Trimester' },
          { value: 't3', label: '3rd Trimester' }
        ]
      case 4:
        return [
          { value: 'q1', label: '1st Quarter' },
          { value: 'q2', label: '2nd Quarter' },
          { value: 'q3', label: '3rd Quarter' },
          { value: 'q4', label: '4th Quarter' }
        ]
      case 6:
        return [
          { value: 'sw1', label: '1st Six Weeks' },
          { value: 'sw2', label: '2nd Six Weeks' },
          { value: 'sw3', label: '3rd Six Weeks' },
          { value: 'sw4', label: '4th Six Weeks' },
          { value: 'sw5', label: '5th Six Weeks' },
          { value: 'sw6', label: '6th Six Weeks' }
        ]
      default:
        return [{ value: 'current', label: 'Current Period' }]
    }
  }

  const goToSettings = () => {
    // Navigate to Admin tab first
    window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab: 'admin' } }))
    // Then select the Settings tab within Admin after a brief delay
    setTimeout(() => {
      window?.dispatchEvent(new CustomEvent('gradeflow-admin-goto-settings'))
    }, 100)
  }

  const goToSubjectAndAddMarker = (subjectId: string) => {
    // Navigate to Subjects tab
    window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab: 'subjects' } }))
    // After a brief delay, expand the subject and highlight the add marker button
    setTimeout(() => {
      window?.dispatchEvent(new CustomEvent('gradeflow-subjects-expand-and-highlight', { 
        detail: { subjectId, action: 'add-marker' } 
      }))
    }, 100)
  }

  // Get lesson order_index range based on report period and markers
  const getLessonRangeForPeriod = (subjectId: string, periodIndex: number): { min: number; max: number | null } | null => {
    const markers = subjectMarkers[subjectId] || []
    
    // Sort markers by order_index
    const sortedMarkers = [...markers].sort((a, b) => 
      ((a as any).order_index ?? 0) - ((b as any).order_index ?? 0)
    )
    
    // Period 1: From start (1) to first marker
    if (periodIndex === 1) {
      if (sortedMarkers.length === 0) {
        return null // No markers defined
      }
      return { 
        min: 1, 
        max: (sortedMarkers[0] as any).order_index 
      }
    }
    
    // Last period: From last marker onwards
    if (periodIndex > sortedMarkers.length) {
      if (sortedMarkers.length === 0) {
        return null // No markers defined
      }
      return { 
        min: (sortedMarkers[sortedMarkers.length - 1] as any).order_index + 1, 
        max: null // No upper limit
      }
    }
    
    // Middle periods: Between two markers
    if (periodIndex > 1 && periodIndex <= sortedMarkers.length) {
      const startMarkerIndex = periodIndex - 2 // Previous marker
      const endMarkerIndex = periodIndex - 1   // Current marker
      
      return {
        min: (sortedMarkers[startMarkerIndex] as any).order_index + 1,
        max: (sortedMarkers[endMarkerIndex] as any).order_index
      }
    }
    
    return null
  }

  // Helper function to filter grades based on markers for the selected reporting period
  const getFilteredGradesForPeriod = (): Grade[] => {
    // If grading mode is date-based, use date filtering when periods exist
    if (schoolSettings.gradingMode === 'dates') {
      if (gradingPeriods.length === 0) return []
      const period = gradingPeriods.find(p => p.id === reportPeriod) || gradingPeriods[0]
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
    }

    // Fallback to marker-based filtering for legacy data
    if (markerErrors.length > 0) return []
    const periodMatch = reportPeriod.match(/(\d+)$/)
    const periodIndex = periodMatch ? parseInt(periodMatch[1], 10) : 1

    return grades.filter(grade => {
      if (!grade.subjectId) return false
      const range = getLessonRangeForPeriod(grade.subjectId, periodIndex)
      if (!range) return false
      const subject = subjects.find(s => s.id === grade.subjectId)
      if (!subject || !subject.lessons) return false
      const lesson = subject.lessons.find(l => l.id === grade.lessonId)
      if (!lesson) return false
      const orderIndex = (lesson as any).order_index ?? lesson.orderIndex ?? 0
      if (range.max === null) {
        return orderIndex >= range.min
      }
      return orderIndex >= range.min && orderIndex <= range.max
    })
  }

  const handleReportPeriodChange = (value: string) => {
    setReportPeriod(value)
    if (schoolSettings.gradingMode === 'dates') {
      const period = gradingPeriods.find(p => p.id === value)
      if (period) {
        setAttendanceStartDate(period.startDate)
        setAttendanceEndDate(period.endDate)
      }
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
      
      if (schoolSettings.gradingMode === 'dates' && gradingPeriods.length === 0) {
        console.warn('Date-based grading mode selected but no grading periods are configured')
        return null
      }

      // Check if there are marker validation errors
      if (schoolSettings.gradingMode === 'markers' && markerErrors.length > 0) {
        console.warn('Marker validation errors:', markerErrors)
        return null
      }
      
      // Get filtered grades for the selected period
      const filteredGrades = getFilteredGradesForPeriod()

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

      const baseReport = generateReportCard(studentId, displayPeriod, comments, students, subjects, filteredGrades)
      if (!baseReport) return null

      const attendanceSummary = getAttendanceSummaryForStudent(studentId)
      return { ...baseReport, attendanceSummary }
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
    Object.keys(subjectMarkers).length,
    // Create a stable key from subjects with lessons
    subjects.map(s => `${s.id}:${s.lessons?.length || 0}`).join(','),
    schoolSettings.gradingMode
  ])
  
  const previewStudentData = students.find(s => s.id === previewStudent)
  const attendanceRangeInvalid = Boolean(
    attendanceStartDate &&
    attendanceEndDate &&
    new Date(attendanceStartDate) > new Date(attendanceEndDate)
  )
  const selectedPeriod = schoolSettings.gradingMode === 'dates'
    ? gradingPeriods.find(p => p.id === reportPeriod)
    : undefined

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
                    {schoolSettings.gradingMode === 'dates' && gradingPeriods.length > 0
                      ? gradingPeriods.map(period => (
                          <SelectItem key={period.id} value={period.id}>
                            {period.name} ({period.startDate} → {period.endDate})
                          </SelectItem>
                        ))
                      : getReportingPeriodOptions(schoolSettings.gradingPeriods).map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
                
                {/* Display marker validation errors (legacy only) */}
                {schoolSettings.gradingMode === 'markers' && markerErrors.length > 0 && (
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm font-medium text-red-800 mb-1">⚠️ Missing Grading Period Markers:</p>
                    <ul className="text-sm text-red-700 space-y-1">
                      {markerErrors.map((error, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <span>•</span>
                          <span>{error.message}</span>
                          <button
                            onClick={() => goToSubjectAndAddMarker(error.subjectId)}
                            className="text-red-800 underline hover:text-red-900 font-medium text-xs"
                          >
                            Add Marker →
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-red-600 mt-2">
                      Click "Add Marker →" to go to the Subjects tab and add the required markers.
                    </p>
                  </div>
                )}

                {schoolSettings.gradingMode === 'dates' && gradingPeriods.length === 0 && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900">
                    No grading periods are configured. Add periods in Settings or switch to marker mode.
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
                        const filteredGrades = getFilteredGradesForPeriod()
                        const breakdown = getSubjectCalculationBreakdown(previewStudent, subject.subjectId, subjects, filteredGrades)
                        
                        return (
                          <div key={subject.subjectId} className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                              <span>{subject.subjectName}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant={(subject.average ?? 0) >= 90 ? "default" : (subject.average ?? 0) >= 70 ? "secondary" : "destructive"}>
                                  {subject.letterGrade}
                                </Badge>
                                <span className="text-muted-foreground">
                                  {(subject.average ?? 0).toFixed(1)}%
                                </span>
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
    </div>
  )
}