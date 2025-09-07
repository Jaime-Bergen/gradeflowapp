import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { Student, ReportCard } from '@/lib/types'
import { formatReportPeriod } from '@/lib/reportUtils'

// Use default font supported by @react-pdf/renderer

const styles = StyleSheet.create({
  page: {
    fontSize: 11,
    paddingTop: 35,
    paddingBottom: 65,
    paddingHorizontal: 35,
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 20,
    textAlign: 'center',
    paddingBottom: 10,
    borderBottom: '2px solid #1e40af',
  },
  schoolName: {
    fontSize: 24,
    color: '#1e40af',
    marginBottom: 5,
  },
  reportTitle: {
    fontSize: 16,
    color: '#374151',
  },
  semester: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 5,
  },
  studentInfo: {
    flexDirection: 'row',
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    border: '1px solid #e2e8f0',
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    fontSize: 18,
    color: '#1f2937',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  infoLabel: {
    width: 80,
    fontSize: 10,
    color: '#4b5563',
  },
  infoValue: {
    fontSize: 10,
    color: '#1f2937',
  },
  gpaSection: {
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeft: '1px solid #d1d5db',
    paddingLeft: 20,
  },
  gpaLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 5,
  },
  gpa: {
    fontSize: 28,
    color: '#059669',
  },
  gradeLevel: {
    fontSize: 16,
    color: '#374151',
    marginTop: 5,
  },
  gradesSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    color: '#1f2937',
    marginBottom: 10,
    paddingBottom: 5,
    borderBottom: '1px solid #e5e7eb',
  },
  table: {
    border: '1px solid #d1d5db',
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    padding: 8,
    borderBottom: '1px solid #d1d5db',
  },
  tableHeaderText: {
    fontSize: 10,
    color: '#374151',
  },
  subjectCol: { width: '40%' },
  percentCol: { width: '20%', textAlign: 'center' },
  gradeCol: { width: '20%', textAlign: 'center' },
  pointsCol: { width: '20%', textAlign: 'center' },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottom: '1px solid #e5e7eb',
  },
  tableCell: {
    fontSize: 10,
    color: '#374151',
  },
  tableCellCenter: {
    fontSize: 10,
    color: '#374151',
    textAlign: 'center',
  },
  gradeA: { color: '#059669' },
  gradeB: { color: '#0d9488' },
  gradeC: { color: '#ca8a04' },
  gradeD: { color: '#dc2626' },
  gradeF: { color: '#dc2626' },
  commentsSection: {
    marginTop: 20,
  },
  commentsBox: {
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: 15,
    backgroundColor: '#fefefe',
  },
  commentsTitle: {
    fontSize: 12,
    color: '#374151',
    marginBottom: 8,
  },
  commentsText: {
    fontSize: 10,
    color: '#4b5563',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 35,
    right: 35,
    paddingTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1px solid #e5e7eb',
  },
  signature: {
    width: '45%',
  },
  signatureLine: {
    borderTop: '1px solid #9ca3af',
    width: '100%',
    marginBottom: 5,
  },
  signatureLabel: {
    fontSize: 9,
    color: '#6b7280',
  },
  dateInfo: {
    fontSize: 9,
    color: '#6b7280',
    textAlign: 'right',
  },
  gradingScale: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    border: '1px solid #e2e8f0',
  },
  scaleTitle: {
    fontSize: 12,
    color: '#374151',
    marginBottom: 8,
  },
  scaleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  scaleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '48%',
    marginBottom: 2,
  },
  scaleGrade: {
    fontSize: 9,
    color: '#4b5563',
  },
  scaleRange: {
    fontSize: 9,
    color: '#6b7280',
  },
})

interface ReportCardPDFProps {
  student: Student
  reportCard: ReportCard
  schoolName?: string
  showPercentage?: boolean
}

const getGPAPoints = (percentage: number): number => {
  // Ensure percentage is a valid number
  if (typeof percentage !== 'number' || isNaN(percentage)) {
    return 0.0
  }
  
  if (percentage >= 97) return 4.0  // A+
  if (percentage >= 93) return 4.0  // A
  if (percentage >= 90) return 3.7  // A-
  if (percentage >= 87) return 3.3  // B+
  if (percentage >= 83) return 3.0  // B
  if (percentage >= 80) return 2.7  // B-
  if (percentage >= 77) return 2.3  // C+
  if (percentage >= 73) return 2.0  // C
  if (percentage >= 70) return 1.7  // C-
  if (percentage >= 67) return 1.3  // D+
  if (percentage >= 65) return 1.0  // D
  if (percentage >= 60) return 0.7  // D-
  return 0.0  // F
}

