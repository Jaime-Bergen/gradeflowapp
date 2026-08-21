import { Suspense, lazy, useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Routes, Route } from 'react-router-dom'
import { 
  GraduationCap, 
  ChartBar, 
  FileText, 
  Users, 
  BookOpen, 
  Gear,
  Database,
  Question
} from "@phosphor-icons/react"

import UserAuth, { UserData } from './components/UserAuth.tsx'
import TeacherSelector from './components/TeacherSelector.tsx'
import { Toaster, toast } from 'sonner'
import { apiClient } from '@/lib/api'
import { SchoolYear } from '@/lib/types'
import { Badge } from "@/components/ui/badge"

const Dashboard = lazy(() => import('./components/Dashboard.tsx'))
const Students = lazy(() => import('./components/Students.tsx'))
const Subjects = lazy(() => import('./components/Subjects.tsx'))
const GradeEntry = lazy(() => import('./components/GradeEntry.tsx'))
const Reports = lazy(() => import('./components/Reports.tsx'))
const SystemAdmin = lazy(() => import('./components/SystemAdmin.tsx'))
const Help = lazy(() => import('./components/Help.tsx'))
const AdminDanger = lazy(() => import('@/components/AdminDanger.tsx'))
const Purchase = lazy(() => import('./components/Purchase.tsx'))
const VerifyEmail = lazy(() => import('./components/VerifyEmail.tsx'))
const TeacherSignIn = lazy(() => import('./components/TeacherSignIn.tsx'))
const PURCHASE_URL = '/purchase'
const SALES_EMAIL = 'sales@gradeflowapp.com'

// Global type declarations
declare global {
  interface Window {
    CURRENT_USER_ID?: string
    SELECTED_TEACHER_GROUPS?: string[]
  }
}

