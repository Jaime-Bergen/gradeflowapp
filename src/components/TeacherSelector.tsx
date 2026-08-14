import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
//import { Button } from "@/components/ui/button"
import { Users } from "lucide-react"
import { apiClient } from '@/lib/api'
import { toast } from 'sonner'

interface Teacher {
  id: string
  name: string
  email: string
  is_active: boolean
  assigned_groups: {
    id: string
    name: string
    description?: string
  }[]
}

interface TeacherSelectorProps {
  onTeacherChange: (teacher: Teacher | null) => void
}

export default function TeacherSelector({ onTeacherChange }: TeacherSelectorProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSingleTeacherLicense, setIsSingleTeacherLicense] = useState(false)

  useEffect(() => {
    loadTeachers()
    
    // Listen for teacher updates from Admin/Settings
    const handleTeacherUpdated = () => {
      loadTeachers()
    }
    
    window.addEventListener('gradeflow-teachers-updated', handleTeacherUpdated)
    return () => {
      window.removeEventListener('gradeflow-teachers-updated', handleTeacherUpdated)
    }
  }, [])

  // Load saved teacher selection on mount
  useEffect(() => {
    const savedTeacherId = localStorage.getItem('selectedTeacherId')
    if (savedTeacherId && teachers.length > 0) {
      if (savedTeacherId === 'admin') {
        // Handle admin selection
        setSelectedTeacher(null)
        onTeacherChange(null)
        window.SELECTED_TEACHER_GROUPS = []
        window.dispatchEvent(new CustomEvent('teacher-selection-changed'))
      } else {
        const teacher = teachers.find((t: Teacher) => t.id === savedTeacherId)
        if (teacher) {
          setSelectedTeacher(teacher)
          onTeacherChange(teacher)
          window.dispatchEvent(new CustomEvent('teacher-selection-changed'))
        }
      }
    }
  }, [teachers, onTeacherChange])

  const loadTeachers = async () => {
    try {
      setIsLoading(true)
      const [response, profileRes] = await Promise.all([
        apiClient.getTeachers(),
        apiClient.getProfile()
      ])
      const teachersData = Array.isArray(response.data?.data) ? response.data.data : []
      setTeachers(teachersData)
      const profileData: any = profileRes.data || {}
      const isSingle = profileData.active_license_tier === 'single'
      setIsSingleTeacherLicense(isSingle)
      
      // Auto-select saved teacher or admin as default if available
      if (!isSingle && teachersData.length > 0) {
        const savedTeacherId = localStorage.getItem('selectedTeacherId')
        
        if (savedTeacherId === 'admin') {
          // Admin selection
          setSelectedTeacher(null)
          onTeacherChange(null)
          window.SELECTED_TEACHER_GROUPS = []
        } else if (savedTeacherId && teachersData.find((t: Teacher) => t.id === savedTeacherId)) {
          // Valid saved teacher
          const teacherToSelect = teachersData.find((t: Teacher) => t.id === savedTeacherId)!
          setSelectedTeacher(teacherToSelect)
          onTeacherChange(teacherToSelect)
        } else {
          // Default to admin to show all data initially
          setSelectedTeacher(null)
          onTeacherChange(null)
          window.SELECTED_TEACHER_GROUPS = []
          localStorage.setItem('selectedTeacherId', 'admin')
        }
        
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('teacher-selection-changed'))
      } else if (isSingle) {
        // Single-teacher license always runs in a fixed unfiltered mode.
        setSelectedTeacher(null)
        onTeacherChange(null)
        window.SELECTED_TEACHER_GROUPS = []
        localStorage.setItem('selectedTeacherId', 'admin')
        window.dispatchEvent(new CustomEvent('teacher-selection-changed'))
      }
    } catch (error) {
      console.error('Failed to load teachers:', error)
      toast.error('Failed to load teachers')
    } finally {
      setIsLoading(false)
    }
  }

  const handleTeacherSelect = (value: string) => {
    if (value === 'admin') {
      // Admin selection - show all data unfiltered
      setSelectedTeacher(null)
      onTeacherChange(null)
      
      // Clear teacher groups to show all data
      window.SELECTED_TEACHER_GROUPS = []
      localStorage.setItem('selectedTeacherId', 'admin')
    } else {
      // Regular teacher selection
      const teacher = teachers.find((t: Teacher) => t.id === value) || null
      setSelectedTeacher(teacher)
      onTeacherChange(teacher)
      
      // Save selection to localStorage
      if (teacher) {
        localStorage.setItem('selectedTeacherId', teacher.id)
      } else {
        localStorage.removeItem('selectedTeacherId')
      }
    }
    
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent('teacher-selection-changed'))
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Users size={16} />
        <span>Loading...</span>
      </div>
    )
  }

  if (teachers.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">No teachers found</span>
      </div>
    )
  }

  if (isSingleTeacherLicense) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
              <Users size={16} className="text-muted-foreground" />
              <span className="font-medium">Teacher Mode</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs text-xs">
              Consider upgrading to a school license for full teacher collaboration on a single platform.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-muted-foreground" />
        <Select value={selectedTeacher?.id || 'admin'} onValueChange={handleTeacherSelect}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select teacher..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">
              <span className="font-medium text-blue-600">Admin (All Data)</span>
            </SelectItem>
            {teachers.map((teacher) => (
              <SelectItem key={teacher.id} value={teacher.id}>
                {teacher.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}