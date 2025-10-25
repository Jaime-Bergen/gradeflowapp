import { useState, useEffect } from 'react'
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

import Dashboard from './components/Dashboard'
import Students from './components/Students'
import Subjects from './components/Subjects'
import GradeEntry from './components/GradeEntry'
import Reports from './components/Reports'
import SystemAdmin from './components/SystemAdmin'
import Help from './components/Help'
import UserAuth, { UserData } from './components/UserAuth'
import AdminDanger from '@/components/AdminDanger'
import { Toaster } from 'sonner'

// Global type declarations
declare global {
  interface Window {
    CURRENT_USER_ID?: string
  }
}

function App() {
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

  const handleUserChange = (userData: UserData | null) => {
    setCurrentUser(userData)
    // Set global user context for data isolation
    if (userData) {
      window.CURRENT_USER_ID = userData.id
    } else {
      delete window.CURRENT_USER_ID
    }
  }

  return (
    <>
      <Routes>
        <Route path="/AdminDanger" element={<AdminDanger />} />
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
                    <UserAuth onUserChange={handleUserChange} />
                  </div>
                </div>
              </header>
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
                    <Dashboard />
                  </TabsContent>
                  
                  <TabsContent value="students" className="space-y-6">
                    <Students />
                  </TabsContent>
                  
                  <TabsContent value="subjects" className="space-y-6">
                    <Subjects />
                  </TabsContent>
                  
                  <TabsContent value="grades" className="space-y-6">
                    <GradeEntry />
                  </TabsContent>
                  
                  <TabsContent value="reports" className="space-y-6">
                    <Reports />
                  </TabsContent>
                  
                  <TabsContent value="admin" className="space-y-6">
                    <SystemAdmin />
                  </TabsContent>
                  
                  <TabsContent value="help" className="space-y-6">
                    <Help />
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