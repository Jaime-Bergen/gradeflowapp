import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { apiClient } from '@/lib/api'
import { AttendanceRecord, AttendanceStatus, Student } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { CheckCircle2, Clock3, MinusCircle, XCircle } from 'lucide-react'

const statusOptions: { value: AttendanceStatus; label: string; icon: ReactElement }[] = [
  { value: 'present', label: 'Present', icon: <CheckCircle2 className="h-4 w-4" /> },
  { value: 'tardy', label: 'Tardy', icon: <Clock3 className="h-4 w-4" /> },
  { value: 'absent', label: 'Absent', icon: <XCircle className="h-4 w-4" /> },
  { value: 'excused', label: 'Excused', icon: <MinusCircle className="h-4 w-4" /> }
]

const statusVariants: Record<AttendanceStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  present: 'default',
  tardy: 'secondary',
  absent: 'destructive',
  excused: 'outline'
}

export default function Attendance() {
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [students, setStudents] = useState<Student[]>([])
  const [studentGroups, setStudentGroups] = useState<any[]>([])
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([])
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const filterStudentsByTeacherGroups = useCallback(() => {
    const selectedGroupIds = window.SELECTED_TEACHER_GROUPS

    if (studentGroups.length === 0) {
      setFilteredStudents(students)
      return
    }

    if (!selectedGroupIds || selectedGroupIds.length === 0) {
      setFilteredStudents(students)
      return
    }

    const teacherGroupNames = studentGroups
      .filter(group => selectedGroupIds.includes(group.id))
      .map(group => group.name)

    const filtered = students.filter(student => {
      if (!student.group_name) return false
      const studentGroupNames = student.group_name.split(',').map(g => g.trim())
      return studentGroupNames.some(g => teacherGroupNames.includes(g))
    })

    setFilteredStudents(filtered)
  }, [students, studentGroups])

  const fetchStudents = useCallback(async () => {
    try {
      const studentsRes = await apiClient.getStudents()
      const studentsData = Array.isArray(studentsRes.data)
        ? studentsRes.data
        : (studentsRes.data as any)?.students || []
      setStudents(studentsData)

      const groupsRes = await apiClient.getStudentGroups()
      const groupData = Array.isArray(groupsRes.data) ? groupsRes.data : (groupsRes.data as any)?.groups || []
      setStudentGroups(groupData)
    } catch (error) {
      console.error('Failed to fetch students for attendance', error)
      toast.error('Could not load students')
    }
  }, [])

  const fetchAttendance = useCallback(async (dateValue: string) => {
    setLoading(true)
    try {
      const res = await apiClient.getAttendance({ date: dateValue })
      const rawData = Array.isArray(res.data) ? res.data : (res.data as any)?.data || []
      const mapped: Record<string, AttendanceRecord> = {}
      rawData.forEach((record: any) => {
        const normalized: AttendanceRecord = {
          id: record.id,
          studentId: record.studentId || record.student_id,
          date: record.date,
          status: record.status,
          notes: record.notes ?? '',
          student_name: record.student_name,
          created_at: record.created_at,
          updated_at: record.updated_at
        }
        if (normalized.studentId) {
          mapped[normalized.studentId] = normalized
        }
      })
      setAttendanceMap(mapped)
    } catch (error) {
      console.error('Failed to fetch attendance', error)
      toast.error('Could not load attendance for the selected date')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  useEffect(() => {
    filterStudentsByTeacherGroups()
  }, [students, studentGroups, filterStudentsByTeacherGroups])

  useEffect(() => {
    fetchAttendance(selectedDate)
  }, [selectedDate, fetchAttendance])

  const statusCounts = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      tardy: 0,
      absent: 0,
      excused: 0
    }
    filteredStudents.forEach(student => {
      const status = attendanceMap[student.id]?.status as AttendanceStatus | undefined
      if (status && counts[status] !== undefined) {
        counts[status] += 1
      }
    })
    return counts
  }, [attendanceMap, filteredStudents])

  const updateStatus = (studentId: string, status: AttendanceStatus) => {
    setAttendanceMap(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { studentId, date: selectedDate }),
        studentId,
        date: selectedDate,
        status
      }
    }))
  }

  const updateNote = (studentId: string, note: string) => {
    setAttendanceMap(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { studentId, date: selectedDate }),
        studentId,
        date: selectedDate,
        notes: note
      }
    }))
  }

  const markAllPresent = () => {
    const updated: Record<string, AttendanceRecord> = { ...attendanceMap }
    filteredStudents.forEach(student => {
      updated[student.id] = {
        ...(updated[student.id] || { studentId: student.id, date: selectedDate }),
        studentId: student.id,
        date: selectedDate,
        status: 'present'
      }
    })
    setAttendanceMap(updated)
  }

  const handleSave = async () => {
    const payload = Object.values(attendanceMap)
      .filter(record => record.status)
      .map(record => ({
        studentId: record.studentId,
        date: selectedDate,
        status: record.status,
        notes: record.notes ?? ''
      }))

    if (payload.length === 0) {
      toast.warning('No attendance changes to save')
      return
    }

    setSaving(true)
    const res = await apiClient.upsertAttendance(payload)
    setSaving(false)

    if (res.error) {
      toast.error('Failed to save attendance')
      return
    }

    toast.success(`Saved attendance for ${payload.length} students`)
    fetchAttendance(selectedDate)
  }

  const hasData = filteredStudents.length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Attendance</h2>
          <p className="text-muted-foreground">Mark daily presence, tardiness, and absence</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Date</span>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-48"
            />
          </div>
          <Button variant="secondary" onClick={markAllPresent} disabled={!hasData || loading}>
            Mark all present
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || !hasData}>
            {saving ? 'Saving...' : 'Save attendance'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Daily summary</CardTitle>
          <div className="flex gap-2 text-sm">
            <Badge variant="default">Present: {statusCounts.present}</Badge>
            <Badge variant="secondary">Tardy: {statusCounts.tardy}</Badge>
            <Badge variant="destructive">Absent: {statusCounts.absent}</Badge>
            <Badge variant="outline">Excused: {statusCounts.excused}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading attendance...</p>
          ) : !hasData ? (
            <p className="text-muted-foreground">No students available for the selected teacher or group.</p>
          ) : (
            <div className="space-y-3">
              {filteredStudents.map(student => {
                const record = attendanceMap[student.id]
                return (
                  <div key={student.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-sm">{student.name}</p>
                        <p className="text-xs text-muted-foreground">{student.group_name || 'No group'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {statusOptions.map(option => (
                          <Button
                            key={option.value}
                            variant={record?.status === option.value ? statusVariants[option.value] : 'outline'}
                            size="sm"
                            onClick={() => updateStatus(student.id, option.value)}
                          >
                            <span className="mr-2">{option.icon}</span>
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3">
                      <Input
                        placeholder="Add note (optional)"
                        value={record?.notes ?? ''}
                        onChange={(e) => updateNote(student.id, e.target.value)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
