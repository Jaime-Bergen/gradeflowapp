import { useEffect, useState } from 'react'
import { useApi } from '@/lib/api'
import { apiClient } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, Database, Download, PlusCircle, Upload } from "lucide-react"
import { toast } from 'sonner'
import { SchoolYear, UserSchoolYearLicense } from '@/lib/types'
// import { apiClient } from '@/lib/api' // Uncomment when backend supports /users

export default function AdminDanger() {
  const [entered, setEntered] = useState(false)
  const [input, setInput] = useState("")
  const [restoreDialog, setRestoreDialog] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedYearId, setSelectedYearId] = useState('')
  const [selectedLicenseTier, setSelectedLicenseTier] = useState<'full' | 'single' | 'trial'>('full')
  const [licenseNotes, setLicenseNotes] = useState('')
  const [setAsActive, setSetAsActive] = useState(true)
  const [licenses, setLicenses] = useState<UserSchoolYearLicense[]>([])
  const [isLicenseLoading, setIsLicenseLoading] = useState(false)
  const [newYearLabel, setNewYearLabel] = useState('')
  const [newYearStart, setNewYearStart] = useState('')
  const [newYearEnd, setNewYearEnd] = useState('')

  const adminPass = import.meta.env.VITE_ADMIN_PASS

  useEffect(() => {
    if (!entered) return
    loadLicenseAdminData()
  }, [entered])

  useEffect(() => {
    if (!entered || !selectedUserId) {
      setLicenses([])
      return
    }
    loadUserLicenses(selectedUserId)
  }, [entered, selectedUserId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!adminPass) {
      toast.error("Admin passcode is not set in the environment (VITE_ADMIN_PASS)")
      return
    }
    if (input === adminPass) {
      setEntered(true)
    } else {
      toast.error("Incorrect passcode.")
    }
  }

  // SQL Backup functions
  const createSQLBackup = async () => {
    try {
      const response = await apiClient.createSQLBackup()
      const backupFormat = response.headers.get('X-Backup-Format')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'gradeflow-backup.sql'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      if (backupFormat === 'json-fallback') {
        toast.warning('SQL tools were unavailable on the server. Downloaded JSON backup instead.')
      } else {
        toast.success('Full SQL database backup created successfully')
      }
    } catch (error) {
      console.error('SQL backup failed:', error)
      toast.error('Failed to create SQL backup')
    }
  }

  const openRestoreDialog = () => {
    setRestoreDialog(true)
    setSelectedFile(null)
  }

  const closeRestoreDialog = () => {
    setRestoreDialog(false)
    setSelectedFile(null)
    setIsRestoring(false)
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const performSQLRestore = async () => {
    if (!selectedFile) {
      toast.error('Please select a backup file')
      return
    }

    setIsRestoring(true)
    try {
      await apiClient.restoreFromSQL(selectedFile)
      toast.success('Database restored successfully from SQL backup')
      closeRestoreDialog()
    } catch (error) {
      console.error('Restore failed:', error)
      toast.error(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsRestoring(false)
    }
  }

  const loadLicenseAdminData = async () => {
    if (!adminPass) return
    try {
      setIsLicenseLoading(true)
      const [usersRes, yearsRes] = await Promise.all([
        apiClient.getAllUsers(),
        apiClient.getAdminSchoolYears(adminPass),
      ])

      const userRows = Array.isArray(usersRes.data) ? usersRes.data : []
      const yearRows = Array.isArray(yearsRes.data) ? yearsRes.data : []

      setUsers(userRows.map((u: any) => ({ id: u.id, name: u.name, email: u.email })))
      setSchoolYears(yearRows)

      if (!selectedUserId && userRows.length > 0) {
        setSelectedUserId(userRows[0].id)
      }
      if (!selectedYearId && yearRows.length > 0) {
        setSelectedYearId(yearRows[0].id)
      }
    } catch (error) {
      console.error('Failed to load school year license admin data:', error)
      toast.error('Failed to load school year license data')
    } finally {
      setIsLicenseLoading(false)
    }
  }

  const loadUserLicenses = async (userId: string) => {
    if (!adminPass || !userId) return
    try {
      setIsLicenseLoading(true)
      const res = await apiClient.getAdminUserLicenses(adminPass, userId)
      setLicenses(Array.isArray(res.data) ? res.data : [])
    } catch (error) {
      console.error('Failed to load user licenses:', error)
      toast.error('Failed to load user licenses')
    } finally {
      setIsLicenseLoading(false)
    }
  }

  const createSchoolYear = async () => {
    if (!adminPass) return
    if (!newYearLabel.trim() || !newYearStart || !newYearEnd) {
      toast.error('Enter year label, start date, and end date')
      return
    }

    try {
      await apiClient.createAdminSchoolYear(adminPass, {
        label: newYearLabel.trim(),
        startDate: newYearStart,
        endDate: newYearEnd,
      })
      toast.success('School year created')
      setNewYearLabel('')
      setNewYearStart('')
      setNewYearEnd('')
      await loadLicenseAdminData()
    } catch (error) {
      console.error('Failed to create school year:', error)
      toast.error('Failed to create school year')
    }
  }

  const grantLicense = async () => {
    if (!adminPass) return
    if (!selectedUserId || !selectedYearId) {
      toast.error('Select a user and school year')
      return
    }

    try {
      await apiClient.grantAdminUserLicense(adminPass, {
        userId: selectedUserId,
        schoolYearId: selectedYearId,
        licenseTier: selectedLicenseTier,
        notes: licenseNotes.trim() || undefined,
        setAsActive,
      })
      toast.success('License granted')
      setLicenseNotes('')
      await loadUserLicenses(selectedUserId)
    } catch (error) {
      console.error('Failed to grant license:', error)
      toast.error('Failed to grant license')
    }
  }

  const revokeLicense = async (licenseId: string) => {
    if (!adminPass || !selectedUserId) return
    if (!window.confirm('Revoke this school year license?')) return

    try {
      await apiClient.revokeAdminUserLicense(adminPass, licenseId)
      toast.success('License revoked')
      await loadUserLicenses(selectedUserId)
    } catch (error) {
      console.error('Failed to revoke license:', error)
      toast.error('Failed to revoke license')
    }
  }

  if (!entered) {
    return (
      <Card className="max-w-md mx-auto border-destructive mt-12">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={24} />
            Admin Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Restricted:</strong> Enter the admin passcode to access dangerous system operations.
              </AlertDescription>
            </Alert>
            <input
              type="password"
              className="input input-bordered w-full"
              placeholder="Admin Passcode"
              value={input}
              onChange={e => setInput(e.target.value)}
              autoFocus
              autoComplete="new-password"
            />
            <Button type="submit" variant="destructive" className="w-full">Enter Danger Zone</Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-2xl mx-auto mt-12 space-y-8">
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={24} />
            Admin Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Danger Zone:</strong> You now have access to dangerous system operations.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* SQL Database Backup & Restore */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Database size={24} />
            Database Backup & Restore (SQL)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> SQL backups contain ALL user data. SQL restore will completely replace the database.
            </AlertDescription>
          </Alert>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h4 className="font-medium">Full Database Backup</h4>
              <p className="text-sm text-muted-foreground">
                Creates a complete PostgreSQL dump including all users' data and system settings.
              </p>
              <Button onClick={createSQLBackup} className="flex items-center gap-2 w-full">
                <Download size={16} />
                Create SQL Backup
              </Button>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium">Database Restore</h4>
              <p className="text-sm text-muted-foreground">
                Restore from a SQL backup file. This will replace ALL current data.
              </p>
              <Button onClick={openRestoreDialog} variant="destructive" className="flex items-center gap-2 w-full">
                <Upload size={16} />
                Restore from SQL
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Database size={24} />
            School Year Licenses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> Licensing controls access to school year data. Use carefully.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-md border p-4">
              <h4 className="font-medium">Create School Year</h4>
              <div className="space-y-2">
                <Label htmlFor="new-year-label">Label</Label>
                <Input
                  id="new-year-label"
                  placeholder="2026-2027"
                  value={newYearLabel}
                  onChange={(e) => setNewYearLabel(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-year-start">Start Date</Label>
                  <Input
                    id="new-year-start"
                    type="date"
                    value={newYearStart}
                    onChange={(e) => setNewYearStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-year-end">End Date</Label>
                  <Input
                    id="new-year-end"
                    type="date"
                    value={newYearEnd}
                    onChange={(e) => setNewYearEnd(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={createSchoolYear} className="w-full" variant="outline">
                <PlusCircle size={16} className="mr-2" />
                Create School Year
              </Button>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <h4 className="font-medium">Grant User License</h4>
              <div className="space-y-2">
                <Label>User</Label>
                <Select value={selectedUserId || undefined} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>School Year</Label>
                <Select value={selectedYearId || undefined} onValueChange={setSelectedYearId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select school year" />
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
                <Label>License Type</Label>
                <Select value={selectedLicenseTier} onValueChange={(value: 'full' | 'single' | 'trial') => setSelectedLicenseTier(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select license type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full (School License)</SelectItem>
                    <SelectItem value="single">Single Teacher License</SelectItem>
                    <SelectItem value="trial">Trial License (100 grade cap)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="license-notes">Notes</Label>
                <Input
                  id="license-notes"
                  placeholder="Optional reason"
                  value={licenseNotes}
                  onChange={(e) => setLicenseNotes(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={setAsActive}
                  onChange={(e) => setSetAsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Set as active year for this user
              </label>
              <Button onClick={grantLicense} className="w-full">
                Grant License
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">User Licenses</h4>
            {!selectedUserId ? (
              <p className="text-sm text-muted-foreground">Select a user to view licenses.</p>
            ) : isLicenseLoading ? (
              <p className="text-sm text-muted-foreground">Loading licenses...</p>
            ) : licenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No licenses found for selected user.</p>
            ) : (
              <div className="space-y-2">
                {licenses.map((license) => (
                  <div key={license.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium text-sm">{license.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(license.start_date).toLocaleDateString()} - {new Date(license.end_date).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Source: {license.grant_source} • Tier: {license.license_tier || 'full'}{license.is_active ? ' • Active' : ''}
                      </div>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => revokeLicense(license.id)}>
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SQL Restore Dialog */}
      <Dialog open={restoreDialog} onOpenChange={(open) => !open && closeRestoreDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle size={20} />
              Restore Database from SQL
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>DANGER:</strong> This will completely replace the current database. All existing data will be permanently lost. This action cannot be undone.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Label htmlFor="sql-restore-file">Select SQL Backup File</Label>
              <Input
                id="sql-restore-file"
                type="file"
                accept=".sql"
                onChange={handleFileSelect}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                onClick={performSQLRestore} 
                className="flex-1" 
                variant="destructive"
                disabled={!selectedFile || isRestoring}
              >
                {isRestoring ? 'Restoring...' : 'Replace Database'}
              </Button>
              <Button variant="outline" onClick={closeRestoreDialog} disabled={isRestoring}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* User List (live) */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          <UserList />
        </CardContent>
      </Card>
    </div>
  )
}
// UserList component for admin user info
function UserList() {
  const { data: users, loading, error } = useApi(() => apiClient.getAllUsers(), []);

  if (loading) return <div>Loading users...</div>;
  if (error) return <div className="text-destructive">Error loading users: {error}</div>;
  if (!users || users.length === 0) return <div>No users found.</div>;

  // Calculate totals
  const toNumber = (value: unknown) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const totalGrades = users.reduce((sum, u) => sum + toNumber(u.grades_record_count), 0);
  const totalBytes = users.reduce((sum, u) => sum + toNumber(u.grades_estimated_bytes), 0);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border">
        <thead>
          <tr className="bg-muted">
            <th className="px-2 py-1 border">Name</th>
            <th className="px-2 py-1 border">Email</th>
            <th className="px-2 py-1 border">Joined</th>
            <th className="px-2 py-1 border">Last Used</th>
            <th className="px-2 py-1 border">Grades</th>
            <th className="px-2 py-1 border">Data (bytes)</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td className="px-2 py-1 border">{u.name}</td>
              <td className="px-2 py-1 border">{u.email}</td>
              <td className="px-2 py-1 border">{u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}</td>
              <td className="px-2 py-1 border">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : ''}</td>
              <td className="px-2 py-1 border text-right">{u.grades_record_count}</td>
              <td className="px-2 py-1 border text-right">{u.grades_estimated_bytes}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-muted">
            <td className="px-2 py-1 border" colSpan={4}>Totals</td>
            <td className="px-2 py-1 border text-right">{totalGrades}</td>
            <td className="px-2 py-1 border text-right">{totalBytes}</td>
          </tr>
        </tfoot>
      </table>
      <div className="text-xs text-muted-foreground mt-2">
        Total users: {users.length}
      </div>
    </div>
  );
}