const getLetterGrade = (percentage: number): string => {
  // Ensure percentage is a valid number
  if (typeof percentage !== 'number' || isNaN(percentage)) {
    return 'N/A'
  }
  
  if (percentage >= 93) return 'A'
  if (percentage >= 90) return 'A-'
  if (percentage >= 87) return 'B+'
  if (percentage >= 83) return 'B'
  if (percentage >= 80) return 'B-'
  if (percentage >= 77) return 'C+'
  if (percentage >= 73) return 'C'
  if (percentage >= 70) return 'C-'
  if (percentage >= 67) return 'D+'
  if (percentage >= 65) return 'D'
  if (percentage >= 60) return 'D-'
  return 'F'
}

const getGradeStyle = (grade: string) => {
  switch (grade) {
    case 'A':
    case 'A-':
      return styles.gradeA
    case 'B+':
    case 'B':
    case 'B-':
      return styles.gradeB
    case 'C+':
    case 'C':
    case 'C-':
      return styles.gradeC
    case 'D+':
    case 'D':
    case 'D-':
      return styles.gradeD
    case 'F':
      return styles.gradeF
    default:
      return {}
  }
}

const ReportCardPDF: React.FC<ReportCardPDFProps> = ({ student, reportCard, schoolName = "Lincoln Elementary School", showPercentage = true }) => {
  // Add safety checks for required props
  if (!student || !reportCard) {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.schoolName}>Error</Text>
            <Text style={styles.reportTitle}>Unable to generate report</Text>
            <Text style={styles.semester}>Missing required data</Text>
          </View>
        </Page>
      </Document>
    )
  }

  const currentYear = new Date().getFullYear()
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.schoolName}>{schoolName}</Text>
          <Text style={styles.reportTitle}>Academic Report Card</Text>
          <Text style={styles.semester}>
            {formatReportPeriod(reportCard.period)} • {currentYear}-{currentYear + 1} School Year
          </Text>
        </View>

        {/* Student Information */}
        <View style={styles.studentInfo}>
          <View style={styles.studentDetails}>
            <Text style={styles.studentName}>{student.name || 'Unknown Student'}</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Subjects:</Text>
              <Text style={styles.infoValue}>{reportCard.subjects.length}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Class:</Text>
              <Text style={styles.infoValue}>{student.group_name || student.grade || 'N/A'}</Text>
            </View>
          </View>
          <View style={styles.gpaSection}>
            <Text style={styles.gpaLabel}>{showPercentage ? 'Overall Percentage' : 'Overall GPA'}</Text>
            <Text style={styles.gpa}>
              {(() => {
                const gpa = typeof reportCard.overallGPA === 'number' && !isNaN(reportCard.overallGPA) && isFinite(reportCard.overallGPA) 
                  ? reportCard.overallGPA 
                  : 0
                
                if (showPercentage) {
                  return `${gpa.toFixed(1)}%`
                } else {
                  const gpaPoints = getGPAPoints(gpa)
                  return typeof gpaPoints === 'number' ? gpaPoints.toFixed(2) : '0.00'
                }
              })()}
            </Text>
            <Text style={styles.gradeLevel}>
              {getLetterGrade(typeof reportCard.overallGPA === 'number' ? reportCard.overallGPA : 0)}
            </Text>
          </View>
        </View>

        {/* Grades Table */}
        <View style={styles.gradesSection}>
          <Text style={styles.sectionTitle}>Academic Performance</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.subjectCol]}>Subject</Text>
              <Text style={[styles.tableHeaderText, styles.percentCol]}>Percentage</Text>
              <Text style={[styles.tableHeaderText, styles.gradeCol]}>Grade</Text>
              <Text style={[styles.tableHeaderText, styles.pointsCol]}>{showPercentage ? 'Percentage' : 'Points'}</Text>
            </View>
            {reportCard.subjects && Array.isArray(reportCard.subjects) && reportCard.subjects.length > 0 ? reportCard.subjects.map((subject, index) => {
              // Add comprehensive safety checks for undefined values
              if (!subject) {
                return (
                  <View key={`empty-subject-${index}`} style={styles.tableRow}>
                    <Text style={[styles.tableCell, styles.subjectCol]}>Invalid Subject</Text>
                    <Text style={[styles.tableCellCenter, styles.percentCol]}>0.0%</Text>
                    <Text style={[styles.tableCellCenter, styles.gradeCol]}>N/A</Text>
                    <Text style={[styles.tableCellCenter, styles.pointsCol]}>{showPercentage ? '0.0%' : '0.0'}</Text>
                  </View>
                )
              }

              const rawAverage = subject.average
              const average = typeof rawAverage === 'number' && !isNaN(rawAverage) && isFinite(rawAverage) ? rawAverage : 0
              const letterGrade = getLetterGrade(average)
              const gpaPoints = getGPAPoints(average)
              const safeGpaPoints = typeof gpaPoints === 'number' && !isNaN(gpaPoints) && isFinite(gpaPoints) ? gpaPoints : 0
              
              return (
                <View key={subject.subjectId || `subject-${index}`} style={styles.tableRow}>
                  <Text style={[styles.tableCell, styles.subjectCol]}>{subject.subjectName || 'Unknown Subject'}</Text>
                  <Text style={[styles.tableCellCenter, styles.percentCol]}>
                    {average.toFixed(1)}%
                  </Text>
                  <Text style={[
                    styles.tableCellCenter, 
                    styles.gradeCol, 
                    getGradeStyle(letterGrade)
                  ]}>
                    {letterGrade}
                  </Text>
                  <Text style={[styles.tableCellCenter, styles.pointsCol]}>
                    {showPercentage ? `${average.toFixed(1)}%` : safeGpaPoints.toFixed(1)}
                  </Text>
                </View>
              )
            }) : (
              <View style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.subjectCol]}>No subjects available</Text>
                <Text style={[styles.tableCellCenter, styles.percentCol]}>--</Text>
                <Text style={[styles.tableCellCenter, styles.gradeCol]}>--</Text>
                <Text style={[styles.tableCellCenter, styles.pointsCol]}>--</Text>
              </View>
            )}
          </View>
        </View>

        {/* Comments Section */}
        {reportCard.comments && (
          <View style={styles.commentsSection}>
            <Text style={styles.sectionTitle}>Teacher Comments</Text>
            <View style={styles.commentsBox}>
              <Text style={styles.commentsText}>{reportCard.comments}</Text>
            </View>
          </View>
        )}

        {/* Grading Scale */}
        <View style={styles.gradingScale}>
          <Text style={styles.scaleTitle}>Grading Scale</Text>
          <View style={styles.scaleGrid}>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>A</Text>
              <Text style={styles.scaleRange}>93-100%</Text>
            </View>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>A-</Text>
              <Text style={styles.scaleRange}>90-92%</Text>
            </View>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>B+</Text>
              <Text style={styles.scaleRange}>87-89%</Text>
            </View>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>B</Text>
              <Text style={styles.scaleRange}>83-86%</Text>
            </View>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>B-</Text>
              <Text style={styles.scaleRange}>80-82%</Text>
            </View>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>C+</Text>
              <Text style={styles.scaleRange}>77-79%</Text>
            </View>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>C</Text>
              <Text style={styles.scaleRange}>73-76%</Text>
            </View>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>C-</Text>
              <Text style={styles.scaleRange}>70-72%</Text>
            </View>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>D+</Text>
              <Text style={styles.scaleRange}>67-69%</Text>
            </View>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>D</Text>
              <Text style={styles.scaleRange}>65-66%</Text>
            </View>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>D-</Text>
              <Text style={styles.scaleRange}>60-64%</Text>
            </View>
            <View style={styles.scaleItem}>
              <Text style={styles.scaleGrade}>F</Text>
              <Text style={styles.scaleRange}>Below 60%</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.signature}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Teacher Signature</Text>
          </View>
          <View style={styles.signature}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Parent/Guardian Signature</Text>
          </View>
          <View style={styles.dateInfo}>
            <Text style={styles.signatureLabel}>Date: {reportDate}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export default ReportCardPDF