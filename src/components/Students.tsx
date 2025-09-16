import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash, UserPlus, Upload, PencilSimple, CaretDown } from "@phosphor-icons/react"
import { Student, Subject } from '@/lib/types'
import { toast } from 'sonner'

export default function Students() {
  const [students, setStudents] = useState<Student[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [studentGroups, setStudentGroups] = useState<any[]>([])
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false)
  const [isGroupDropdownOpenEdit, setIsGroupDropdownOpenEdit] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [editSelectedGroupIds, setEditSelectedGroupIds] = useState<string[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)
  const editDropdownRef = useRef<HTMLDivElement>(null)

  const [newStudent, setNewStudent] = useState({
    name: '',
    subjects: [] as string[]
  })

  const fetchData = async () => {
    try {
      const studentsRes = await apiClient.getStudents();
      setStudents(Array.isArray(studentsRes.data)
        ? studentsRes.data
        : (studentsRes.data as any)?.students || []
      )
      
      const subjectsRes = await apiClient.getSubjects()
      setSubjects(Array.isArray(subjectsRes.data) 
        ? subjectsRes.data 
        : (subjectsRes.data as any)?.subjects || []
      )

      const groupsRes = await apiClient.getStudentGroups()
      const rawGroups = Array.isArray(groupsRes.data) 
        ? groupsRes.data 
        : (groupsRes.data as any)?.groups || []
      
      // Deduplicate groups by ID to prevent React key conflicts
      const uniqueGroups = rawGroups.filter((group: any, index: number, self: any[]) => 
        index === self.findIndex((g: any) => g.id === group.id)
      )
      setStudentGroups(uniqueGroups)
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to fetch data')
    }
  }

  useEffect(() => { 
    fetchData() 

    // Add click-outside handler for dropdowns
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsGroupDropdownOpen(false)
      }
      if (editDropdownRef.current && !editDropdownRef.current.contains(event.target as Node)) {
        setIsGroupDropdownOpenEdit(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const createNewGroup = async () => {
    if (!newGroupName.trim()) return

    setIsCreatingGroup(true)
    try {
      const result = await apiClient.createStudentGroup({ name: newGroupName.trim() })
      await fetchData() // Refresh groups
      
      // Add the new group to selected groups
      const newGroupId = (result.data as any)?.id || (result.data as any)?.group?.id
      if (newGroupId) {
        setSelectedGroupIds(prev => 
          prev.includes(newGroupId) ? prev : [...prev, newGroupId]
        )
      }
      
      setNewGroupName('')
      toast.success('Group created successfully')
    } catch (error) {
      toast.error('Failed to create group')
      console.error('Error creating group:', error)
    } finally {
      setIsCreatingGroup(false)
    }
  }

  // Check if removing a group would affect enrolled subjects
  const checkGroupRemovalWarning = (groupToRemove: any, student: Student) => {
    if (!student || !groupToRemove) return null;
    
    // Get the group names that would remain after removal
    const remainingGroupIds = editSelectedGroupIds.filter(id => id !== groupToRemove.id);
    const remainingGroupNames = remainingGroupIds
      .map(id => studentGroups.find(g => g.id === id)?.name)
      .filter(Boolean)
      .join(',');
    
    // Get subjects available to remaining groups
    const remainingAvailableSubjects = getAvailableSubjects(remainingGroupNames);
    const remainingSubjectIds = remainingAvailableSubjects.map(s => s.id);
    
    // Find enrolled subjects that would no longer be available
    const affectedSubjects = student.subjects
      .map(subjectId => subjects.find(s => s.id === subjectId))
      .filter(subject => subject && !remainingSubjectIds.includes(subject.id));
    
    return affectedSubjects.length > 0 ? affectedSubjects : null;
  };

  const handleGroupDeselection = (group: any) => {
    if (!editingStudent) return;
    
    const affectedSubjects = checkGroupRemovalWarning(group, editingStudent);
    
    if (affectedSubjects && affectedSubjects.length > 0) {
      const subjectNames = affectedSubjects.map(s => s?.name).filter(Boolean).join(', ');
      const proceed = window.confirm(
        `Warning: Removing "${group.name}" will make these enrolled subjects unavailable: ${subjectNames}.\n\n` +
        `The student will be automatically unenrolled from these subjects. Do you want to continue?`
      );
      
      if (!proceed) {
        return; // User cancelled, don't remove the group
      }
      
      // Remove affected subjects from student's enrollment
      const affectedSubjectIds = affectedSubjects.map(s => s?.id).filter(Boolean);
      setNewStudent(prev => ({
        ...prev,
        subjects: prev.subjects.filter(subjectId => !affectedSubjectIds.includes(subjectId))
      }));
    }
    
    // Proceed with removal
    setEditSelectedGroupIds(prev => prev.filter(id => id !== group.id));
  };

  const getAvailableSubjects = (groupNames?: string) => {
    return subjects.filter(subject => {
      // If subject has no group restriction, it's available to all
      if (!subject.group_name || !groupNames) return true;
      
      // Parse comma-separated group names
      const studentGroups = groupNames.split(',').map(g => g.trim().toLowerCase());
      const subjectGroups = subject.group_name.split(',').map(g => g.trim().toLowerCase());
      
      // Check if there's any overlap between student groups and subject groups
      return studentGroups.some(studentGroup => 
        subjectGroups.includes(studentGroup)
      );
    });
  }
  const addStudent = async () => {
    if (!newStudent.name.trim()) {
      toast.error("Student name is required")
      return
    }
    if (selectedGroupIds.length === 0) {
      toast.error("At least one group is required")
      return
    }
    
    const student: any = {
      name: newStudent.name.trim(),
      groupIds: selectedGroupIds // Send as groupIds for proper junction table handling
    };
    
    await apiClient.createStudent(student)
    await fetchData() // Refresh data
    setNewStudent({ name: '', subjects: [] })
    setSelectedGroupIds([])
    setIsAddDialogOpen(false)
    toast.success("Student added successfully")
  }

  const editStudent = (student: Student) => {
    setEditingStudent(student)
    setNewStudent({
      name: student.name,
      subjects: [...student.subjects]
    })
    // Set selected groups for editing
    const studentGroupIds = student.group_name 
      ? student.group_name.split(',').map(name => {
          const group = studentGroups.find(g => g.name.trim() === name.trim())
          return group?.id
        }).filter(Boolean)
      : []
    setEditSelectedGroupIds(studentGroupIds)
    setIsEditDialogOpen(true)
  }

  const updateStudent = async () => {
    if (!newStudent.name.trim() || !editingStudent) {
      toast.error("Student name is required")
      return
    }
    
    if (editSelectedGroupIds.length === 0) {
      toast.error("At least one group is required")
      return
    }
    
    const updatedStudent: any = {
      name: newStudent.name.trim(),
      groupIds: editSelectedGroupIds // Send as groupIds for proper junction table handling
    };
    
    await apiClient.updateStudent(editingStudent.id, updatedStudent)
    
    // Update student subjects (including any that were removed due to group deselection)
    await apiClient.updateStudentSubjects(editingStudent.id, { subjects: newStudent.subjects })
    
    await fetchData() // Refresh data
    setNewStudent({ name: '', subjects: [] })
    setEditSelectedGroupIds([])
    setEditingStudent(null)
    setIsEditDialogOpen(false)
    toast.success("Student updated successfully")
  }

  const removeStudent = async (studentId: string) => {
    try {
      await apiClient.deleteStudent(studentId)
      setStudents(current => current.filter(s => s.id !== studentId))
      toast.success("Student removed successfully")
    } catch (error) {
      toast.error("Failed to remove student")
      console.error("Error removing student:", error)
    }
  }

  const toggleSubject = async (studentId: string, subjectId: string) => {
    setStudents(current =>
      current.map(student => {
        if (student.id === studentId) {
          console.log('Before update:', student.subjects);
          const updatedSubjects = student.subjects.includes(subjectId)
            ? student.subjects.filter(id => id !== subjectId)
            : [...student.subjects, subjectId];
          console.log('After update:', updatedSubjects);
          return { ...student, subjects: updatedSubjects };
        }
        return student;
      })
    );

    try {
      const student = students.find(s => s.id === studentId);
      if (student) {
        const updatedSubjects = student.subjects.includes(subjectId)
          ? student.subjects.filter(id => id !== subjectId)
          : [...student.subjects, subjectId];
        console.log('Sending updated subjects:', updatedSubjects);
        await apiClient.updateStudentSubjects(studentId, { subjects: updatedSubjects });
        toast.success("Subjects updated successfully");
      }
    } catch (error) {
      toast.error("Failed to update subjects");
    }
  };

  const bulkImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string
        const lines = csv.split('\n').filter(line => line.trim())
  // const headers = lines[0].split(',').map(h => h.trim())
        
        const newStudents: Student[] = []
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim())
          if (values.length >= 1 && values[0]) {
            newStudents.push({
              id: Date.now().toString() + i,
              name: values[0],
              subjects: []
            })
          }
        }
        
        setStudents(current => [...current, ...newStudents])
        toast.success(`Imported ${newStudents.length} students`)
      } catch (error) {
        toast.error("Failed to import CSV file")
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Students</h2>
          <p className="text-muted-foreground">Manage your student roster</p>
        </div>
        <div className="flex gap-2">
          <Label htmlFor="csv-upload" className="cursor-pointer">
            <Button variant="outline" asChild>
              <span className="flex items-center gap-2">
                <Upload size={16} />
                Import CSV
              </span>
            </Button>
          </Label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={bulkImport}
          />
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus size={16} />
                Add Student
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Student</DialogTitle>
                <DialogDescription>
                  Enter student information and select their groups.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="student-name">Name *</Label>
                  <Input
                    id="student-name"
                    value={newStudent.name}
                    onChange={(e) => setNewStudent(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Student full name"
                  />
                </div>
                {/* Removed email input */}
                <div>
                  <Label>Groups *</Label>
                  <div className="relative" ref={dropdownRef}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
                      className="w-full justify-between"
                    >
                      <div className="flex flex-wrap gap-1">
                        {selectedGroupIds.length > 0 ? (
                          selectedGroupIds.map(id => {
                            const group = studentGroups.find(g => g.id === id)
                            return group ? (
                              <Badge key={id} variant="secondary" className="text-xs">
                                {group.name}
                              </Badge>
                            ) : null
                          })
                        ) : (
                          <span className="text-muted-foreground">Select groups...</span>
                        )}
                      </div>
                      <CaretDown className={`h-4 w-4 transition-transform ${isGroupDropdownOpen ? 'rotate-180' : ''}`} />
                    </Button>

                    {isGroupDropdownOpen && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                        <div className="p-2">
                          {studentGroups.map((group) => (
                            <div key={group.id} className="flex items-center space-x-2 py-1">
                              <Checkbox
                                id={`group-${group.id}`}
                                checked={selectedGroupIds.includes(group.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedGroupIds(prev => 
                                      prev.includes(group.id) ? prev : [...prev, group.id]
                                    )
                                  } else {
                                    setSelectedGroupIds(prev => prev.filter(id => id !== group.id))
                                  }
                                }}
                              />
                              <Label htmlFor={`group-${group.id}`} className="text-sm cursor-pointer">
                                {group.name}
                              </Label>
                            </div>
                          ))}
                          
                          <div className="border-t mt-2 pt-2">
                            <div className="flex gap-2">
                              <Input
                                placeholder="New group name"
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    createNewGroup()
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                onClick={createNewGroup}
                                disabled={!newGroupName.trim() || isCreatingGroup}
                                size="sm"
                              >
                                {isCreatingGroup ? '...' : 'Add'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={addStudent} className="flex-1">
                    <UserPlus size={16} className="mr-2" />
                    Add Student
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setIsAddDialogOpen(false)
                    setSelectedGroupIds([])
                    setNewStudent({ name: '', subjects: [] })
                  }}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          
          {/* Edit Student Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Student</DialogTitle>
                <DialogDescription>
                  Modify student information and group assignments.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-student-name">Name *</Label>
                  <Input
                    id="edit-student-name"
                    value={newStudent.name}
                    onChange={(e) => setNewStudent(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Student full name"
                  />
                </div>
                {/* Removed email input from edit dialog */}
                <div>
                  <Label>Groups *</Label>
                  <div className="relative" ref={editDropdownRef}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsGroupDropdownOpenEdit(!isGroupDropdownOpenEdit)}
                      className="w-full justify-between"
                    >
                      <div className="flex flex-wrap gap-1">
                        {editSelectedGroupIds.length > 0 ? (
                          editSelectedGroupIds.map(id => {
                            const group = studentGroups.find(g => g.id === id)
                            return group ? (
                              <Badge key={id} variant="secondary" className="text-xs">
                                {group.name}
                              </Badge>
                            ) : null
                          })
                        ) : (
                          <span className="text-muted-foreground">Select groups...</span>
                        )}
                      </div>
                      <CaretDown className={`h-4 w-4 transition-transform ${isGroupDropdownOpenEdit ? 'rotate-180' : ''}`} />
                    </Button>

                    {isGroupDropdownOpenEdit && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                        <div className="p-2">
                          {studentGroups.map((group) => (
                            <div key={group.id} className="flex items-center space-x-2 py-1">
                              <Checkbox
                                id={`edit-group-${group.id}`}
                                checked={editSelectedGroupIds.includes(group.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setEditSelectedGroupIds(prev => 
                                      prev.includes(group.id) ? prev : [...prev, group.id]
                                    )
                                  } else {
                                    handleGroupDeselection(group)
                                  }
                                }}
                              />
                              <Label htmlFor={`edit-group-${group.id}`} className="text-sm cursor-pointer">
                                {group.name}
                              </Label>
                            </div>
                          ))}
                          
                          <div className="border-t mt-2 pt-2">
                            <div className="flex gap-2">
                              <Input
                                placeholder="New group name"
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    createNewGroup()
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                onClick={createNewGroup}
                                disabled={!newGroupName.trim() || isCreatingGroup}
                                size="sm"
                              >
                                {isCreatingGroup ? '...' : 'Add'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={updateStudent} className="flex-1">
                    <PencilSimple size={16} className="mr-2" />
                    Update Student
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setIsEditDialogOpen(false)
                    setEditingStudent(null)
                    setEditSelectedGroupIds([])
                    setNewStudent({ name: '', subjects: [] })
                  }}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {students.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserPlus size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No students yet</h3>
            <p className="text-muted-foreground mb-4">Add your first student to get started</p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus size={16} className="mr-2" />
              Add Student
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {students.map((student) => (
            <Card key={student.id} className="relative group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {student.name}
                      {student.group_name && (
                        <div className="flex gap-1">
                          {student.group_name.split(',').map(group => group.trim()).filter(g => g).map((group, index) => (
                            <Badge key={`${student.id}-${group}-${index}`} variant="outline">{group}</Badge>
                          ))}
                        </div>
                      )}
                    </CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => editStudent(student)}
                    >
                      <PencilSimple size={16} />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                        >
                          <Trash size={16} className="text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Student</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete <strong>{student.name}</strong>? 
                            This action cannot be undone and will permanently remove the student and all associated grades.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => removeStudent(student.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete Student
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Subjects ({student.subjects.length})</Label>
                    {(() => {
                      const availableSubjects = getAvailableSubjects(student.group_name)
                      if (availableSubjects.length === 0) {
                        return <p className="text-xs text-muted-foreground">No subjects available for this group</p>;
                      }
                      return (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {availableSubjects.map((subject) => {
                            const isEnrolled = student.subjects.includes(subject.id);
                            return (
                              <Button
                                key={subject.id}
                                variant={isEnrolled ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleSubject(student.id, subject.id)}
                                className="text-xs px-2 py-1 h-7"
                              >
                                {subject.name}
                              </Button>
                            );
                          })}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}