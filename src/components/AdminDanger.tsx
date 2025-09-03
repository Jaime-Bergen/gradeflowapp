
import { useState } from 'react'
import { useApi } from '@/lib/api'
import { apiClient } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, Database, Download, Upload } from "lucide-react"
import { toast } from 'sonner'
import DataCleaner from './DataCleaner'
// import { apiClient } from '@/lib/api' // Uncomment when backend supports /users

export default function AdminDanger() {
  const [entered, setEntered] = useState(false)
  const [input, setInput] = useState("")
  const [restoreDialog, setRestoreDialog] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)

  const adminPass = import.meta.env.VITE_ADMIN_PASS

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
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'gradeflow-backup.sql'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast.success('Full database backup created successfully')
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

      {/* DataCleaner: Delete all data */}
      <DataCleaner />

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
  const totalGrades = users.reduce((sum, u) => sum + (u.grades_record_count || 0), 0);
  const totalBytes = users.reduce((sum, u) => sum + (u.grades_estimated_bytes || 0), 0);

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