const getCurrentSchoolYearLabel = () => {
  const now = new Date()
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${year + 1}`
}

const getYearContextLabelFromDateRange = (
  activeSchoolYearId: string,
  licensedSchoolYears: SchoolYear[]
) => {
  const activeYear = licensedSchoolYears.find((year) => year.id === activeSchoolYearId)
  if (!activeYear?.start_date || !activeYear?.end_date) {
    return 'Historical Context'
  }

  const startDate = new Date(activeYear.start_date)
  const endDate = new Date(activeYear.end_date)
  const now = new Date()

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 'Historical Context'
  }

  if (now < startDate) {
    return 'Future Context'
  }

  if (now > endDate) {
    return 'Historical Context'
  }

  return 'Current Context'
}

function App() {
  const tabFallback = <div className="p-8 text-muted-foreground">Loading...</div>

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string }>
      if (customEvent.detail?.tab) {
        setActiveTab(customEvent.detail.tab)
      }
    }
    window.addEventListener('gradeflow-goto-tab', handler)
    return () => window.removeEventListener('gradeflow-goto-tab', handler)
  }, [])
  const [activeTab, setActiveTab] = useState("dashboard")
  const [currentUser, setCurrentUser] = useState<UserData | null>(null)
  const [activeSchoolYearLabel, setActiveSchoolYearLabel] = useState<string | null>(null)
  const [activeSchoolYearId, setActiveSchoolYearId] = useState('')
  const [licensedSchoolYears, setLicensedSchoolYears] = useState<SchoolYear[]>([])
  const [schoolYearDialogOpen, setSchoolYearDialogOpen] = useState(false)
  const [noLicenseDialogOpen, setNoLicenseDialogOpen] = useState(false)
  const [pendingSchoolYearId, setPendingSchoolYearId] = useState('')
  const [isUpdatingSchoolYear, setIsUpdatingSchoolYear] = useState(false)

  const refreshYearContext = async () => {
    if (!apiClient.isAuthenticated()) {
      setActiveSchoolYearLabel(null)
      setActiveSchoolYearId('')
      setLicensedSchoolYears([])
      setNoLicenseDialogOpen(false)
      setPendingSchoolYearId('')
      return
    }

    try {
      const profile = await apiClient.getProfile()
      if (profile.error) {
        throw new Error(profile.error)
      }

      const profileData = (profile.data as any) || {}
      const resolvedActiveYearId = profileData.active_school_year_id || ''
      const years = Array.isArray(profileData.licensed_school_years) ? profileData.licensed_school_years : []

      setActiveSchoolYearLabel(profileData.active_school_year_label || null)
      setActiveSchoolYearId(resolvedActiveYearId)
      setLicensedSchoolYears(years)
      setPendingSchoolYearId(resolvedActiveYearId || years[0]?.id || '')
      setNoLicenseDialogOpen(years.length === 0)
    } catch (error) {
      console.error('Failed to refresh school year context:', error)
    }
  }

  const openSchoolYearDialog = () => {
    if (licensedSchoolYears.length === 0) {
      setNoLicenseDialogOpen(true)
      return
    }

    setPendingSchoolYearId(activeSchoolYearId || licensedSchoolYears[0]?.id || '')
    setSchoolYearDialogOpen(true)
  }

  const saveActiveSchoolYear = async () => {
    if (!pendingSchoolYearId) {
      toast.error('Select a licensed school year first')
      return
    }

    if (pendingSchoolYearId === activeSchoolYearId) {
      setSchoolYearDialogOpen(false)
      return
    }

    try {
      setIsUpdatingSchoolYear(true)
      const response = await apiClient.setActiveSchoolYear(pendingSchoolYearId)
      if (response.error) {
        throw new Error(response.error)
      }

      const updated = (response.data as any) || {}
      setActiveSchoolYearId(updated.active_school_year_id || pendingSchoolYearId)
      setActiveSchoolYearLabel(updated.active_school_year_label || null)
      window.dispatchEvent(new CustomEvent('gradeflow-profile-updated'))
      toast.success('Active school year updated')
      setSchoolYearDialogOpen(false)
    } catch (error) {
      console.error('Failed to set active school year:', error)
      toast.error('Failed to set active school year')
    } finally {
      setIsUpdatingSchoolYear(false)
    }
  }

  useEffect(() => {
    if (!currentUser) {
      setActiveSchoolYearLabel(null)
      setActiveSchoolYearId('')
      setLicensedSchoolYears([])
      setNoLicenseDialogOpen(false)
      setPendingSchoolYearId('')
      return
    }

    refreshYearContext()

    const handler = () => {
      refreshYearContext()
    }

    window.addEventListener('gradeflow-profile-updated', handler)
    return () => {
      window.removeEventListener('gradeflow-profile-updated', handler)
    }
  }, [currentUser])

  const handleUserChange = (userData: UserData | null) => {
    setCurrentUser(userData)
    // Set global user context for data isolation
    if (userData) {
      window.CURRENT_USER_ID = userData.id
    } else {
      delete window.CURRENT_USER_ID
    }
  }

  const handleTeacherChange = (teacher: any) => {
    // Store selected teacher's group IDs globally for filtering
    if (teacher && teacher.assigned_groups) {
      window.SELECTED_TEACHER_GROUPS = teacher.assigned_groups.map((g: any) => g.id)
    } else {
      // For admin or no teacher selection, set empty array to show all data
      window.SELECTED_TEACHER_GROUPS = []
    }
  }

  const schoolYearContextLabel = getYearContextLabelFromDateRange(activeSchoolYearId, licensedSchoolYears)
  const pendingSchoolYear = licensedSchoolYears.find((year: any) => year.id === pendingSchoolYearId)
  const pendingLicenseType = (pendingSchoolYear as any)?.license_tier === 'trial'
    ? 'Trial'
    : (pendingSchoolYear as any)?.license_tier === 'single'
      ? 'Single Teacher'
      : 'School'
  const activeLicensedYear = licensedSchoolYears.find((year: any) => year.id === activeSchoolYearId) as any
  const activeGrantSource = String(activeLicensedYear?.grant_source || '').toLowerCase()
  const activeLicenseTier = String(activeLicensedYear?.license_tier || '').toLowerCase()
  const isTrialMode = activeGrantSource === 'trial' || activeLicenseTier === 'trial'

  return (
    <>
      <Routes>
        <Route path="/AdminDanger" element={<Suspense fallback={tabFallback}><AdminDanger /></Suspense>} />
        <Route path="/purchase" element={<Suspense fallback={tabFallback}><Purchase /></Suspense>} />
        <Route path="/verify-email" element={<Suspense fallback={tabFallback}><VerifyEmail /></Suspense>} />
        <Route path="/teacher-signin" element={<Suspense fallback={tabFallback}><TeacherSignIn /></Suspense>} />
        <Route path="*" element={
          !currentUser ? (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-8">
              <UserAuth onUserChange={handleUserChange} />
            </div>
          ) : (
            <div className="min-h-screen bg-background">
              <header className="border-b border-border bg-card">
                <div className="container mx-auto px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GraduationCap size={32} className="text-primary" weight="bold" />
                      <div>
                        <h1 className="text-2xl font-bold text-foreground">GradeFlow</h1>
                        <p className="text-sm text-muted-foreground">Streamlined Grade Management</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <TeacherSelector onTeacherChange={handleTeacherChange} />
                      {isTrialMode && (
                        <Badge variant="secondary" className="text-[11px]">
                          Trial Mode · 100 grade limit
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={openSchoolYearDialog}
                        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      >
                        Active License: {activeSchoolYearLabel || 'None'}
                      </button>
                    </div>
                  </div>
                </div>
              </header>
              {activeSchoolYearLabel && activeSchoolYearLabel !== getCurrentSchoolYearLabel() && (
                <div className="border-b px-6 py-2 text-sm bg-amber-50 text-amber-900 border-amber-200">
                  <div className="container mx-auto flex items-center justify-between gap-3">
                    <span className="font-medium">Active School Year: {activeSchoolYearLabel}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide">{schoolYearContextLabel}</span>
                  </div>
                </div>
              )}
              <div className="container mx-auto px-6 py-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                  <TabsList className="grid w-full grid-cols-7 lg:w-auto lg:grid-cols-7">
                    <TabsTrigger value="dashboard" className="flex items-center gap-2">
                      <ChartBar size={18} />
                      <span className="hidden sm:inline">Dashboard</span>
                    </TabsTrigger>
                    <TabsTrigger value="students" className="flex items-center gap-2">
                      <Users size={18} />
                      <span className="hidden sm:inline">Students</span>
                    </TabsTrigger>
                    <TabsTrigger value="subjects" className="flex items-center gap-2">
                      <BookOpen size={18} />
                      <span className="hidden sm:inline">Subjects</span>
                    </TabsTrigger>
                    <TabsTrigger value="grades" className="flex items-center gap-2">
                      <Gear size={18} />
                      <span className="hidden sm:inline">Grades</span>
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="flex items-center gap-2">
                      <FileText size={18} />
                      <span className="hidden sm:inline">Reports</span>
                    </TabsTrigger>
                    <TabsTrigger value="admin" className="flex items-center gap-2">
                      <Database size={18} />
                      <span className="hidden sm:inline">Admin</span>
                    </TabsTrigger>
                    <TabsTrigger value="help" className="flex items-center gap-2">
                      <Question size={18} />
                      <span className="hidden sm:inline">Help</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="dashboard" className="space-y-6">
                    <Suspense fallback={tabFallback}>
                      <Dashboard />
                    </Suspense>
                  </TabsContent>
                  
                  <TabsContent value="students" className="space-y-6">
                    <Suspense fallback={tabFallback}>
                      <Students />
                    </Suspense>
                  </TabsContent>
                  
                  <TabsContent value="subjects" className="space-y-6">
                    <Suspense fallback={tabFallback}>
                      <Subjects />
                    </Suspense>
                  </TabsContent>
                  
                  <TabsContent value="grades" className="space-y-6">
                    <Suspense fallback={tabFallback}>
                      <GradeEntry />
                    </Suspense>
                  </TabsContent>
                  
                  <TabsContent value="reports" className="space-y-6">
                    <Suspense fallback={tabFallback}>
                      <Reports />
                    </Suspense>
                  </TabsContent>
                  
                  <TabsContent value="admin" className="space-y-6">
                    <Suspense fallback={tabFallback}>
                      <SystemAdmin />
                    </Suspense>
                  </TabsContent>
                  
                  <TabsContent value="help" className="space-y-6">
                    <Suspense fallback={tabFallback}>
                      <Help />
                    </Suspense>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )
        } />
      </Routes>

      <Dialog open={schoolYearDialogOpen} onOpenChange={setSchoolYearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Active School Year</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="active-school-year-dialog">Licensed School Years</Label>
              <Select value={pendingSchoolYearId || undefined} onValueChange={setPendingSchoolYearId}>
                <SelectTrigger id="active-school-year-dialog">
                  <SelectValue placeholder="Select licensed school year" />
                </SelectTrigger>
                <SelectContent>
                  {licensedSchoolYears.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>License Type</Label>
              <div className="text-sm text-muted-foreground">
                {pendingLicenseType}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Need access to another school year? Purchase a license at{' '}
              <a href={PURCHASE_URL} target="_blank" rel="noreferrer" className="underline">
                gradeflowapp.com/purchase
              </a>
              .
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSchoolYearDialogOpen(false)} disabled={isUpdatingSchoolYear}>
                Cancel
              </Button>
              <Button onClick={saveActiveSchoolYear} disabled={!pendingSchoolYearId || isUpdatingSchoolYear}>
                {isUpdatingSchoolYear ? 'Saving...' : 'Set Active Year'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={noLicenseDialogOpen} onOpenChange={setNoLicenseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Active License Found</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Your account does not currently have a licensed school year. You can purchase a license to activate GradeFlow features.
            </p>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              Year-specific features are unavailable until a license is added.
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={PURCHASE_URL} target="_blank" rel="noreferrer">
                  Purchase License
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`mailto:${SALES_EMAIL}`}>
                  Contact Sales
                </a>
              </Button>
              <Button variant="ghost" onClick={() => { void refreshYearContext() }}>
                I Purchased, Refresh
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Questions? Email {SALES_EMAIL}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Toaster />
    </>
  )
}

export default App