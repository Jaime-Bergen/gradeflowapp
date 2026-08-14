import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CalendarRange, AlertTriangle, PlusCircle } from "lucide-react"
import { toast } from 'sonner'
import { RolloverScope, SchoolYear } from '@/lib/types'

export default function RolloverMenu() {
  const [isLoading, setIsLoading] = useState(false)
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([])
  const [rolloverScopes, setRolloverScopes] = useState<RolloverScope[]>([])
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string; email: string }>>([])

  const [newScopeName, setNewScopeName] = useState('')
  const [newScopeMinGrade, setNewScopeMinGrade] = useState('3')
  const [newScopeMaxGrade, setNewScopeMaxGrade] = useState('5')
  const [newScopeTeacherId, setNewScopeTeacherId] = useState('')

  const [selectedScopeId, setSelectedScopeId] = useState('')
  const [scopePreview, setScopePreview] = useState<any | null>(null)
  const [scopeNotes, setScopeNotes] = useState('')
  const [rolloverTargetYearId, setRolloverTargetYearId] = useState('')
  const [rolloverFirstDay, setRolloverFirstDay] = useState('')

  useEffect(() => {
    loadRolloverData()
  }, [])

  const loadRolloverData = async () => {
    try {
      setIsLoading(true)
      const [yearsRes, scopesRes, teachersRes] = await Promise.all([
        apiClient.getLicensedSchoolYears(),
        apiClient.getRolloverScopes(),
        apiClient.getTeachers(),
      ])

      const yearRows = Array.isArray(yearsRes.data) ? yearsRes.data : []
      const scopes = Array.isArray(scopesRes.data) ? scopesRes.data : []
      const teacherRows = Array.isArray((teachersRes.data as any)?.data)
        ? (teachersRes.data as any).data
        : []

      setSchoolYears(yearRows)
      setRolloverScopes(scopes)
      setTeachers(
        teacherRows.map((t: any) => ({
          id: t.id,
          name: t.name,
          email: t.email,
        }))
      )

      if (!rolloverTargetYearId && yearRows.length > 0) {
        setRolloverTargetYearId(yearRows[0].id)
      }
      if (!selectedScopeId && scopes.length > 0) {
        setSelectedScopeId(scopes[0].id)
      }
    } catch (error) {
      console.error('Failed to load rollover data:', error)
      toast.error('Failed to load rollover menu data')
    } finally {
      setIsLoading(false)
    }
  }

  const createRolloverScope = async () => {
    const minGrade = Number(newScopeMinGrade)
    const maxGrade = Number(newScopeMaxGrade)

    if (!newScopeName.trim()) {
      toast.error('Scope name is required')
      return
    }
    if (!Number.isInteger(minGrade) || !Number.isInteger(maxGrade) || minGrade < 0 || maxGrade < minGrade) {
      toast.error('Invalid grade range')
      return
    }

    try {
      const res = await apiClient.createRolloverScope({
        name: newScopeName.trim(),
        minGrade,
        maxGrade,
        teacherId: newScopeTeacherId || null,
      })
      if ((res as any).error) {
        throw new Error((res as any).error)
      }
      toast.success('Scope created')
      setNewScopeName('')
      setScopeNotes('')
      await loadRolloverData()
    } catch (error) {
      console.error('Failed to create rollover scope:', error)
      toast.error('Failed to create rollover scope')
    }
  }

  const lockScope = async (scopeId: string, teacherId?: string | null) => {
    try {
      const res = await apiClient.lockRolloverScope(scopeId, {
        teacherId: teacherId || null,
        notes: scopeNotes.trim() || undefined,
      })
      if ((res as any).error) {
        throw new Error((res as any).error)
      }
      toast.success('Scope marked complete and locked')
      await loadRolloverData()
    } catch (error) {
      console.error('Failed to lock scope:', error)
      toast.error('Failed to lock scope')
    }
  }

  const unlockScope = async (scopeId: string) => {
    try {
      const res = await apiClient.unlockRolloverScope(scopeId)
      if ((res as any).error) {
        throw new Error((res as any).error)
      }
      toast.success('Scope unlocked')
      await loadRolloverData()
    } catch (error) {
      console.error('Failed to unlock scope:', error)
      toast.error('Failed to unlock scope')
    }
  }

  const previewScope = async (scopeId: string) => {
    try {
      const res = await apiClient.getRolloverScopePreview(scopeId, 80)
      if ((res as any).error) {
        throw new Error((res as any).error)
      }
      setScopePreview(res.data || null)
    } catch (error) {
      console.error('Failed to preview scope:', error)
      toast.error('Failed to load scope preview')
    }
  }

  const executeScopeStudents = async (scopeId: string) => {
    if (!rolloverTargetYearId) {
      toast.error('Select a target school year first')
      return
    }

    try {
      const holdBackIds =
        scopePreview && selectedScopeId === scopeId
          ? (scopePreview.students || [])
              .filter((s: any) => !!s.suggested_hold_back)
              .map((s: any) => s.id)
          : []

      const res = await apiClient.executeRolloverStudents(scopeId, {
        targetSchoolYearId: rolloverTargetYearId,
        holdBackStudentIds: holdBackIds,
      })
      if ((res as any).error) {
        throw new Error((res as any).error)
      }
      toast.success('Students step complete')
    } catch (error) {
      console.error('Failed to execute student rollover:', error)
      toast.error('Failed to execute student rollover')
    }
  }

  const executeScopeSubjects = async (scopeId: string) => {
    if (!rolloverTargetYearId) {
      toast.error('Select a target school year first')
      return
    }

    try {
      const res = await apiClient.executeRolloverSubjects(scopeId, {
        targetSchoolYearId: rolloverTargetYearId,
      })
      if ((res as any).error) {
        throw new Error((res as any).error)
      }
      toast.success('Subjects and roster step complete')
    } catch (error) {
      console.error('Failed to execute subject rollover:', error)
      toast.error('Failed to execute subject rollover')
    }
  }

  const finalizeRollover = async () => {
    if (!rolloverTargetYearId) {
      toast.error('Select a target school year first')
      return
    }

    if (!window.confirm('Finalize rollover and switch active school year now?')) {
      return
    }

    try {
      const res = await apiClient.finalizeRollover({
        targetSchoolYearId: rolloverTargetYearId,
        firstDayOfSchool: rolloverFirstDay || undefined,
      })
      if ((res as any).error) {
        throw new Error((res as any).error)
      }
      toast.success('Rollover finalized and active year switched')
      await loadRolloverData()
    } catch (error) {
      console.error('Failed to finalize rollover:', error)
      toast.error('Failed to finalize rollover')
    }
  }

  return (
    <div className="space-y-6">
      <Alert>
        <CalendarRange className="h-4 w-4" />
        <AlertDescription>
          Use this guided flow: choose target term, create scopes, preview hold-backs, lock each scope, run students and subjects, then finalize.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 rounded-md border p-4">
        <div className="space-y-2">
          <Label>Step 1: Target School Year</Label>
          <Select value={rolloverTargetYearId || undefined} onValueChange={setRolloverTargetYearId}>
            <SelectTrigger>
              <SelectValue placeholder="Select target year" />
            </SelectTrigger>
            <SelectContent>
              {schoolYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rollover-first-day">Step 1: New First Day Of School</Label>
          <Input
            id="rollover-first-day"
            type="date"
            value={rolloverFirstDay}
            onChange={(e) => setRolloverFirstDay(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 rounded-md border p-4">
        <div className="space-y-2">
          <Label htmlFor="scope-name">Step 2: Scope Name</Label>
          <Input
            id="scope-name"
            placeholder="Grades 3-5"
            value={newScopeName}
            onChange={(e) => setNewScopeName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Step 2: Assigned Teacher</Label>
          <Select value={newScopeTeacherId || 'none'} onValueChange={(v) => setNewScopeTeacherId(v === 'none' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name} ({t.email})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="scope-min-grade">Step 2: Min Grade</Label>
          <Input
            id="scope-min-grade"
            type="number"
            value={newScopeMinGrade}
            onChange={(e) => setNewScopeMinGrade(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scope-max-grade">Step 2: Max Grade</Label>
          <Input
            id="scope-max-grade"
            type="number"
            value={newScopeMaxGrade}
            onChange={(e) => setNewScopeMaxGrade(e.target.value)}
          />
        </div>
        <Button onClick={createRolloverScope} className="md:col-span-2" disabled={isLoading}>
          <PlusCircle size={16} className="mr-2" />
          Create Scope
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="scope-notes">Step 3: Lock Notes</Label>
        <Input
          id="scope-notes"
          placeholder="Optional note when locking"
          value={scopeNotes}
          onChange={(e) => setScopeNotes(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {rolloverScopes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rollover scopes configured yet.</p>
        ) : (
          rolloverScopes.map((scope) => (
            <div key={scope.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{scope.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Grades {scope.min_grade}-{scope.max_grade}
                    {scope.teacher_name ? ` • ${scope.teacher_name}` : ' • Unassigned'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Students: {scope.total_students || 0} • Suggested hold-backs (70% or lower): {scope.at_risk_students || 0}
                  </div>
                </div>
                <div className="text-xs font-medium uppercase">{scope.status}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { setSelectedScopeId(scope.id); previewScope(scope.id) }}>
                  Preview
                </Button>
                {scope.status === 'draft' ? (
                  <Button size="sm" onClick={() => lockScope(scope.id, scope.teacher_id || undefined)}>
                    Mark Complete + Lock
                  </Button>
                ) : (
                  <>
                    <Button size="sm" onClick={() => executeScopeStudents(scope.id)}>
                      Step 4: Execute Students
                    </Button>
                    <Button size="sm" onClick={() => executeScopeSubjects(scope.id)}>
                      Step 5: Execute Subjects
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => unlockScope(scope.id)}>
                      Unlock
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {scopePreview && selectedScopeId ? (
        <div className="rounded-md border p-4 space-y-2">
          <h4 className="font-medium">Preview: {scopePreview.scope?.name}</h4>
          <p className="text-xs text-muted-foreground">
            Threshold: {scopePreview.riskThreshold}% • {scopePreview.students?.length || 0} students
          </p>
          <div className="max-h-56 overflow-auto text-sm space-y-1">
            {(scopePreview.students || []).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between border-b py-1">
                <span>{s.name} ({s.grade || 'N/A'})</span>
                <span className={s.suggested_hold_back ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                  Avg: {s.average_percentage ?? 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-md border border-destructive/30 p-4 space-y-3">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>Step 6: Finalize only after all scopes are locked and executed.</span>
        </div>
        <div className="flex justify-end">
          <Button variant="destructive" onClick={finalizeRollover}>
            Finalize Rollover + Switch Active Year
          </Button>
        </div>
      </div>
    </div>
  )
}
