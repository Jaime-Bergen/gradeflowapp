import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { CalendarRange, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { SchoolYear } from '@/lib/types'

type TeacherRow = {
  id: string
  name: string
  email: string
  selectedGroups: string[]
  minGrade: string
  maxGrade: string
}

type NewStudentDraft = {
  id: string
  name: string
  grade: string
}

type NewSubjectDraft = {
  id: string
  name: string
}

type StudentRow = {
  id: string
  name: string
  birthday?: string | null
  grade?: string | null
  average?: number | null
}

type SubjectRow = {
  id: string
  name: string
  report_card_name?: string | null
}

const AUTO_SCOPE_NAME = 'Guided Term Rollover'
const PURCHASE_URL = import.meta.env.VITE_PURCHASE_URL || 'https://buy.stripe.com/test_00w9AVfDJ2vR4nx1sy8so00'

export default function TermRolloverAssistant() {
  const [activeStep, setActiveStep] = useState<0 | 1 | 2 | 3 | 4 | 5>(0)
  const [isBusy, setIsBusy] = useState(false)

  const [availableYears, setAvailableYears] = useState<SchoolYear[]>([])
  const [licensedYears, setLicensedYears] = useState<SchoolYear[]>([])
  const [sourceSchoolYearId, setSourceSchoolYearId] = useState('')
  const [targetSchoolYearId, setTargetSchoolYearId] = useState('')
  const [firstDayOfSchool, setFirstDayOfSchool] = useState('')
  const [currentFirstDay, setCurrentFirstDay] = useState<string>('')

  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([])

  const [students, setStudents] = useState<StudentRow[]>([])
  const [holdBackStudentIds, setHoldBackStudentIds] = useState<string[]>([])
  const [removeStudentIds, setRemoveStudentIds] = useState<string[]>([])
  const [newStudents, setNewStudents] = useState<NewStudentDraft[]>([])

  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [cloneSubjectIds, setCloneSubjectIds] = useState<string[]>([])
  const [newSubjects, setNewSubjects] = useState<NewSubjectDraft[]>([])
  const [keepLessons, setKeepLessons] = useState(true)
  const [keepLessonMaxPoints, setKeepLessonMaxPoints] = useState(true)

  const [newTeacherName, setNewTeacherName] = useState('')
  const [newTeacherEmail, setNewTeacherEmail] = useState('')
  const [newTeacherPassword, setNewTeacherPassword] = useState('')
  const [overwriteTargetData, setOverwriteTargetData] = useState(false)

  const [autoScopeId, setAutoScopeId] = useState('')

  const licensedYearMap = useMemo(() => {
    const map = new Map<string, SchoolYear>()
    for (const year of licensedYears) {
      map.set(year.id, year)
    }
    return map
  }, [licensedYears])

  const sourceLicense = sourceSchoolYearId ? licensedYearMap.get(sourceSchoolYearId) : undefined
  const targetLicense = targetSchoolYearId ? licensedYearMap.get(targetSchoolYearId) : undefined
  const targetLicenseTier = String((targetLicense as any)?.license_tier || '').toLowerCase()
  const canManageTeachers = targetLicenseTier === 'full' || targetLicenseTier === 'trial'

  const requiresLicenseForDate = useMemo(() => {
    if (!firstDayOfSchool || !currentFirstDay) return false
    const source = new Date(currentFirstDay)
    const target = new Date(firstDayOfSchool)
    if (Number.isNaN(source.getTime()) || Number.isNaN(target.getTime())) return false

    const plusNineMonths = new Date(source)
    plusNineMonths.setMonth(plusNineMonths.getMonth() + 9)
    return target > plusNineMonths
  }, [firstDayOfSchool, currentFirstDay])

  useEffect(() => {
    if (activeStep === 0) return
    void loadBaseData()
  }, [activeStep, sourceSchoolYearId])

  const loadBaseData = async () => {
    try {
      const [availableYearsRes, yearsRes, profileRes, teachersRes] = await Promise.all([
        apiClient.getAvailableSchoolYears(),
        apiClient.getLicensedSchoolYears(),
        apiClient.getProfile(),
        apiClient.getTeachers(),
      ])

      const allYears = Array.isArray(availableYearsRes.data) ? availableYearsRes.data : []
      const years = Array.isArray(yearsRes.data) ? yearsRes.data : []
      setAvailableYears(allYears)
      setLicensedYears(years)

      const profile: any = profileRes.data || {}
      const activeYearId = profile.active_school_year_id || ''
      const resolvedSourceYearId = sourceSchoolYearId || activeYearId || years[0]?.id || ''

      if (!sourceSchoolYearId && resolvedSourceYearId) {
        setSourceSchoolYearId(resolvedSourceYearId)
      }

      if (!targetSchoolYearId && allYears.length > 0) {
        const defaultTarget = allYears.find((y) => y.id !== resolvedSourceYearId)?.id || allYears[0].id
        setTargetSchoolYearId(defaultTarget)
      }

      const sourceYear = allYears.find((y) => y.id === resolvedSourceYearId) || years.find((y) => y.id === resolvedSourceYearId)
      const sourceFirstDay = sourceYear?.start_date
        ? new Date(sourceYear.start_date).toISOString().split('T')[0]
        : ''
      setCurrentFirstDay(sourceFirstDay)

      const teacherRows = Array.isArray((teachersRes.data as any)?.data) ? (teachersRes.data as any).data : []
      setTeachers(
        teacherRows.map((t: any) => ({
          id: t.id,
          name: t.name,
          email: t.email,
          selectedGroups: Array.isArray(t.assigned_groups) ? t.assigned_groups.map((g: any) => g.id) : [],
          minGrade: '',
          maxGrade: '',
        }))
      )

      const [groupsRes, studentsRes, subjectsRes] = await Promise.all([
        apiClient.getStudentGroups(resolvedSourceYearId || undefined),
        apiClient.getStudents(undefined, resolvedSourceYearId || undefined),
        apiClient.getSubjects(undefined, resolvedSourceYearId || undefined),
      ])

      const groupRows = Array.isArray(groupsRes.data) ? groupsRes.data : []
      setGroups(groupRows.map((g: any) => ({ id: g.id, name: g.name })))

      const studentRows = Array.isArray(studentsRes.data) ? studentsRes.data : []
      setStudents(
        studentRows.map((s: any) => ({
          id: s.id,
          name: s.name,
          birthday: s.birthday || null,
          grade: s.grade || null,
          average: null,
        }))
      )

      const subjectRows = Array.isArray(subjectsRes.data) ? subjectsRes.data : []
      setSubjects(
        subjectRows.map((s: any) => ({
          id: s.id,
          name: s.name,
          report_card_name: s.report_card_name || null,
        }))
      )
      setCloneSubjectIds(subjectRows.map((s: any) => s.id))
    } catch (error) {
      console.error('Failed to load rollover assistant data:', error)
      toast.error('Failed to load term rollover data')
    }
  }

  const ensureAutoScope = async (): Promise<string | null> => {
    if (!sourceSchoolYearId) {
      throw new Error('Select a source term first')
    }

    if (autoScopeId) return autoScopeId

    const scopesRes = await apiClient.getRolloverScopes(sourceSchoolYearId)
    const scopes = Array.isArray(scopesRes.data) ? scopesRes.data : []

    let scope = scopes.find((s: any) => s.name === AUTO_SCOPE_NAME)
    if (!scope) {
      const created = await apiClient.createRolloverScope({
        name: AUTO_SCOPE_NAME,
        minGrade: 0,
        maxGrade: 20,
        teacherId: null,
      }, sourceSchoolYearId)
      if ((created as any).error || !(created as any).data) {
        throw new Error((created as any).error || 'Failed to create internal rollover scope')
      }
      scope = (created as any).data
    }

    if (!scope) {
      throw new Error('Failed to initialize internal rollover scope')
    }

    if (scope.status !== 'locked') {
      const locked = await apiClient.lockRolloverScope(scope.id, {
        notes: 'Auto-locked for guided term rollover',
      }, sourceSchoolYearId)
      if ((locked as any).error) {
        throw new Error((locked as any).error || 'Failed to lock internal rollover scope')
      }
    }

    setAutoScopeId(scope.id)
    return scope.id
  }

  const toggleId = (list: string[], id: string) => {
    if (list.includes(id)) return list.filter((x) => x !== id)
    return [...list, id]
  }

  const addNewStudentDraft = () => {
    setNewStudents((prev) => [...prev, { id: crypto.randomUUID(), name: '', grade: '' }])
  }

  const updateNewStudentDraft = (id: string, patch: Partial<NewStudentDraft>) => {
    setNewStudents((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeNewStudentDraft = (id: string) => {
    setNewStudents((prev) => prev.filter((s) => s.id !== id))
  }

  const addNewSubjectDraft = () => {
    setNewSubjects((prev) => [...prev, { id: crypto.randomUUID(), name: '' }])
  }

  const updateNewSubjectDraft = (id: string, patch: Partial<NewSubjectDraft>) => {
    setNewSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeNewSubjectDraft = (id: string) => {
    setNewSubjects((prev) => prev.filter((s) => s.id !== id))
  }

  const goToStep = (step: 1 | 2 | 3 | 4 | 5) => setActiveStep(step)

  const closeAll = () => setActiveStep(0)

  const getLicenseLabel = (year?: SchoolYear) => {
    const tier = String((year as any)?.license_tier || '').toLowerCase()
    if (tier === 'full') return 'Full'
    if (tier === 'single') return 'Single'
    if (tier === 'trial') return 'Trial'
    return 'Not licensed'
  }

  const grantTargetTrialLicense = async () => {
    if (!targetSchoolYearId) {
      toast.error('Select the target term first')
      return
    }

    try {
      setIsBusy(true)
      const response = await apiClient.grantTrialLicense({ schoolYearId: targetSchoolYearId })
      if ((response as any).error) {
        throw new Error((response as any).error)
      }
      toast.success(response.data?.message || 'Trial license granted')
      await loadBaseData()
    } catch (error) {
      console.error('Failed to grant trial license:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to grant trial license')
    } finally {
      setIsBusy(false)
    }
  }

  const handleStep1Next = () => {
    if (!sourceSchoolYearId) {
      toast.error('Select the source term first')
      return
    }
    if (!targetSchoolYearId) {
      toast.error('Select the target term first')
      return
    }
    if (sourceSchoolYearId === targetSchoolYearId) {
      toast.error('Source and target terms must be different')
      return
    }
    if (!firstDayOfSchool) {
      toast.error('Set the first day of school for the new term')
      return
    }
    if (!sourceLicense) {
      toast.error('Source term must have a valid license')
      return
    }
    if (!targetLicense) {
      toast.error('Target term is not licensed yet. Grant a trial or purchase a license to continue.')
      return
    }
    if (requiresLicenseForDate && !targetLicense) {
      toast.error('A license is required before continuing to this term')
      return
    }

    if (targetLicenseTier === 'single') {
      toast.info('Single license detected. Teacher step skipped for this rollover.')
      goToStep(3)
      return
    }

    goToStep(2)
  }

  const addTeacherForRollover = async () => {
    const name = newTeacherName.trim()
    const email = newTeacherEmail.trim()
    const password = newTeacherPassword.trim()

    if (!name) {
      toast.error('Teacher name is required')
      return
    }
    if (!email) {
      toast.error('Teacher email is required')
      return
    }
    if (!password) {
      toast.error('Teacher password is required')
      return
    }

    try {
      setIsBusy(true)
      const response = await apiClient.createTeacher({
        name,
        email,
        password,
        selectedGroups: [],
      })
      if ((response as any).error) {
        throw new Error((response as any).error)
      }

      toast.success('Teacher added')
      setNewTeacherName('')
      setNewTeacherEmail('')
      setNewTeacherPassword('')
      await loadBaseData()
    } catch (error) {
      console.error('Failed to add teacher:', error)
      toast.error('Could not add teacher')
    } finally {
      setIsBusy(false)
    }
  }

  const removeTeacherForRollover = async (teacher: TeacherRow) => {
    if (!window.confirm(`Remove teacher "${teacher.name}"?`)) {
      return
    }

    try {
      setIsBusy(true)
      const response = await apiClient.deleteTeacher(teacher.id)
      if ((response as any).error) {
        throw new Error((response as any).error)
      }
      toast.success('Teacher removed')
      await loadBaseData()
    } catch (error) {
      console.error('Failed to remove teacher:', error)
      toast.error('Could not remove teacher')
    } finally {
      setIsBusy(false)
    }
  }

  const handleSaveTeacherAssignments = async () => {
    try {
      setIsBusy(true)
      for (const teacher of teachers) {
        const selectedGroupNames = groups
          .filter((group) => teacher.selectedGroups.includes(group.id))
          .map((group) => group.name)

        await apiClient.updateTeacher(teacher.id, {
          name: teacher.name,
          email: teacher.email,
          selectedGroups: selectedGroupNames,
        })
      }
      toast.success('Teacher assignments saved')
      goToStep(3)
    } catch (error) {
      console.error('Failed to save teacher assignments:', error)
      toast.error('Could not save teacher assignments')
    } finally {
      setIsBusy(false)
    }
  }

  const runStep5 = async () => {
    if (!overwriteTargetData) {
      toast.error('Please confirm overwrite of target-year data before continuing')
      return
    }

    try {
      setIsBusy(true)
      const scopeId = await ensureAutoScope()
      if (!scopeId) {
        throw new Error('Missing internal rollover scope')
      }

      const sourceStudents = students

      const studentExecute = await apiClient.executeRolloverStudents(scopeId, {
        targetSchoolYearId,
        holdBackStudentIds,
        overwriteTargetYearData: true,
      }, sourceSchoolYearId)
      if ((studentExecute as any).error) {
        throw new Error((studentExecute as any).error || 'Failed student rollover step')
      }

      const subjectExecute = await apiClient.executeRolloverSubjects(scopeId, {
        targetSchoolYearId,
        subjectIds: cloneSubjectIds,
        keepLessons,
        keepLessonMaxPoints,
      }, sourceSchoolYearId)
      if ((subjectExecute as any).error) {
        throw new Error((subjectExecute as any).error || 'Failed subject rollover step')
      }

      const finalize = await apiClient.finalizeRollover({
        targetSchoolYearId,
        firstDayOfSchool,
      }, sourceSchoolYearId)
      if ((finalize as any).error) {
        throw new Error((finalize as any).error || 'Failed final rollover confirmation')
      }

      if (removeStudentIds.length > 0 || newStudents.length > 0 || newSubjects.length > 0) {
        const targetStudentsRes = await apiClient.getStudents(undefined, targetSchoolYearId)
        const targetStudents = Array.isArray(targetStudentsRes.data) ? targetStudentsRes.data : []

        const removeByKeys = new Set(
          sourceStudents
            .filter((s) => removeStudentIds.includes(s.id))
            .map((s) => `${(s.name || '').trim().toLowerCase()}::${s.birthday || ''}`)
        )

        for (const t of targetStudents) {
          const key = `${String(t.name || '').trim().toLowerCase()}::${t.birthday || ''}`
          if (removeByKeys.has(key)) {
            await apiClient.deleteStudent(t.id)
          }
        }

        for (const draft of newStudents) {
          if (!draft.name.trim()) continue
          await apiClient.createStudent({
            name: draft.name.trim(),
            grade: draft.grade.trim() || undefined,
          })
        }

        for (const draft of newSubjects) {
          if (!draft.name.trim()) continue
          await apiClient.createSubject({
            name: draft.name.trim(),
            reportCardName: draft.name.trim(),
          })
        }
      }

      toast.success('New term rollover completed')
      setOverwriteTargetData(false)
      closeAll()
    } catch (error) {
      console.error('Rollover assistant failed:', error)
      toast.error(error instanceof Error ? error.message : 'Rollover failed')
    } finally {
      setIsBusy(false)
    }
  }

  const updateTeacherGroupSelection = (teacherId: string, groupId: string) => {
    setTeachers((prev) =>
      prev.map((t) =>
        t.id === teacherId
          ? {
              ...t,
              selectedGroups: t.selectedGroups.includes(groupId)
                ? t.selectedGroups.filter((id) => id !== groupId)
                : [...t.selectedGroups, groupId],
            }
          : t
      )
    )
  }

  return (
    <>
      <Button variant="secondary" onClick={() => goToStep(1)}>
        Term Rollover
      </Button>

      <Dialog open={activeStep === 1} onOpenChange={(open) => (open ? goToStep(1) : closeAll())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Step 1: Choose New Term</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <CalendarRange className="h-4 w-4" />
              <AlertDescription>
                Select the term to migrate into and set the first day of school.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Source Term (Migrate From)</Label>
                <Select value={sourceSchoolYearId || undefined} onValueChange={setSourceSchoolYearId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source term" />
                  </SelectTrigger>
                  <SelectContent>
                    {licensedYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>
                        {y.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target Term (Migrate To)</Label>
                <Select value={targetSchoolYearId || undefined} onValueChange={setTargetSchoolYearId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target term" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>
                        {y.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="term-first-day">First Day Of School (new term)</Label>
                <Input
                  id="term-first-day"
                  type="date"
                  value={firstDayOfSchool}
                  onChange={(e) => setFirstDayOfSchool(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Source Term License</p>
                <p className="text-sm font-medium">{getLicenseLabel(sourceLicense)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Target Term License</p>
                <p className="text-sm font-medium">{getLicenseLabel(targetLicense)}</p>
                {!targetLicense ? (
                  <p className="mt-1 text-xs text-muted-foreground">No license found for this target term yet.</p>
                ) : null}
              </div>
            </div>

            <Alert>
              <AlertDescription>
                Need a license for a future term? Purchase here:{' '}
                <a className="underline" href={PURCHASE_URL} target="_blank" rel="noreferrer">
                  gradeflowapp.com/purchase <ExternalLink className="inline h-3 w-3" />
                </a>
              </AlertDescription>
            </Alert>

            {!targetLicense ? (
              <div className="flex justify-end">
                <Button variant="outline" onClick={grantTargetTrialLicense} disabled={isBusy || !targetSchoolYearId}>
                  {isBusy ? 'Granting Trial...' : 'Grant Trial For Target Term'}
                </Button>
              </div>
            ) : null}

            {requiresLicenseForDate ? (
              <p className="text-sm text-muted-foreground">
                This date is more than 9 months after your current session start. A valid license for that term is required.
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeAll}>Cancel</Button>
              <Button onClick={handleStep1Next}>Next</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeStep === 2} onOpenChange={(open) => (open ? goToStep(2) : closeAll())}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Step 2: Teacher Grade/Group Assignments</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Target license: {getLicenseLabel(targetLicense)}. Full and Trial licenses can add/remove teachers and manage assignments here.
              </AlertDescription>
            </Alert>

            <div className="rounded-md border p-3 space-y-3">
              <h4 className="font-medium">Add Teacher</h4>
              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  placeholder="Teacher name"
                  value={newTeacherName}
                  onChange={(e) => setNewTeacherName(e.target.value)}
                />
                <Input
                  placeholder="Teacher email"
                  value={newTeacherEmail}
                  onChange={(e) => setNewTeacherEmail(e.target.value)}
                />
                <Input
                  placeholder="Temporary password"
                  type="password"
                  value={newTeacherPassword}
                  onChange={(e) => setNewTeacherPassword(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={addTeacherForRollover} disabled={isBusy || !canManageTeachers}>
                  Add Teacher
                </Button>
              </div>
            </div>

            {teachers.map((teacher) => (
              <div key={teacher.id} className="rounded-md border p-3 space-y-3">
                <div>
                  <div className="font-medium">{teacher.name}</div>
                  <div className="text-xs text-muted-foreground">{teacher.email}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Min Grade</Label>
                    <Input
                      value={teacher.minGrade}
                      onChange={(e) =>
                        setTeachers((prev) => prev.map((t) => (t.id === teacher.id ? { ...t, minGrade: e.target.value } : t)))
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Grade</Label>
                    <Input
                      value={teacher.maxGrade}
                      onChange={(e) =>
                        setTeachers((prev) => prev.map((t) => (t.id === teacher.id ? { ...t, maxGrade: e.target.value } : t)))
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Groups</Label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {groups.map((g) => (
                      <label key={g.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={teacher.selectedGroups.includes(g.id)}
                          onCheckedChange={() => canManageTeachers && updateTeacherGroupSelection(teacher.id, g.id)}
                        />
                        <span>{g.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => removeTeacherForRollover(teacher)}
                    disabled={isBusy || !canManageTeachers}
                  >
                    Remove Teacher
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => goToStep(1)}>Back</Button>
              <Button onClick={handleSaveTeacherAssignments} disabled={isBusy || !canManageTeachers}>
                {isBusy ? 'Saving...' : 'Save And Continue'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeStep === 3} onOpenChange={(open) => (open ? goToStep(3) : closeAll())}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Step 3: Students (Fail/Add/Remove)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 space-y-2">
              <h4 className="font-medium">Fail / Hold Back</h4>
              {students.map((student) => (
                <label key={student.id} className="flex items-center justify-between gap-3 text-sm py-1 border-b last:border-b-0">
                  <span>{student.name} ({student.grade || 'N/A'})</span>
                  <Checkbox
                    checked={holdBackStudentIds.includes(student.id)}
                    onCheckedChange={() => setHoldBackStudentIds((prev) => toggleId(prev, student.id))}
                  />
                </label>
              ))}
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <h4 className="font-medium">Remove From Next Term</h4>
              {students.map((student) => (
                <label key={student.id} className="flex items-center justify-between gap-3 text-sm py-1 border-b last:border-b-0">
                  <span>{student.name}</span>
                  <Checkbox
                    checked={removeStudentIds.includes(student.id)}
                    onCheckedChange={() => setRemoveStudentIds((prev) => toggleId(prev, student.id))}
                  />
                </label>
              ))}
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Add New Students For Next Term</h4>
                <Button variant="outline" size="sm" onClick={addNewStudentDraft}>Add Student</Button>
              </div>
              {newStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No new students queued.</p>
              ) : (
                newStudents.map((draft) => (
                  <div key={draft.id} className="grid gap-2 md:grid-cols-[1fr_180px_80px]">
                    <Input
                      placeholder="Student name"
                      value={draft.name}
                      onChange={(e) => updateNewStudentDraft(draft.id, { name: e.target.value })}
                    />
                    <Input
                      placeholder="Grade (optional)"
                      value={draft.grade}
                      onChange={(e) => updateNewStudentDraft(draft.id, { grade: e.target.value })}
                    />
                    <Button variant="ghost" onClick={() => removeNewStudentDraft(draft.id)}>Remove</Button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => goToStep(targetLicenseTier === 'single' ? 1 : 2)}>Back</Button>
              <Button onClick={() => goToStep(4)}>Next</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeStep === 4} onOpenChange={(open) => (open ? goToStep(4) : closeAll())}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Step 4: Subjects (Clone/Add)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 space-y-2">
              <h4 className="font-medium">Clone Existing Subjects</h4>
              {subjects.map((subject) => (
                <label key={subject.id} className="flex items-center justify-between gap-3 text-sm py-1 border-b last:border-b-0">
                  <span>{subject.name}</span>
                  <Checkbox
                    checked={cloneSubjectIds.includes(subject.id)}
                    onCheckedChange={() => setCloneSubjectIds((prev) => toggleId(prev, subject.id))}
                  />
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                Only checked subjects will be cloned into the new term.
              </p>
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <h4 className="font-medium">Imported Subject Options</h4>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={keepLessons}
                  onCheckedChange={(checked) => {
                    const enabled = checked === true
                    setKeepLessons(enabled)
                    if (!enabled) {
                      setKeepLessonMaxPoints(false)
                    }
                  }}
                />
                <span>Keep lessons when importing subjects</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={keepLessonMaxPoints}
                  disabled={!keepLessons}
                  onCheckedChange={(checked) => setKeepLessonMaxPoints(checked === true)}
                />
                <span className={!keepLessons ? 'text-muted-foreground' : undefined}>
                  Keep lesson max points
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                If max points are turned off, lessons will still be imported but their point values will be blank.
              </p>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Add New Subjects For Next Term</h4>
                <Button variant="outline" size="sm" onClick={addNewSubjectDraft}>Add Subject</Button>
              </div>
              {newSubjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No new subjects queued.</p>
              ) : (
                newSubjects.map((draft) => (
                  <div key={draft.id} className="grid gap-2 md:grid-cols-[1fr_90px]">
                    <Input
                      placeholder="Subject name"
                      value={draft.name}
                      onChange={(e) => updateNewSubjectDraft(draft.id, { name: e.target.value })}
                    />
                    <Button variant="ghost" onClick={() => removeNewSubjectDraft(draft.id)}>Remove</Button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => goToStep(3)}>Back</Button>
              <Button onClick={() => goToStep(5)}>Next</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeStep === 5} onOpenChange={(open) => (open ? goToStep(5) : closeAll())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Step 5: Confirm New Term Rollover</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Alert>
              <AlertDescription>
                Warning: Confirming rollover will overwrite existing target-year students, grades, groups, subjects, lessons,
                enrollments, markers, and subject settings before copying from the source year.
              </AlertDescription>
            </Alert>

            <p className="text-sm text-muted-foreground">
              This will roll students and subjects into the selected term, switch active term, then apply your add/remove updates.
            </p>
            <ul className="text-sm space-y-1">
              <li>Source term: {licensedYears.find((y) => y.id === sourceSchoolYearId)?.label || 'Not selected'}</li>
              <li>Target term: {licensedYears.find((y) => y.id === targetSchoolYearId)?.label || 'Not selected'}</li>
              <li>First day of school: {firstDayOfSchool || 'Not set'}</li>
              <li>Hold-backs: {holdBackStudentIds.length}</li>
              <li>Remove from next term: {removeStudentIds.length}</li>
              <li>Add students: {newStudents.filter((s) => s.name.trim()).length}</li>
              <li>Add subjects: {newSubjects.filter((s) => s.name.trim()).length}</li>
              <li>Keep lessons: {keepLessons ? 'Yes' : 'No'}</li>
              <li>Keep lesson max points: {keepLessons && keepLessonMaxPoints ? 'Yes' : 'No'}</li>
            </ul>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={overwriteTargetData} onCheckedChange={(checked) => setOverwriteTargetData(checked === true)} />
              <span>I understand this will overwrite existing target-year data.</span>
            </label>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => goToStep(4)}>Back</Button>
              <Button variant="destructive" onClick={runStep5} disabled={isBusy || !overwriteTargetData}>
                {isBusy ? 'Rolling Over...' : 'Confirm Rollover'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
