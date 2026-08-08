import { Suspense, lazy, useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

import UserAuth, { UserData } from './components/UserAuth'
import TeacherSelector from './components/TeacherSelector'
import { Toaster } from 'sonner'
import { apiClient } from '@/lib/api'

const Dashboard = lazy(() => import('./components/Dashboard'))
const Students = lazy(() => import('./components/Students'))
const Subjects = lazy(() => import('./components/Subjects'))
const GradeEntry = lazy(() => import('./components/GradeEntry.tsx'))
const Reports = lazy(() => import('./components/Reports.tsx'))
const SystemAdmin = lazy(() => import('./components/SystemAdmin.tsx'))
const Help = lazy(() => import('./components/Help'))
const AdminDanger = lazy(() => import('@/components/AdminDanger'))

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

  const refreshYearContext = async () => {
    if (!apiClient.isAuthenticated()) {
      setActiveSchoolYearLabel(null)
      return
    }

    try {
      const profile = await apiClient.getProfile()
      setActiveSchoolYearLabel((profile.data as any)?.active_school_year_label || null)
    } catch (error) {
      console.error('Failed to refresh school year context:', error)
    }
  }

  useEffect(() => {
    if (!currentUser) {
      setActiveSchoolYearLabel(null)
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

  return (
    <>
      <Routes>
        <Route path="/AdminDanger" element={<Suspense fallback={tabFallback}><AdminDanger /></Suspense>} />
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
                    <TeacherSelector onTeacherChange={handleTeacherChange} />
                  </div>
                </div>
              </header>
              {activeSchoolYearLabel && (
                <div className={`border-b px-6 py-2 text-sm ${
                  activeSchoolYearLabel === getCurrentSchoolYearLabel()
                    ? 'bg-green-50 text-green-900 border-green-200'
                    : 'bg-amber-50 text-amber-900 border-amber-200'
                }`}>
                  <div className="container mx-auto flex items-center justify-between gap-3">
                    <span className="font-medium">Active School Year: {activeSchoolYearLabel}</span>
                    {activeSchoolYearLabel !== getCurrentSchoolYearLabel() && (
                      <span className="text-xs font-semibold uppercase tracking-wide">Historical Context</span>
                    )}
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
      <Toaster />
    </>
  )
}

export default App