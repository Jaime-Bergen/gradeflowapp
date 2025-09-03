import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Eye, Users, FilePdf, Gear } from "@phosphor-icons/react"
import { Student, Subject, Grade, ReportCard } from '@/lib/types'
import { getLetterGrade, generateReportCard } from '@/lib/reportUtils'
import { toast } from 'sonner'
import { pdf } from '@react-pdf/renderer'
import ReportCardPDF from './ReportCardPDF'
import { apiClient } from '@/lib/api'

export default function Reports() {
  const [students, setStudents] = useState<Student[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [reportPeriod, setReportPeriod] = useState("")
  const [includeComments, setIncludeComments] = useState(true)
  const [comments, setComments] = useState<Record<string, string>>({})
  const [previewStudent, setPreviewStudent] = useState<string>("")
  const [schoolSettings, setSchoolSettings] = useState({
    schoolName: '',
    firstDayOfSchool: '',
    gradingPeriods: 6
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Load all data from API
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Load all data in parallel
      const [studentsRes, subjectsRes, gradesRes] = await Promise.all([
        apiClient.getStudents(),
        apiClient.getSubjects(), 
        apiClient.getGrades()
      ])

      const studentsData = Array.isArray(studentsRes.data) ? studentsRes.data : []
      const subjectsData = Array.isArray(subjectsRes.data) ? subjectsRes.data : []
      const gradesData = Array.isArray(gradesRes.data) ? gradesRes.data : []

      setStudents(studentsData)
      setGrades(gradesData)

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
          gradingPeriods: user.grading_periods || 6
        })
        
        // Auto-select current reporting period
        const currentPeriod = getCurrentReportingPeriod(
          formattedDate, 
          user.grading_periods || 6
        )
        setReportPeriod(currentPeriod)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

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
      return generateReportCard(studentId, reportPeriod, comments, students, subjects, grades)
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
    setSelectedStudents(students.map(s => s.id))
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
          const pdfDoc = <ReportCardPDF reportCard={validatedReportCard} student={student} schoolName={schoolSettings.schoolName} />
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
            const pdfDoc = <ReportCardPDF reportCard={validatedReportCard} student={student} schoolName={schoolSettings.schoolName} />
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

      const pdfDoc = <ReportCardPDF reportCard={validatedReportCard} student={student} schoolName={schoolSettings.schoolName} />
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

  const previewReport = previewStudent ? generateReportCardForStudent(previewStudent) : null
  const previewStudentData = students.find(s => s.id === previewStudent)

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
                  Select All ({students.length})
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  Clear Selection
                </Button>
                <Badge variant="secondary">
                  {selectedStudents.length} selected
                </Badge>
              </div>

              {students.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No students available
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {students.map(student => {
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
                <Select value={reportPeriod} onValueChange={setReportPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getReportingPeriodOptions(schoolSettings.gradingPeriods).map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-comments"
                  checked={includeComments}
                  onCheckedChange={(checked) => setIncludeComments(checked === true)}
                />
                <Label htmlFor="include-comments">Include teacher comments</Label>
              </div>

              <div className="space-y-2">
                <Button 
                  onClick={generateReports} 
                  className="w-full"
                  disabled={selectedStudents.length === 0 || isGenerating}
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
                    {students.map(student => (
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
                      <p className="text-sm text-muted-foreground">Report Card - {reportPeriod}</p>
                      <p className="text-sm font-medium mt-1">
                        Overall GPA: {(previewReport.overallGPA ?? 0).toFixed(2)} ({getLetterGrade(previewReport.overallGPA ?? 0)})
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Subjects</h4>
                      {previewReport.subjects.map(subject => (
                        <div key={subject.subjectId} className="flex justify-between items-center text-sm">
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
                      ))}
                    </div>

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