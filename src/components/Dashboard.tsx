import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { 
  Users, 
  BookOpen, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Clock
} from "lucide-react"
import { Student, Subject, Grade } from '@/lib/types'

export default function Dashboard() {
  const [students, setStudents] = useState<Student[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [lessons, setLessons] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [currentGradingPeriod, setCurrentGradingPeriod] = useState(1)

  // Helper function to determine grading period based on date
  const getGradingPeriod = (date: Date): number => {
    const schoolYearStart = new Date(date.getFullYear(), 7, 15) // August 15th
    if (date < schoolYearStart) {
      // If date is before August 15th, it's from previous school year
      schoolYearStart.setFullYear(date.getFullYear() - 1)
    }
    
    const daysDiff = Math.floor((date.getTime() - schoolYearStart.getTime()) / (1000 * 60 * 60 * 24))
    const period = Math.floor(daysDiff / 42) + 1 // 42 days = 6 weeks
    return Math.min(Math.max(period, 1), 6) // Clamp between 1 and 6
  }

  // Get current grading period based on today's date
  const getCurrentGradingPeriod = (): number => {
    return getGradingPeriod(new Date())
  }

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const studentsRes = await apiClient.getStudents()
      setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : [])

      const subjectsRes = await apiClient.getSubjects()
      const subjectsList = Array.isArray(subjectsRes.data) ? subjectsRes.data : []
      setSubjects(subjectsList)

      // Fetch all grades at once (same as GradeEntry component)
      const gradesRes = await apiClient.getGrades()
      if (gradesRes.error) {
        console.error('Failed to fetch grades:', gradesRes.error)
        setGrades([])
      } else {
        setGrades(Array.isArray(gradesRes.data) ? gradesRes.data : [])
      }

      // Fetch lessons for subjects that have grades
      const subjectsWithGrades = subjectsList.filter(subject => 
        Array.isArray(gradesRes.data) && gradesRes.data.some((grade: any) => grade.subjectId === subject.id)
      )
      
      const lessonsMap: Record<string, any[]> = {}
      await Promise.all(
        subjectsWithGrades.map(async (subject) => {
          const lessonsRes = await apiClient.getLessonsForSubject(subject.id)
          if (Array.isArray(lessonsRes.data)) {
            lessonsMap[subject.id] = lessonsRes.data
          }
        })
      )
      setLessons(lessonsMap)

      // Set current grading period
      setCurrentGradingPeriod(getCurrentGradingPeriod())

      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    )
  }

  const totalStudents = students.length
  const totalSubjects = subjects.length

  // Filter grades for current grading period
  const currentPeriodGrades = grades.filter(grade => {
    const gradeDate = new Date(grade.date)
    return getGradingPeriod(gradeDate) === currentGradingPeriod
  })

  // Calculate class average for current grading period
  const averageGrade = currentPeriodGrades.length > 0 
    ? currentPeriodGrades.filter(grade => !grade.skipped).reduce((sum, grade) => {
        const percentage = typeof grade.percentage === 'string' ? parseFloat(grade.percentage) : (grade.percentage || 0)
        return sum + percentage
      }, 0) / currentPeriodGrades.filter(grade => !grade.skipped).length
    : 0

  // Students at risk based on current grading period
  const studentsAtRisk = students.filter(student => {
    const studentGrades = currentPeriodGrades.filter(g => g.studentId === student.id && !g.skipped)
    if (studentGrades.length === 0) return false
    const studentAverage = studentGrades.reduce((sum, grade) => {
      const percentage = typeof grade.percentage === 'string' ? parseFloat(grade.percentage) : (grade.percentage || 0)
      return sum + percentage
    }, 0) / studentGrades.length
    return studentAverage < 70
  })

  const recentGrades = grades
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  // Helper function to get grading period name
  const getGradingPeriodName = (period: number): string => {
    const periodNames = [
      '1st Six Weeks',
      '2nd Six Weeks', 
      '3rd Six Weeks',
      '4th Six Weeks',
      '5th Six Weeks',
      '6th Six Weeks'
    ]
    return periodNames[period - 1] || `Period ${period}`
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
            <p className="text-xs text-muted-foreground">
              Across {totalSubjects} subjects
            </p>
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

        <Card className="cursor-pointer" onClick={() => navigateToTab('grades')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Class Average</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(typeof averageGrade === 'number' && !isNaN(averageGrade) ? averageGrade : 0).toFixed(1)}%
            </div>
            <div className="flex items-center justify-between mt-2">
              <Progress value={typeof averageGrade === 'number' && !isNaN(averageGrade) ? averageGrade : 0} className="flex-1 mr-2" />
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
                  {currentGradingPeriod}/6
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation() // Prevent card click navigation
                    setCurrentGradingPeriod(Math.min(6, currentGradingPeriod + 1))
                  }}
                  disabled={currentGradingPeriod >= 6}
                  className="text-xs px-1 py-0.5 rounded bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  →
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {getGradingPeriodName(currentGradingPeriod)} • {currentPeriodGrades.filter(g => !g.skipped).length} grades
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer" onClick={() => navigateToTab('grades')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{studentsAtRisk.length}</div>
            <p className="text-xs text-muted-foreground">
              Students below 70%
            </p>
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
                  const student = students.find(s => s.id === grade.studentId)
                  const subject = subjects.find(s => s.id === grade.subjectId)
                  const lesson = lessons[grade.subjectId || '']?.find((l: any) => l.id === grade.lessonId)
                  return (
                    <div key={`${grade.id}-${index}`} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{student?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {subject?.name} - {lesson?.name || `Lesson ${grade.lessonId.slice(-8)}`}
                        </p>
                      </div>
                      <div className="text-right">
                        {grade.skipped ? (
                          <Badge variant="outline">SKIP</Badge>
                        ) : (() => {
                          const percentage = typeof grade.percentage === 'string' ? parseFloat(grade.percentage) : (grade.percentage || 0);
                          return (
                            <Badge variant={percentage >= 90 ? "default" : percentage >= 70 ? "secondary" : "destructive"}>
                              {percentage.toFixed(0)}%
                            </Badge>
                          );
                        })()}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(grade.date).toLocaleDateString()}
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle size={20} />
              Students Needing Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            {studentsAtRisk.length === 0 ? (
              <div className="text-center py-4">
                <CheckCircle size={32} className="mx-auto text-secondary mb-2" />
                <p className="text-muted-foreground">All students performing well!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {studentsAtRisk.slice(0, 5).map((student) => {
                  const studentGrades = grades.filter(g => g.studentId === student.id && !g.skipped)
                  const average = studentGrades.length > 0 
                    ? studentGrades.reduce((sum, grade) => {
                        const percentage = grade.percentage || 0
                        return sum + percentage
                      }, 0) / studentGrades.length
                    : 0
                  
                  // Calculate subjects for this student from grades
                  const studentSubjects = [...new Set(grades
                    .filter(g => g.studentId === student.id)
                    .map(g => g.subjectId)
                  )].filter(Boolean)
                  
                  return (
                    <div key={student.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="font-medium text-sm">{student.name}</p>
                        <p className="text-xs text-muted-foreground">{studentSubjects.length} subjects</p>
                      </div>
                      <Badge variant="destructive">
                        {(typeof average === 'number' && !isNaN(average) ? average : 0).toFixed(0)}%
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}