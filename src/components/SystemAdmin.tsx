import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { 
  Database, 
  Users, 
  HardDrive, 
  Activity, 
  Download,
  Upload,
  RefreshCw,
  CheckCircle,
  Calendar,
  School,
  Key,
  UserCheck,
  Plus,
  Pencil,
  Trash2,
  FileJson
} from "lucide-react"
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'
import { Student, Subject, Grade } from '@/lib/types'

export default function SystemAdmin() {
  const [students, setStudents] = useState<Student[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [studentGroups, setStudentGroups] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  // Settings state
  const [schoolSettings, setSchoolSettings] = useState({
    schoolName: '',
    firstDayOfSchool: '',
    gradingPeriods: 6
  })
  const [passwordChange, setPasswordChange] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  // Student Group Management state
  const [groupDialog, setGroupDialog] = useState({
    open: false,
    mode: 'add' as 'add' | 'edit',
    group: null as any
  })
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: ''
  })

  // Grade Category Types state
  const [gradeCategoryTypes, setGradeCategoryTypes] = useState<any[]>([])
  const [categoryDialog, setCategoryDialog] = useState({
    open: false,
    mode: 'add' as 'add' | 'edit',
    category: null as any
  })
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    color: '#6366f1',
    is_default: false
  })

  // Restore state
  const [restoreDialog, setRestoreDialog] = useState({
    open: false,
    type: 'json' as 'json' | 'sql'
  })
  const [restoreOptions, setRestoreOptions] = useState({
    mergeData: true,
    updateSettings: false
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)

  useEffect(() => {
    loadSystemStats()
  }, [])

  // Listen for settings navigation event
  useEffect(() => {
    const handleGotoSettings = () => {
      setActiveTab('settings')
    }

    window.addEventListener('gradeflow-admin-goto-settings', handleGotoSettings)
    
    return () => {
      window.removeEventListener('gradeflow-admin-goto-settings', handleGotoSettings)
    }
  }, [])

  const loadSystemStats = async () => {
    try {
      setIsLoading(true)
      
      // Fetch actual data from API
      const studentsRes = await apiClient.getStudents()
      const studentsData = Array.isArray(studentsRes.data) ? studentsRes.data : []
      setStudents(studentsData)

      const subjectsRes = await apiClient.getSubjects()
      const subjectsData = Array.isArray(subjectsRes.data) ? subjectsRes.data : []
      setSubjects(subjectsData)

      const gradesRes = await apiClient.getGrades()
      const gradesData = Array.isArray(gradesRes.data) ? gradesRes.data : []
      setGrades(gradesData)

      // Fetch student groups
      const groupsRes = await apiClient.getStudentGroups()
      const groupsData = Array.isArray(groupsRes.data) ? groupsRes.data : []
      setStudentGroups(groupsData)

      // Fetch grade category types
      const categoriesRes = await apiClient.getGradeCategoryTypes()
      // Handle nested data structure: response.data.data
      const categoriesData = Array.isArray((categoriesRes as any).data?.data) ? (categoriesRes as any).data.data : 
                            Array.isArray((categoriesRes as any).data) ? (categoriesRes as any).data : []
      setGradeCategoryTypes(categoriesData)

      // Load settings from Users
      await loadSettings()

      setLastRefresh(new Date())
    } catch (error) {
      console.error('Failed to load system stats:', error)
      toast.error('Failed to load system statistics')
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
          schoolName: user.school_name || '',
          firstDayOfSchool: formattedDate,
          gradingPeriods: user.grading_periods || 6
        })
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const saveSettings = async () => {
    try {
      await apiClient.updateProfile({
        school_name: schoolSettings.schoolName,
        first_day_of_school: schoolSettings.firstDayOfSchool,
        grading_periods: schoolSettings.gradingPeriods
      })
      toast.success('School settings saved successfully')
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error('Failed to save settings')
    }
  }

  const changePassword = async () => {
    if (passwordChange.newPassword !== passwordChange.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    if (passwordChange.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long')
      return
    }

    if (!passwordChange.currentPassword) {
      toast.error('Current password is required')
      return
    }

    try {
      await apiClient.changePassword({
        currentPassword: passwordChange.currentPassword,
        newPassword: passwordChange.newPassword
      })
      
      toast.success('Password changed successfully')
      setPasswordChange({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
    } catch (error) {
      console.error('Failed to change password:', error)
      toast.error('Failed to change password')
    }
  }

  // Student Group Management functions
  const openGroupDialog = (mode: 'add' | 'edit', group?: any) => {
    setGroupDialog({ open: true, mode, group })
    if (mode === 'edit' && group) {
      setGroupForm({
        name: group.name || '',
        description: group.description || ''
      })
    } else {
      setGroupForm({ name: '', description: '' })
    }
  }

  const closeGroupDialog = () => {
    setGroupDialog({ open: false, mode: 'add', group: null })
    setGroupForm({ name: '', description: '' })
  }

  const saveStudentGroup = async () => {
    if (!groupForm.name.trim()) {
      toast.error('Group name is required')
      return
    }

    try {
      const groupData: any = {
        name: groupForm.name.trim()
      }

      // Only include description if it's not empty
      const description = groupForm.description.trim()
      if (description) {
        groupData.description = description
      }

      if (groupDialog.mode === 'edit' && groupDialog.group) {
        await apiClient.updateStudentGroup(groupDialog.group.id, groupData)
        toast.success('Student group updated successfully')
      } else {
        await apiClient.createStudentGroup(groupData)
        toast.success('Student group created successfully')
      }

      // Refresh student groups
      const groupsRes = await apiClient.getStudentGroups()
      const groupsData = Array.isArray(groupsRes.data) ? groupsRes.data : []
      setStudentGroups(groupsData)

      closeGroupDialog()
    } catch (error) {
      console.error('Failed to save student group:', error)
      toast.error(`Failed to ${groupDialog.mode === 'edit' ? 'update' : 'create'} student group`)
    }
  }

  const deleteStudentGroup = async (group: any) => {
    // Calculate student count using modern studentGroupId field
    const studentCount = students.filter(student => 
      student.studentGroupId === group.id
    ).length

    const confirmMessage = studentCount > 0
      ? `Are you sure you want to delete "${group.name}"? This group has ${studentCount} student(s) assigned to it. The students will not be deleted, but they will be removed from this group.`
      : `Are you sure you want to delete "${group.name}"?`

    if (!window.confirm(confirmMessage)) {
      return
    }

    try {
      await apiClient.deleteStudentGroup(group.id)
      toast.success('Student group deleted successfully')

      // Refresh student groups and students
      const [groupsRes, studentsRes] = await Promise.all([
        apiClient.getStudentGroups(),
        apiClient.getStudents()
      ])
      
      setStudentGroups(Array.isArray(groupsRes.data) ? groupsRes.data : [])
      setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : [])
    } catch (error) {
      console.error('Failed to delete student group:', error)
      toast.error('Failed to delete student group')
    }
  }

  // Grade Category Types Management functions
  
  // Toggle active status with usage check
  const toggleCategoryActive = async (category: any) => {
    // If trying to deactivate, check usage first
    if (category.is_active) {
      try {
        const response = await apiClient.checkGradeCategoryTypeUsage(category.id)
        if (response.data && response.data.inUse) {
          toast.error(`Cannot deactivate "${category.name}" - it is currently used by ${response.data.usageCount} subject weight(s)`)
          return
        }
      } catch (error) {
        toast.error('Failed to check category usage')
        console.error('Error checking category usage:', error)
        return
      }
    }

    try {
      const updatedCategory = { 
        name: category.name,
        description: category.description,
        color: category.color,
        is_active: !category.is_active,
        is_default: category.is_default
      }
      
      const response = await apiClient.updateGradeCategoryType(category.id, updatedCategory)
      if (response.data) {
        setGradeCategoryTypes(prev => 
          prev.map(cat => cat.id === category.id ? { ...cat, is_active: !category.is_active } : cat)
        )
        toast.success(`Category "${category.name}" ${!category.is_active ? 'activated' : 'deactivated'}`)
      }
    } catch (error) {
      toast.error('Failed to update category status')
      console.error('Error toggling category active status:', error)
    }
  }

  const openCategoryDialog = (mode: 'add' | 'edit', category?: any) => {
    setCategoryDialog({ open: true, mode, category })
    if (mode === 'edit' && category) {
      setCategoryForm({
        name: category.name || '',
        description: category.description || '',
        color: category.color || '#6366f1',
        is_default: category.is_default || false
      })
    } else {
      setCategoryForm({
        name: '',
        description: '',
        color: '#6366f1',
        is_default: false
      })
    }
  }

  const closeCategoryDialog = () => {
    setCategoryDialog({ open: false, mode: 'add', category: null })
    setCategoryForm({
      name: '',
      description: '',
      color: '#6366f1',
      is_default: false
    })
  }

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required')
      return
    }

    try {
      const categoryData = {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim(),
        color: categoryForm.color,
        is_active: categoryDialog.mode === 'edit' && categoryDialog.category ? categoryDialog.category.is_active : true,
        is_default: categoryForm.is_default
      }

      if (categoryDialog.mode === 'edit' && categoryDialog.category) {
        await apiClient.updateGradeCategoryType(categoryDialog.category.id, categoryData)
        toast.success('Grade category updated successfully')
      } else {
        await apiClient.createGradeCategoryType(categoryData)
        toast.success('Grade category created successfully')
      }

      // Refresh categories
      const categoriesRes = await apiClient.getGradeCategoryTypes()
      const categoriesData = Array.isArray((categoriesRes as any).data?.data) ? (categoriesRes as any).data.data : 
                            Array.isArray((categoriesRes as any).data) ? (categoriesRes as any).data : []
      setGradeCategoryTypes(categoriesData)

      closeCategoryDialog()
    } catch (error) {
      console.error('Failed to save grade category:', error)
      toast.error(`Failed to ${categoryDialog.mode === 'edit' ? 'update' : 'create'} grade category`)
    }
  }

  const deleteCategory = async (category: any) => {
    const confirmMessage = `Are you sure you want to delete "${category.name}"? This may affect existing lessons that use this category type.`

    if (!window.confirm(confirmMessage)) {
      return
    }

    try {
      await apiClient.deleteGradeCategoryType(category.id)
      toast.success('Grade category deleted successfully')
      
      // Remove from local state
      setGradeCategoryTypes(prev => prev.filter(c => c.id !== category.id))
    } catch (error) {
      console.error('Failed to delete grade category:', error)
      toast.error('Failed to delete grade category')
    }
  }

  const refreshStats = () => {
    loadSystemStats()
  }

  const exportData = async () => {
    try {
      // Get user profile for school settings
      const profileRes = await apiClient.getProfile()
      const userProfile = profileRes.data as any || {}
      
      // Get lessons for all subjects
      const lessonsData = []
      for (const subject of subjects) {
        try {
          const lessonsRes = await apiClient.getLessonsForSubject(subject.id)
          const lessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : []
          lessonsData.push(...lessons.map(lesson => ({ ...lesson, subjectId: subject.id })))
        } catch (error) {
          console.warn(`Failed to load lessons for subject ${subject.name}:`, error)
        }
      }

      const data = {
        // Core data
        students,
        subjects, 
        grades,
        lessons: lessonsData,
        
        // Category and group data
        gradeCategoryTypes,
        studentGroups,
        
        // School settings
        schoolSettings: {
          schoolName: userProfile.school_name || schoolSettings.schoolName,
          firstDayOfSchool: userProfile.first_day_of_school || schoolSettings.firstDayOfSchool,
          gradingPeriods: userProfile.grading_periods || schoolSettings.gradingPeriods
        },
        
        // Export metadata
        exportedAt: new Date().toISOString(),
        exportedBy: userProfile.email || 'Unknown',
        version: '1.0'
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gradeflow-complete-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast.success(`Exported complete backup with ${students.length} students, ${subjects.length} subjects, ${grades.length} grades, ${lessonsData.length} lessons, ${gradeCategoryTypes.length} categories, and ${studentGroups.length} groups`)
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Failed to export data')
    }
  }

  // Restore functions
  const openRestoreDialog = () => {
    setRestoreDialog({ open: true, type: 'json' })
    setSelectedFile(null)
  }

  const closeRestoreDialog = () => {
    setRestoreDialog({ open: false, type: 'json' })
    setSelectedFile(null)
    setIsRestoring(false)
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const performRestore = async () => {
    if (!selectedFile) {
      toast.error('Please select a backup file')
      return
    }

    setIsRestoring(true)
    try {
      const result = await apiClient.restoreFromJSON(selectedFile, restoreOptions)
      toast.success(`Restored: ${result.restored.students} students, ${result.restored.subjects} subjects, ${result.restored.grades} grades, ${result.restored.lessons} lessons`)
      
      closeRestoreDialog()
      // Refresh data
      loadSystemStats()
    } catch (error) {
      console.error('Restore failed:', error)
      toast.error(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsRestoring(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Calculate storage size estimate
  const getStorageSize = () => {
    const dataSize = JSON.stringify({ students, subjects, grades }).length
    return dataSize * 2 // Rough estimate including metadata
  }

  // Calculate grades entered today (last 24 hours from now)
  const getGradesToday = () => {
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    return grades.filter(grade => {
      if (!grade.created_at) return false
      const gradeTime = new Date(grade.created_at)
      // Only count grades created in the last 24 hours
      return gradeTime >= twentyFourHoursAgo && gradeTime <= now
    }).length
  }

  // Get system statistics
  const stats = {
    gradesToday: getGradesToday(),
    totalStudents: students.length,
    totalSubjects: subjects.length,
    totalGrades: grades.length,
    storageSize: getStorageSize()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="animate-spin" size={20} />
          Loading system statistics...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">System Administration</h2>
          <p className="text-muted-foreground">Monitor and manage your GradeFlow data</p>
        </div>
        <Button onClick={refreshStats} variant="outline" className="flex items-center gap-2">
          <RefreshCw size={16} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Grades</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.gradesToday || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Last 24 hours
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalStudents || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Across all teachers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Grades</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalGrades || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Grade entries recorded
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatBytes(stats?.storageSize || 0)}</div>
                <p className="text-xs text-muted-foreground">
                  Estimated usage
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Data Integrity</span>
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    <CheckCircle size={12} className="mr-1" />
                    Healthy
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Storage Efficiency</span>
                  <Badge variant="default" className="bg-blue-100 text-blue-800">
                    <Database size={12} className="mr-1" />
                    Optimized
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Cache Performance</span>
                  <Badge variant="default" className="bg-purple-100 text-purple-800">
                    <Activity size={12} className="mr-1" />
                    Active
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button onClick={exportData} className="w-full justify-start" variant="outline">
                  <Download size={16} className="mr-2" />
                  Export Data
                </Button>
                <Button onClick={refreshStats} className="w-full justify-start" variant="outline">
                  <RefreshCw size={16} className="mr-2" />
                  Refresh Stats
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <School size={20} />
                  School Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="schoolName">School Name</Label>
                  <Input
                    id="schoolName"
                    value={schoolSettings.schoolName}
                    onChange={(e) => setSchoolSettings(prev => ({ ...prev, schoolName: e.target.value }))}
                    placeholder="Enter school name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="firstDay" className="flex items-center gap-2">
                    <Calendar size={16} />
                    First Day of School
                  </Label>
                  <Input
                    id="firstDay"
                    type="date"
                    value={schoolSettings.firstDayOfSchool}
                    onChange={(e) => setSchoolSettings(prev => ({ ...prev, firstDayOfSchool: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gradingPeriods">Number of Grading Periods</Label>
                  <Select 
                    value={schoolSettings.gradingPeriods.toString()} 
                    onValueChange={(value) => setSchoolSettings(prev => ({ ...prev, gradingPeriods: parseInt(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 Periods (Trimester)</SelectItem>
                      <SelectItem value="4">4 Periods (Quarter)</SelectItem>
                      <SelectItem value="6">6 Periods (Six Weeks)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={saveSettings} className="w-full">
                  Save School Settings
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key size={20} />
                  Change Password
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwordChange.currentPassword}
                    onChange={(e) => setPasswordChange(prev => ({ ...prev, currentPassword: e.target.value }))}
                    placeholder="Enter current password"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordChange.newPassword}
                    onChange={(e) => setPasswordChange(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="Enter new password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordChange.confirmPassword}
                    onChange={(e) => setPasswordChange(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Confirm new password"
                  />
                </div>

                <Button 
                  onClick={changePassword} 
                  className="w-full"
                  disabled={!passwordChange.currentPassword || !passwordChange.newPassword || !passwordChange.confirmPassword}
                >
                  Change Password
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <UserCheck size={20} />
                  Student Groups
                </CardTitle>
                <Button onClick={() => openGroupDialog('add')} size="sm">
                  <Plus size={16} className="mr-2" />
                  Add Group
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {studentGroups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <UserCheck size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No student groups found</p>
                  <p className="text-sm mb-4">Create groups to organize your students</p>
                  <Button onClick={() => openGroupDialog('add')} variant="outline">
                    <Plus size={16} className="mr-2" />
                    Create First Group
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {studentGroups.map((group, index) => {
                    // Calculate student count using modern studentGroupId field
                    const studentCount = students.filter(student => 
                      student.studentGroupId === group.id
                    ).length
                    
                    return (
                      <div key={group.id || index} className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{group.name || `Group ${index + 1}`}</h4>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline">
                              {studentCount} students
                            </Badge>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => openGroupDialog('edit', group)}
                              className="h-8 w-8"
                              title="Edit Group"
                            >
                              <Pencil size={14} />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => deleteStudentGroup(group)}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="Delete Group"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                        {group.description && (
                          <p className="text-sm text-muted-foreground mb-2">{group.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Created: {group.created_at ? new Date(group.created_at).toLocaleDateString() : 'Unknown'}</span>
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
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Activity size={20} />
                  Grade Category Types
                </CardTitle>
                <Button onClick={() => openCategoryDialog('add')} size="sm">
                  <Plus size={16} className="mr-2" />
                  Add Category
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {gradeCategoryTypes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No grade category types found</p>
                  <p className="text-sm mb-4">Manage the types of grading categories available for lessons</p>
                  <Button onClick={() => openCategoryDialog('add')} variant="outline">
                    <Plus size={16} className="mr-2" />
                    Create First Category
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {gradeCategoryTypes.map((category, index) => (
                    <div key={category.id || index} className="p-4 bg-muted/30 rounded-lg border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-4 h-4 rounded-full border-2 border-gray-300"
                            style={{ backgroundColor: category.color || '#6366f1' }}
                            title={`Color: ${category.color || '#6366f1'}`}
                          />
                          <h4 className="font-medium">{category.name || `Category ${index + 1}`}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`active-${category.id}`} className="text-sm">Active</Label>
                            <Switch
                              id={`active-${category.id}`}
                              checked={category.is_active !== undefined ? category.is_active : true}
                              onCheckedChange={() => toggleCategoryActive(category)}
                            />
                          </div>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => openCategoryDialog('edit', category)}
                            className="h-8 w-8"
                            title="Edit Category"
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => deleteCategory(category)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Delete Category"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                      {category.description && (
                        <p className="text-sm text-muted-foreground mb-2">{category.description}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Color: {category.color || '#6366f1'}</span>
                        {category.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backups" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Data Management</h3>
            <Button onClick={exportData} className="flex items-center gap-2">
              <Download size={16} />
              Export User Data
            </Button>
          </div>

          {/* User Data Export */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileJson size={20} />
                User Data Export (JSON)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Export your personal data for backup or migration
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 grid-cols-3 mb-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-lg font-bold text-blue-600">{students.length}</div>
                  <div className="text-xs text-muted-foreground">Students</div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-lg font-bold text-green-600">{subjects.length}</div>
                  <div className="text-xs text-muted-foreground">Subjects</div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-lg font-bold text-purple-600">{grades.length}</div>
                  <div className="text-xs text-muted-foreground">Grades</div>
                </div>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Export Format</h4>
                <p className="text-sm text-blue-700 mb-3">
                  Data will be exported as a JSON file containing all your students, subjects, lessons, grades, categories, and groups.
                </p>
                <div className="flex gap-2">
                  <Button onClick={exportData} className="flex items-center gap-2">
                    <Download size={16} />
                    Export Data
                  </Button>
                  <Button 
                    onClick={() => openRestoreDialog()} 
                    variant="outline" 
                    className="flex items-center gap-2"
                  >
                    <Upload size={16} />
                    Restore from JSON
                  </Button>
                </div>
              </div>
              
              {lastRefresh && (
                <p className="text-xs text-muted-foreground text-center mt-4">
                  Data last refreshed: {lastRefresh.toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Student Group Dialog */}
      <Dialog open={groupDialog.open} onOpenChange={(open) => !open && closeGroupDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {groupDialog.mode === 'edit' ? 'Edit Student Group' : 'Add Student Group'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name *</Label>
              <Input
                id="group-name"
                value={groupForm.name}
                onChange={(e) => setGroupForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter group name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-description">Description</Label>
              <Textarea
                id="group-description"
                value={groupForm.description}
                onChange={(e) => setGroupForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter group description (optional)"
                rows={3}
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={saveStudentGroup} className="flex-1" disabled={!groupForm.name.trim()}>
                {groupDialog.mode === 'edit' ? 'Save Changes' : 'Create Group'}
              </Button>
              <Button variant="outline" onClick={closeGroupDialog}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Grade Category Type Dialog */}
      <Dialog open={categoryDialog.open} onOpenChange={(open) => !open && closeCategoryDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {categoryDialog.mode === 'edit' ? 'Edit Grade Category Type' : 'Add Grade Category Type'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Category Name *</Label>
              <Input
                id="category-name"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Lesson, Quiz, Test, Project"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-description">Description</Label>
              <Textarea
                id="category-description"
                value={categoryForm.description}
                onChange={(e) => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this category type"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-color">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="category-color"
                  type="color"
                  value={categoryForm.color}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, color: e.target.value }))}
                  className="w-16 h-10 p-1 rounded border"
                />
                <Input
                  type="text"
                  value={categoryForm.color}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, color: e.target.value }))}
                  placeholder="#6366f1"
                  className="flex-1"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="category-default"
                checked={categoryForm.is_default}
                onCheckedChange={(checked) => setCategoryForm(prev => ({ ...prev, is_default: checked }))}
              />
              <Label htmlFor="category-default" className="text-sm font-medium">
                Default type (no special styling in grade entry)
              </Label>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={saveCategory} className="flex-1" disabled={!categoryForm.name.trim()}>
                {categoryDialog.mode === 'edit' ? 'Save Changes' : 'Create Category'}
              </Button>
              <Button variant="outline" onClick={closeCategoryDialog}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={restoreDialog.open} onOpenChange={(open) => !open && closeRestoreDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Restore Data from JSON Backup
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="restore-file">Select Backup File</Label>
              <Input
                id="restore-file"
                type="file"
                accept=".json"
                onChange={handleFileSelect}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium">Restore Options</h4>
              <div className="flex items-center space-x-2">
                <Switch
                  id="merge-data"
                  checked={restoreOptions.mergeData}
                  onCheckedChange={(checked) => setRestoreOptions(prev => ({ ...prev, mergeData: checked }))}
                />
                <Label htmlFor="merge-data" className="text-sm">
                  Merge with existing data (skip duplicates)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="update-settings"
                  checked={restoreOptions.updateSettings}
                  onCheckedChange={(checked) => setRestoreOptions(prev => ({ ...prev, updateSettings: checked }))}
                />
                <Label htmlFor="update-settings" className="text-sm">
                  Update school settings
                </Label>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                onClick={performRestore} 
                className="flex-1" 
                disabled={!selectedFile || isRestoring}
              >
                {isRestoring ? 'Restoring...' : 'Restore from JSON'}
              </Button>
              <Button variant="outline" onClick={closeRestoreDialog} disabled={isRestoring}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}