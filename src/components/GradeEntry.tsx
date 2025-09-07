import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { apiClient } from '@/lib/api'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, X, Keyboard, Percent, PencilSimple, Plus, Trash } from "@phosphor-icons/react"
import { Student, Subject, Lesson, Grade } from '@/lib/types'
import { toast } from 'sonner'

// Helper function to round percentage to nearest 0.5%
const roundToNearestHalf = (percentage: number): number => {
  return Math.round(percentage * 2) / 2;
};

// Helper function to format percentage with proper decimal places
const formatPercentage = (percentage: number): string => {
  // If it's a whole number, show without decimal
  if (percentage % 1 === 0) {
    return percentage.toString();
  }
  // Otherwise, show one decimal place
  return percentage.toFixed(1);
};

export default function GradeEntry() {
  const [students, setStudents] = useState<Student[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [gradeCategoryTypes, setGradeCategoryTypes] = useState<any[]>([])
  const [loadingInitialData, setLoadingInitialData] = useState<boolean>(true)

  // Refactor to use normalized table system
  useEffect(() => {
    async function fetchData() {
      try {
        setLoadingInitialData(true)
        const studentsRes = await apiClient.getStudents();
        setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : []);

        const subjectsRes = await apiClient.getSubjects();
        setSubjects(Array.isArray(subjectsRes.data) ? subjectsRes.data : []);

        const gradesRes = await apiClient.getGrades();
        if (gradesRes.error) {
          toast.error(`Failed to fetch grades: ${gradesRes.error}`);
        } else {
          setGrades(Array.isArray(gradesRes.data) ? gradesRes.data : []);
        }

        // Load grade category types for styling
        const categoryTypesRes = await apiClient.getGradeCategoryTypes();
        if (categoryTypesRes.data) {
          setGradeCategoryTypes(Array.isArray(categoryTypesRes.data) ? categoryTypesRes.data : []);
        }
      } catch (error) {
        toast.error('An unexpected error occurred while fetching data.');
        console.error(error);
      } finally {
        setLoadingInitialData(false)
      }
    }
    fetchData()
  }, [])

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(() => {
    return localStorage.getItem('gradeflow-selectedSubjectId') || ""
  })
  const [selectedLessonId, setSelectedLessonId] = useState<string>(() => {
    return localStorage.getItem('gradeflow-selectedLessonId') || ""
  })
  const [gradeValues, setGradeValues] = useState<Record<string, string>>({})
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(null)
  const [entryMode, setEntryMode] = useState<'percentage' | 'errors'>('percentage')
  const [activeView, setActiveView] = useState<'entry' | 'table'>('entry')
  const [lessonPoints, setLessonPoints] = useState<string>("")

  // Helper function to check if a lesson type is default (doesn't need special styling)
  const isDefaultLessonType = (lessonType: string): boolean => {
    const categoryType = gradeCategoryTypes.find(cat => cat.name === lessonType);
    return categoryType?.is_default || false;
  };

  // Helper function to get categoryId from type name
  const getCategoryIdFromTypeName = (typeName: string): string | undefined => {
    const categoryType = gradeCategoryTypes.find(cat => cat.name === typeName);
    return categoryType?.id;
  };

  // Helper function to get category color from type name or lesson data
  const getCategoryColor = (lesson: any): string => {
    // First try to use the type_color field from the API response
    if (lesson.type_color) {
      return lesson.type_color;
    }
    // Fallback to looking up by type name
    const categoryType = gradeCategoryTypes.find(cat => cat.name === lesson.type);
    return categoryType?.color || '#6366f1'; // Default color
  };
  const gridRef = useRef<HTMLDivElement>(null)
  const inputRefs = useRef<Record<string, HTMLInputElement>>({})
  const lessonPointsRef = useRef<HTMLInputElement>(null)

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ studentId: string; lessonId: string } | null>(null)
  const [editingLesson, setEditingLesson] = useState<string | null>(null)
  const [lessonEditFocusOnPoints, setLessonEditFocusOnPoints] = useState<boolean>(false)
  const [tempGradeValue, setTempGradeValue] = useState<string>("")
  const [tempLessonData, setTempLessonData] = useState<{ type?: string; points?: string }>({})
  const [subjectLessons, setSubjectLessons] = useState<Record<string, Lesson[]>>({});
  const [loadingLessons, setLoadingLessons] = useState<{ [subjectId: string]: boolean }>({});
  const [shouldFocusFirstStudent, setShouldFocusFirstStudent] = useState<boolean>(false);

  // Lesson editing state
  const [editLessonDialog, setEditLessonDialog] = useState<{ 
    open: boolean; 
    lesson: Lesson | null; 
    subjectId: string | null 
  }>({ open: false, lesson: null, subjectId: null })

  // Navigation helpers for keyboard shortcuts (moved before useEffect to fix scope issues)
  const enrolledStudents = students.filter(s => s.subjects && s.subjects.includes(selectedSubjectId))
  const filteredSubjectLessons = subjectLessons[selectedSubjectId] || []
  const currentLessonIndex = filteredSubjectLessons.findIndex(l => l.id === selectedLessonId)
  const availableSubjects = subjects.filter(s => 
    students.some(student => student.subjects?.includes(s.id))
  )
  const currentSubjectIndex = availableSubjects.findIndex(s => s.id === selectedSubjectId)

  // Helper function to check if a lesson has any grades
  const lessonHasGrades = (lessonId: string): boolean => {
    return enrolledStudents.some(student => {
      const existingGrade = grades.find(
        g => g.studentId === student.id && g.lessonId === lessonId
      );
      return existingGrade !== undefined;
    });
  };

  // Inline editing functions
  const startEditingGrade = (studentId: string, lessonId: string, currentValue: string) => {
    setEditingCell({ studentId, lessonId });
    setTempGradeValue(currentValue);
  };

  // Function to switch between entry and table modes while preserving current selection
  const switchViewMode = (newMode: 'entry' | 'table') => {
    const currentMode = activeView;
    if (currentMode === newMode) return; // No change needed
    
    // Store current student/lesson context
    let currentStudentId: string | null = null;
    let currentLessonId: string = selectedLessonId;
    
    // Determine current student based on mode
    if (currentMode === 'entry') {
      // In entry mode, check focused cell or use first student
      if (focusedCell && enrolledStudents[focusedCell.row]) {
        currentStudentId = enrolledStudents[focusedCell.row].id;
      } else if (enrolledStudents.length > 0) {
        currentStudentId = enrolledStudents[0].id;
      }
    } else if (currentMode === 'table') {
      // In table mode, use editingCell or focused context
      if (editingCell) {
        currentStudentId = editingCell.studentId;
        currentLessonId = editingCell.lessonId;
      } else if (focusedCell && enrolledStudents[focusedCell.row]) {
        currentStudentId = enrolledStudents[focusedCell.row].id;
      } else if (enrolledStudents.length > 0) {
        currentStudentId = enrolledStudents[0].id;
      }
    }
    
    // Switch the mode
    setActiveView(newMode);
    
    // Focus appropriate cell/input in new mode after a brief delay
    setTimeout(() => {
      if (newMode === 'entry') {
        // Switching to entry mode - focus the input for current student
        if (currentStudentId && currentLessonId) {
          setSelectedLessonId(currentLessonId);
          const input = inputRefs.current[currentStudentId];
          if (input) {
            input.focus();
            const studentIndex = enrolledStudents.findIndex(s => s.id === currentStudentId);
            if (studentIndex !== -1) {
              setFocusedCell({ row: studentIndex, col: 0 });
            }
          }
        }
      } else if (newMode === 'table') {
        // Switching to table mode - start editing the same cell
        if (currentStudentId && currentLessonId) {
          setSelectedLessonId(currentLessonId);
          const existingGrade = grades.find(g => g.studentId === currentStudentId && g.lessonId === currentLessonId);
          const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
          const currentValue = existingGrade
            ? (isSkipped ? 'S' : (entryMode === 'percentage' 
                ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
                : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
            : '';
          startEditingGrade(currentStudentId, currentLessonId, currentValue);
        }
      }
    }, 100);
    
    toast.success(`Switched to ${newMode} mode`);
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: Event) => {
      const keyboardEvent = e as unknown as KeyboardEvent;
      // Only handle shortcuts if we're not in an input field (except for specific cases)
      const target = keyboardEvent.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';
      
      // Allow certain shortcuts to work even in input fields
      const allowedInInput = ['F1', 'F2', 'Escape', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      
      // Check if the key combination should be allowed in input fields
      const shouldAllowInInput = allowedInInput.includes(keyboardEvent.key) || 
        (keyboardEvent.key === 'ArrowUp' && keyboardEvent.shiftKey) ||
        (keyboardEvent.key === 'ArrowDown' && keyboardEvent.shiftKey) ||
        keyboardEvent.key === ' ';
      
      if (isInputField && !shouldAllowInInput) {
        return; // Let input field handle the key
      }

      switch (keyboardEvent.key) {
        case ' ':
          // Space key: focus lesson points input
          if (lessonPointsRef.current && selectedLesson) {
            keyboardEvent.preventDefault();
            lessonPointsRef.current.focus();
            lessonPointsRef.current.select(); // Select all text for easy editing
            toast.success('Lesson points selected');
          }
          break;
        case 'F1':
          keyboardEvent.preventDefault();
          setEntryMode(entryMode === 'percentage' ? 'errors' : 'percentage');
          toast.success(`Switched to ${entryMode === 'percentage' ? 'errors' : 'percentage'} mode`);
          break;

        case 'F2':
          keyboardEvent.preventDefault();
          switchViewMode(activeView === 'entry' ? 'table' : 'entry');
          break;

        case 'PageUp':
          keyboardEvent.preventDefault();
          if (enrolledStudents.length > 0) {
            if (activeView === 'table' && selectedLessonId) {
              // Table view: start editing first student in current lesson
              const firstStudent = enrolledStudents[0];
              const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === selectedLessonId);
              const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
              const currentValue = existingGrade
                ? (isSkipped ? 'S' : (entryMode === 'percentage' 
                    ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
                    : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                : '';
              startEditingGrade(firstStudent.id, selectedLessonId, currentValue);
              toast.success('Jumped to first student');
            } else {
              // Entry view: focus first input
              const firstStudentId = enrolledStudents[0].id;
              const firstInput = inputRefs.current[firstStudentId];
              firstInput?.focus();
              setFocusedCell({ row: 0, col: 0 });
              toast.success('Jumped to first student');
            }
          }
          break;

        case 'PageDown':
          keyboardEvent.preventDefault();
          if (enrolledStudents.length > 0) {
            if (activeView === 'table' && selectedLessonId) {
              // Table view: start editing last student in current lesson
              const lastStudent = enrolledStudents[enrolledStudents.length - 1];
              const existingGrade = grades.find(g => g.studentId === lastStudent.id && g.lessonId === selectedLessonId);
              const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
              const currentValue = existingGrade
                ? (isSkipped ? 'S' : (entryMode === 'percentage' 
                    ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
                    : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                : '';
              startEditingGrade(lastStudent.id, selectedLessonId, currentValue);
              toast.success('Jumped to last student');
            } else {
              // Entry view: focus last input
              const lastStudentId = enrolledStudents[enrolledStudents.length - 1].id;
              const lastInput = inputRefs.current[lastStudentId];
              lastInput?.focus();
              setFocusedCell({ row: enrolledStudents.length - 1, col: 0 });
              toast.success('Jumped to last student');
            }
          }
          break;

        case 'ArrowLeft':
          // Skip global navigation if currently editing a table cell (let cell handler manage it)
          if (activeView === 'table' && editingCell) {
            break;
          }
          keyboardEvent.preventDefault();
          if (currentLessonIndex > 0) {
            const prevLesson = filteredSubjectLessons[currentLessonIndex - 1];
            setSelectedLessonId(prevLesson.id);
            
            if (activeView === 'table') {
              // Table mode: auto-select first student in new lesson (no toast)
              setTimeout(() => {
                if (enrolledStudents.length > 0) {
                  const firstStudent = enrolledStudents[0];
                  const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === prevLesson.id);
                  const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                  const currentValue = existingGrade
                    ? (isSkipped ? 'S' : (entryMode === 'percentage' 
                        ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
                        : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                    : '';
                  startEditingGrade(firstStudent.id, prevLesson.id, currentValue);
                }
              }, 100);
            } else {
              // Entry mode: focus first input with toast
              setTimeout(() => {
                const firstStudentId = enrolledStudents[0]?.id;
                if (firstStudentId) {
                  const firstInput = inputRefs.current[firstStudentId];
                  firstInput?.focus();
                  // Auto-select the text if there's a value
                  if (firstInput && firstInput.value) {
                    setTimeout(() => firstInput.select(), 0);
                  }
                  setFocusedCell({ row: 0, col: 0 });
                }
              }, 100);
              toast.success(`Switched to ${prevLesson.name}`);
            }
          }
          break;

        case 'ArrowRight':
          // Skip global navigation if currently editing a table cell (let cell handler manage it)
          if (activeView === 'table' && editingCell) {
            break;
          }
          keyboardEvent.preventDefault();
          if (currentLessonIndex < filteredSubjectLessons.length - 1) {
            const nextLesson = filteredSubjectLessons[currentLessonIndex + 1];
            setSelectedLessonId(nextLesson.id);
            
            if (activeView === 'table') {
              // Table mode: auto-select first student in new lesson (no toast)
              setTimeout(() => {
                if (enrolledStudents.length > 0) {
                  const firstStudent = enrolledStudents[0];
                  const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === nextLesson.id);
                  const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                  const currentValue = existingGrade
                    ? (isSkipped ? 'S' : (entryMode === 'percentage' 
                        ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
                        : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                    : '';
                  startEditingGrade(firstStudent.id, nextLesson.id, currentValue);
                }
              }, 100);
            } else {
              // Entry mode: focus first input with toast
              setTimeout(() => {
                const firstStudentId = enrolledStudents[0]?.id;
                if (firstStudentId) {
                  const firstInput = inputRefs.current[firstStudentId];
                  firstInput?.focus();
                  // Auto-select the text if there's a value
                  if (firstInput && firstInput.value) {
                    setTimeout(() => firstInput.select(), 0);
                  }
                  setFocusedCell({ row: 0, col: 0 });
                }
              }, 100);
              toast.success(`Switched to ${nextLesson.name}`);
            }
          }
          break;

        case 'ArrowUp':
          if (keyboardEvent.shiftKey) {
            keyboardEvent.preventDefault();
            if (currentSubjectIndex > 0) {
              const prevSubject = availableSubjects[currentSubjectIndex - 1];
              setSelectedSubjectId(prevSubject.id);
              setSelectedLessonId('');
              // Set flag to focus first student after lesson auto-selection
              setShouldFocusFirstStudent(true);
              // Only show toast in entry mode
              if (activeView === 'entry') {
                toast.success(`Switched to ${prevSubject.name}`);
              }
            }
          }
          break;

        case 'ArrowDown':
          if (keyboardEvent.shiftKey) {
            keyboardEvent.preventDefault();
            if (currentSubjectIndex < availableSubjects.length - 1) {
              const nextSubject = availableSubjects[currentSubjectIndex + 1];
              setSelectedSubjectId(nextSubject.id);
              setSelectedLessonId('');
              // Set flag to focus first student after lesson auto-selection
              setShouldFocusFirstStudent(true);
              // Only show toast in entry mode
              if (activeView === 'entry') {
                toast.success(`Switched to ${nextSubject.name}`);
              }
            }
          }
          break;

        case 'Escape':
          keyboardEvent.preventDefault();
          // Find currently focused input and blur it
          const focusedElement = document.activeElement as HTMLElement;
          if (focusedElement && focusedElement.tagName === 'INPUT') {
            focusedElement.blur();
          }
          setFocusedCell(null);
          break;
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    entryMode, 
    enrolledStudents, 
    currentLessonIndex, 
    filteredSubjectLessons, 
    currentSubjectIndex, 
    availableSubjects, 
    selectedSubjectId,
    activeView,
    selectedLessonId,
    startEditingGrade,
    switchViewMode,
    focusedCell,
    editingCell,
    grades
  ]);

  // Debugging fetchSubjectLessons to ensure lessons are fetched correctly
  useEffect(() => {
    async function fetchSubjectLessons() {
      try {
        console.log('Fetching lessons for subject:', selectedSubjectId);
        setLoadingLessons(prev => ({ ...prev, [selectedSubjectId]: true }));
        const res = await apiClient.getLessonsForSubject(selectedSubjectId);
        console.log('Lessons fetched:', res.data);
        setSubjectLessons((prev: Record<string, Lesson[]>) => ({
          ...prev,
          [selectedSubjectId]: Array.isArray(res.data) ? res.data : [],
        }));
      } catch (error) {
        console.error('Failed to fetch lessons for subject:', error);
      } finally {
        setLoadingLessons(prev => ({ ...prev, [selectedSubjectId]: false }));
      }
    }

    if (selectedSubjectId) {
      fetchSubjectLessons();
    } else {
      // Clear loading state when no subject is selected
      setLoadingLessons({});
    }
  }, [selectedSubjectId]);

  // Safeguard for selectedSubject
  const selectedSubject = Array.isArray(subjects) && subjects.length > 0
    ? subjects.find(s => s.id === selectedSubjectId)
    : undefined;

  // Safeguard for selectedLesson - use subjectLessons instead of selectedSubject.lessons
  const selectedLesson = selectedSubjectId && subjectLessons[selectedSubjectId] 
    ? subjectLessons[selectedSubjectId].find(l => l.id === selectedLessonId)
    : undefined;
  // Placeholder for tab navigation. Replace with your actual tab switch logic.
  const goToTab = (tab: 'students' | 'subjects') => {
    // Example: setActiveTab(tab)
    // You can replace this with your actual navigation logic or context
    window?.dispatchEvent(new CustomEvent('gradeflow-goto-tab', { detail: { tab } }))
  }

  // Lesson editing functions
  function editLesson(lesson: Lesson, subjectId: string) {
    setEditLessonDialog({ open: true, lesson, subjectId })
  }

  async function handleEditLessonSave(updated: Partial<Lesson>) {
    if (!editLessonDialog.lesson || !editLessonDialog.subjectId) return
    
    try {
      // Convert type name to categoryId if type is provided
      const updateData: any = { ...updated };
      if (updated.type) {
        const categoryId = getCategoryIdFromTypeName(updated.type);
        if (categoryId) {
          updateData.categoryId = categoryId;
          // Remove type since we're sending categoryId
          delete updateData.type;
        }
      }
      
      await apiClient.updateLesson(editLessonDialog.lesson.id, updateData)
      
      // Refresh lessons for this subject
      const subjectId = String(editLessonDialog.subjectId)
      const lessonsRes = await apiClient.getLessonsForSubject(subjectId)
      const lessonsData = Array.isArray(lessonsRes.data) ? lessonsRes.data : []
      setSubjectLessons(prev => ({ ...prev, [subjectId]: lessonsData }))
      
      setEditLessonDialog({ open: false, lesson: null, subjectId: null })
      toast.success('Lesson updated successfully')
    } catch (error) {
      console.error('Failed to update lesson:', error)
      toast.error('Failed to update lesson')
    }
  }

  function closeEditLessonDialog() {
    setEditLessonDialog({ open: false, lesson: null, subjectId: null })
  }

  // Add lesson function
  async function addLessonAfterSelected() {
    if (!selectedSubjectId) return
    
    try {
      const currentLessons = subjectLessons[selectedSubjectId] || []
      
      // If there are no lessons, add the first lesson with default properties
      if (currentLessons.length === 0) {
        // Find the first default category to use as the initial lesson type
        const defaultCategory = gradeCategoryTypes.find(cat => cat.is_default);
        const categoryId = defaultCategory?.id;
        
        await apiClient.addLessonsToSubject(
          selectedSubjectId, 
          1, 
          "Lesson", // Default name
          undefined, // Don't send type, use categoryId instead
          10, // Default points
          categoryId // Send categoryId directly
        )

        // Refresh lessons and select the new one
        const lessonsRes = await apiClient.getLessonsForSubject(selectedSubjectId)
        const lessonsData = Array.isArray(lessonsRes.data) ? lessonsRes.data : []
        setSubjectLessons(prev => ({ ...prev, [selectedSubjectId]: lessonsData }))

        // Select the newly added lesson
        if (lessonsData.length > 0) {
          const newLesson = lessonsData[0]
          setSelectedLessonId(newLesson.id)
          // Open editor for customization
          editLesson(newLesson, selectedSubjectId)
        }

        toast.success('First lesson added successfully')
        return
      }
      
      // If there are lessons but none selected, return early
      if (!selectedLessonId) return
      
      const selectedLesson = currentLessons.find(l => l.id === selectedLessonId)
      if (!selectedLesson) return

      // Find the index of the selected lesson
      const selectedLessonIndex = currentLessons.findIndex(l => l.id === selectedLessonId)
      const isLastLesson = selectedLessonIndex === currentLessons.length - 1

      // Determine the name for the new lesson
      let newLessonName: string
      if (isLastLesson) {
        // If it's the last lesson, provide the base name and let API handle numbering
        const match = selectedLesson.name.match(/^(.+?)\s*(\d+)$/)
        if (match) {
          newLessonName = match[1].trim()
        } else {
          newLessonName = selectedLesson.name
        }
      } else {
        // If it's not the last lesson, provide a base name
        const match = selectedLesson.name.match(/^(.+?)\s*(\d*)$/)
        if (match) {
          newLessonName = match[1].trim()
        } else {
          newLessonName = selectedLesson.name
        }
      }

      if (!isLastLesson) {
        // For middle insertion, we'll add the lesson and then reorder everything
        
        // Add the new lesson first
        const categoryId = getCategoryIdFromTypeName(selectedLesson.type);
        await apiClient.addLessonsToSubject(
          selectedSubjectId, 
          1, 
          newLessonName,
          undefined, // Don't send type, use categoryId instead
          selectedLesson.points,
          categoryId
        )

        // Get all lessons including the newly added one
        const lessonsRes = await apiClient.getLessonsForSubject(selectedSubjectId)
        const allLessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : []
        
        // Find the newly added lesson
        const newLesson = allLessons.find(l => !currentLessons.some(old => old.id === l.id))
        
        if (newLesson) {
          // Create the desired order: insert new lesson after the selected one
          const reorderedLessons = []
          
          for (let i = 0; i <= selectedLessonIndex; i++) {
            reorderedLessons.push(currentLessons[i])
          }
          
          // Insert the new lesson
          reorderedLessons.push(newLesson)
          
          // Add the remaining lessons
          for (let i = selectedLessonIndex + 1; i < currentLessons.length; i++) {
            reorderedLessons.push(currentLessons[i])
          }
          
          // Update orderIndex for all lessons
          for (let i = 0; i < reorderedLessons.length; i++) {
            await apiClient.updateLesson(reorderedLessons[i].id, { orderIndex: i })
          }
          
          // Final refresh to get the correctly ordered lessons
          const finalRes = await apiClient.getLessonsForSubject(selectedSubjectId)
          const finalLessonsData = Array.isArray(finalRes.data) ? finalRes.data : []
          setSubjectLessons(prev => ({ ...prev, [selectedSubjectId]: finalLessonsData }))
          
          // Select the new lesson and open editor for customization
          setSelectedLessonId(newLesson.id)
          editLesson(newLesson, selectedSubjectId)
        }
      } else {
        // For last lesson, just add normally
        const categoryId = getCategoryIdFromTypeName(selectedLesson.type);
        await apiClient.addLessonsToSubject(
          selectedSubjectId, 
          1, 
          newLessonName,
          undefined, // Don't send type, use categoryId instead
          selectedLesson.points,
          categoryId
        )

        // Refresh lessons and select the new one
        const lessonsRes = await apiClient.getLessonsForSubject(selectedSubjectId)
        const lessonsData = Array.isArray(lessonsRes.data) ? lessonsRes.data : []
        setSubjectLessons(prev => ({ ...prev, [selectedSubjectId]: lessonsData }))

        // Find and select the newly added lesson
        const newLesson = lessonsData.find(l => !currentLessons.some(old => old.id === l.id))
        if (newLesson) {
          setSelectedLessonId(newLesson.id)
        }
      }

      toast.success('New lesson added successfully')
    } catch (error) {
      console.error('Failed to add lesson:', error)
      toast.error('Failed to add lesson')
    }
  }
  // Auto-select first lesson without grades when subject changes
  useEffect(() => {
    if (selectedSubjectId && selectedSubject && subjectLessons[selectedSubjectId]) {
      const findFirstLessonWithoutGrades = () => {
        const lessons = subjectLessons[selectedSubjectId] ?? [];

        if (lessons.length === 0) {
          return ""; // No lessons available
        }

        // Sort lessons by orderIndex
        const sortedLessons = lessons.sort((a: Lesson, b: Lesson) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

        // Find the first lesson that has no grades
        for (const lesson of sortedLessons) {
          const hasGrades = enrolledStudents.some(student => {
            const existingGrade = grades.find(
              g => g.studentId === student.id && g.lessonId === lesson.id
            );
            return existingGrade !== undefined;
          });

          if (!hasGrades) {
            return lesson.id;
          }
        }

        // If all lessons have grades, select the last lesson
        return sortedLessons[sortedLessons.length - 1]?.id || "";
      }
      
      // Only auto-select if no lesson is currently selected or if current lesson is not in available lessons
      const availableLessonIds = subjectLessons[selectedSubjectId]?.map(l => l.id) || [];
      const isCurrentLessonValid = selectedLessonId && availableLessonIds.includes(selectedLessonId);
      
      if (!isCurrentLessonValid) {
        const firstLessonWithoutGradesId = findFirstLessonWithoutGrades()
        if (firstLessonWithoutGradesId) {
          setSelectedLessonId(firstLessonWithoutGradesId)
        }
      }
    }
  }, [selectedSubjectId, selectedSubject, enrolledStudents, grades, subjectLessons])

  // Initialize grade values when lesson changes
  useEffect(() => {
    if (selectedLessonId) {
      const lessonGrades = grades.filter(g => g.lessonId === selectedLessonId)
      const gradeMap: Record<string, string> = {}
      
      lessonGrades.forEach(grade => {
        // Check if grade was skipped: percentage is 0 and errors equal maxPoints
        const percentage = grade.percentage || 0;
        const errors = grade.errors || 0;
        const maxPoints = grade.maxPoints || grade.points || 0;
        const isSkipped = percentage === 0 && errors === maxPoints;
        
        if (isSkipped) {
          gradeMap[grade.studentId] = 'S'
        } else if (entryMode === 'percentage') {
          gradeMap[grade.studentId] = grade.percentage != null ? grade.percentage.toString() : ''
        } else {
          // For errors mode, show errors 
          const errorsValue = grade.errors || (grade.maxPoints ? grade.maxPoints - grade.points : 0)
          gradeMap[grade.studentId] = errorsValue.toString()
        }
      })
      
      setGradeValues(gradeMap)
    }
  }, [selectedLessonId, grades, entryMode, subjectLessons])

  // Initialize lesson points when lesson changes
  useEffect(() => {
    if (selectedLesson) {
      // Use points field from database (which is maxPoints in frontend terms)
      const lessonMaxPoints = selectedLesson.points || selectedLesson.maxPoints;
      if (lessonMaxPoints) {
        setLessonPoints(lessonMaxPoints.toString())
      } else {
        setLessonPoints("")
      }
    } else {
      setLessonPoints("")
    }
  }, [selectedLesson])

  // Ensure selectedLesson is updated correctly
  useEffect(() => {
    if (selectedLessonId && subjectLessons[selectedSubjectId]) {
      const lesson = subjectLessons[selectedSubjectId].find(l => l.id === selectedLessonId);
      if (lesson) {
        setLessonPoints((lesson.points || lesson.maxPoints)?.toString() || "");
      }
    }
  }, [selectedLessonId, selectedSubjectId, subjectLessons]);

  // Persist selected subject and lesson to localStorage
  useEffect(() => {
    if (selectedSubjectId) {
      localStorage.setItem('gradeflow-selectedSubjectId', selectedSubjectId);
    }
  }, [selectedSubjectId]);

  useEffect(() => {
    if (selectedLessonId) {
      localStorage.setItem('gradeflow-selectedLessonId', selectedLessonId);
    }
  }, [selectedLessonId]);

  // Focus first student after subject switching and lesson auto-selection
  useEffect(() => {
    if (shouldFocusFirstStudent && selectedLessonId && enrolledStudents.length > 0) {
      // Use a small delay to ensure DOM is ready and other effects have completed
      const timeoutId = setTimeout(() => {
        if (activeView === 'table') {
          // Table view: start editing first student in current lesson
          const firstStudent = enrolledStudents[0];
          const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === selectedLessonId);
          const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
          const currentValue = existingGrade
            ? (isSkipped ? 'S' : (entryMode === 'percentage' 
                ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
                : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
            : '';
          startEditingGrade(firstStudent.id, selectedLessonId, currentValue);
        } else {
          // Entry view: focus first input
          const firstStudentId = enrolledStudents[0].id;
          const firstInput = inputRefs.current[firstStudentId];
          if (firstInput) {
            firstInput.focus();
            setFocusedCell({ row: 0, col: 0 });
          }
        }
        setShouldFocusFirstStudent(false); // Reset the flag
      }, 100); // Shorter delay since we're being more precise about timing

      return () => clearTimeout(timeoutId);
    }
  }, [shouldFocusFirstStudent, selectedLessonId, enrolledStudents, activeView, grades, entryMode]);

  // Handle fraction entry and auto-set lesson points
  const processFractionEntry = (value: string, lessonId: string) => {
    const fractionMatch = value.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
    if (fractionMatch) {
      const points = parseFloat(fractionMatch[1])
      const maxPoints = parseFloat(fractionMatch[2])
      
      // Auto-update lesson max points if different
      const currentMaxPoints = selectedLesson ? (selectedLesson.points || selectedLesson.maxPoints) : undefined;
      if (selectedLesson && currentMaxPoints !== maxPoints) {
        // Update subjectLessons state
        setSubjectLessons(current => ({
          ...current,
          [selectedSubjectId]: current[selectedSubjectId]?.map(lesson =>
            lesson.id === lessonId
              ? { ...lesson, points: maxPoints }
              : lesson
          ) || []
        }));
        
        // Also update subjects state if it has lessons
        setSubjects(current => 
          current.map(subject => 
            subject.id === selectedSubjectId && subject.lessons
              ? {
                  ...subject,
                  lessons: subject.lessons.map(lesson =>
                    lesson.id === lessonId
                      ? { ...lesson, points: maxPoints }
                      : lesson
                  )
                }
              : subject
          )
        );
        toast.success(`Auto-updated lesson max points to ${maxPoints}`)
      }
      
      return points
    }
    return null
  }

  // Handle letter grade conversion
  const processLetterGrade = (value: string): number | null => {
    const letterGradeMap: Record<string, number> = {
      'A+': 98.5, 'A': 95, 'A-': 91.5,
      'B+': 88.5, 'B': 85, 'B-': 81.5,
      'C+': 78.5, 'C': 75, 'C-': 71.5,
      'D+': 68.5, 'D': 65, 'D-': 61.5,
      'F': 50
    };

    const upperValue = value.toUpperCase().trim();
    return letterGradeMap[upperValue] || null;
  }

  const handleKeyNavigation = (e: KeyboardEvent, studentId: string, studentIndex: number) => {
    const totalStudents = enrolledStudents.length
    
    switch (e.key) {
      case 'ArrowUp':
        if (!e.shiftKey) {
          e.preventDefault()
          if (studentIndex > 0) {
            const prevStudentId = enrolledStudents[studentIndex - 1].id
            const prevInput = inputRefs.current[prevStudentId]
            prevInput?.focus()
            setFocusedCell({ row: studentIndex - 1, col: 0 })
          }
        }
        // Shift+ArrowUp is handled globally
        break

      case 'ArrowDown':
        if (!e.shiftKey) {
          e.preventDefault()
          // Navigate to next student (normal down arrow)
          if (studentIndex < totalStudents - 1) {
            const nextStudentId = enrolledStudents[studentIndex + 1].id
            const nextInput = inputRefs.current[nextStudentId]
            nextInput?.focus()
            setFocusedCell({ row: studentIndex + 1, col: 0 })
          }
        }
        // Shift+ArrowDown is handled globally
        break

      case 'Enter':
        e.preventDefault()
        if (studentIndex < totalStudents - 1) {
          const nextStudentId = enrolledStudents[studentIndex + 1].id
          const nextInput = inputRefs.current[nextStudentId]
          nextInput?.focus()
          setFocusedCell({ row: studentIndex + 1, col: 0 })
        } else {
          // If last student, save current grade first, then jump to next lesson
          const currentStudentId = enrolledStudents[studentIndex].id
          const currentValue = gradeValues[currentStudentId]
          
          // Save the current grade if there's a value
          if (currentValue && currentValue.trim() !== '') {
            saveGrade(currentStudentId).then(() => {
              // After saving, switch to next lesson
              if (currentLessonIndex < filteredSubjectLessons.length - 1) {
                const nextLesson = filteredSubjectLessons[currentLessonIndex + 1]
                setSelectedLessonId(nextLesson.id)
                // Wait for lesson change, then focus first student
                setTimeout(() => {
                  const firstStudentId = enrolledStudents[0]?.id
                  if (firstStudentId) {
                    const firstInput = inputRefs.current[firstStudentId]
                    firstInput?.focus()
                    setFocusedCell({ row: 0, col: 0 })
                  }
                }, 200)
                toast.success(`Grade saved and switched to ${nextLesson.name}`)
              } else {
                toast.info('Grade saved - no more lessons in this subject')
              }
            }).catch((error) => {
              console.error('Failed to save grade before lesson switch:', error)
              toast.error('Failed to save grade')
            })
          } else {
            // No grade to save, just switch lesson
            if (currentLessonIndex < filteredSubjectLessons.length - 1) {
              const nextLesson = filteredSubjectLessons[currentLessonIndex + 1]
              setSelectedLessonId(nextLesson.id)
              // Wait for lesson change, then focus first student
              setTimeout(() => {
                const firstStudentId = enrolledStudents[0]?.id
                if (firstStudentId) {
                  const firstInput = inputRefs.current[firstStudentId]
                  firstInput?.focus()
                  setFocusedCell({ row: 0, col: 0 })
                }
              }, 200)
              toast.success(`Switched to ${nextLesson.name}`)
            } else {
              toast.info('No more lessons in this subject')
            }
          }
        }
        break
        
      case 's':
      case 'S':
        e.preventDefault()
        // Skip this lesson for current student
        updateGradeValue(studentId, 's')
        // Auto-save the skip
        setTimeout(() => saveGrade(studentId), 100)
        toast.success('Lesson skipped for this student')
        break
    }
  }

  const updateGradeValue = (studentId: string, value: string) => {
    setGradeValues(prev => ({ ...prev, [studentId]: value }))
  }

  const updateLessonPoints = async (newMaxPoints: number) => {
    if (!selectedLesson || !selectedSubjectId) return
    
    try {
      // Update the backend first
      await apiClient.updateLesson(selectedLessonId, { points: newMaxPoints });
      
      // Update subjectLessons state (primary source)
      setSubjectLessons(current => ({
        ...current,
        [selectedSubjectId]: current[selectedSubjectId]?.map(lesson =>
          lesson.id === selectedLessonId
            ? { ...lesson, points: newMaxPoints }
            : lesson
        ) || []
      }));
      
      // Also update subjects state if it has lessons
      setSubjects(current => 
        current.map(subject => 
          subject.id === selectedSubjectId && subject.lessons
            ? {
                ...subject,
                lessons: subject.lessons.map(lesson =>
                  lesson.id === selectedLessonId
                    ? { ...lesson, points: newMaxPoints }
                    : lesson
                )
              }
            : subject
        )
      );
      
      toast.success(`Updated lesson max points to ${newMaxPoints}`)
    } catch (error) {
      console.error('Failed to update lesson points:', error);
      toast.error('Failed to update lesson points');
    }
  }

  // Refine handling of selectedLesson.maxPoints
  const placeholderValue = selectedLesson
    ? (selectedLesson.points || selectedLesson.maxPoints || 0).toString()
    : "0";

const saveGrade = async (studentId: string) => {
  const currentValue = gradeValues[studentId];

  if (!selectedLesson || !selectedLessonId) {
    return;
  }

  // If value is empty or undefined, check if there's an existing grade to delete
  if (!currentValue || !currentValue.trim()) {
    const existingGrade = grades.find(g => g.studentId === studentId && g.lessonId === selectedLessonId);
    if (existingGrade) {
      // Delete the existing grade
      await deleteGrade(studentId, selectedLessonId);
    }
    return;
  }

  try {
    let gradeData: any = {};

    const lowerValue = currentValue.toLowerCase();

    // Handle skip case
    if (lowerValue === 's') {
      const lessonMaxPoints = selectedLesson.points || 0;
      if (lessonMaxPoints <= 0) {
        toast.error('Please set lesson points before skipping grades');
        return;
      }
      gradeData.percentage = 0;
      gradeData.errors = lessonMaxPoints;
      gradeData.points = lessonMaxPoints;
    } else {
      // Handle letter grade
      const letterPercentage = processLetterGrade(currentValue);
      if (letterPercentage !== null) {
        const lessonMaxPoints = selectedLesson.points || 0;
        gradeData.percentage = letterPercentage;
        gradeData.errors = lessonMaxPoints > 0
          ? Math.round(lessonMaxPoints * (1 - letterPercentage / 100))
          : 0;
        gradeData.points = lessonMaxPoints;
      } else {
        // Handle fraction entry
        const fractionPoints = processFractionEntry(currentValue, selectedLessonId);
        if (fractionPoints !== null) {
          const maxPoints = parseFloat(currentValue.split('/')[1]);
          if (maxPoints <= 0) {
            toast.error('Invalid fraction - denominator must be greater than 0');
            return;
          }
          gradeData.percentage = roundToNearestHalf(((fractionPoints / maxPoints) * 100));
          gradeData.errors = Math.max(0, maxPoints - fractionPoints);
          gradeData.points = maxPoints;
        } else {
          // Handle numeric entry
          const numericValue = parseFloat(currentValue);
          if (!isNaN(numericValue)) {
            const lessonMaxPoints = selectedLesson.points || 0;

            if (entryMode === 'errors' && lessonMaxPoints <= 0) {
              toast.error('Please set lesson points before entering grades in errors mode');
              return;
            }

            if (entryMode === 'errors') {
              const correctPoints = Math.max(0, lessonMaxPoints - numericValue);
              gradeData.percentage = lessonMaxPoints > 0
                ? roundToNearestHalf(((correctPoints / lessonMaxPoints) * 100))
                : 0;
              gradeData.errors = numericValue;
              gradeData.points = lessonMaxPoints;
            } else {
              gradeData.percentage = roundToNearestHalf(numericValue);
              gradeData.errors = lessonMaxPoints > 0
                ? Math.round(lessonMaxPoints * (1 - numericValue / 100))
                : 0;
              gradeData.points = lessonMaxPoints;
            }
          } else {
            return; // Invalid input
          }
        }
      }
    }

    // Save grade to backend
    const response = await apiClient.setGrade(studentId, selectedLessonId, gradeData);

    // Update local state
    const existingGradeIndex = grades.findIndex(
      g => g.studentId === studentId && g.lessonId === selectedLessonId
    );

    const newGrade: Grade = {
      id: (response.data as any)?.id || `${studentId}-${selectedLessonId}`,
      studentId,
      lessonId: selectedLessonId,
      subjectId: selectedSubjectId,
      percentage: gradeData.percentage,
      points: gradeData.points - (gradeData.errors || 0),
      maxPoints: gradeData.points,
      errors: gradeData.errors,
      date: new Date().toISOString(),
      notes: undefined,
      skipped: lowerValue === 's',
      created_at: (response.data as any)?.created_at,
      updated_at: (response.data as any)?.updated_at
    };

    if (existingGradeIndex !== -1) {
      setGrades(current => current.map((g, index) =>
        index === existingGradeIndex ? newGrade : g
      ));
    } else {
      setGrades(current => [...current, newGrade]);
    }

    const studentName = students.find(s => s.id === studentId)?.name;
    toast.success(`Grade saved for ${studentName}`);
  } catch (error) {
    console.error('Failed to save grade:', error);
    toast.error('Failed to save grade');
  }
  };

  // Delete grade function
  const deleteGrade = async (studentId: string, lessonId: string) => {
    try {
      // Call backend API to delete the grade
      await apiClient.deleteGrade(studentId, lessonId);

      // Update local state - remove the grade
      setGrades(current => current.filter(
        g => !(g.studentId === studentId && g.lessonId === lessonId)
      ));

      // Clear the grade value from UI state
      setGradeValues(prev => {
        const updated = { ...prev };
        delete updated[studentId];
        return updated;
      });

      const studentName = students.find(s => s.id === studentId)?.name;
      const lesson = subjectLessons[selectedSubjectId]?.find(l => l.id === lessonId);
      toast.success(`Grade deleted for ${studentName} - ${lesson?.name || 'lesson'}`);
    } catch (error) {
      console.error('Failed to delete grade:', error);
      toast.error('Failed to delete grade');
    }
  };

  // Inline editing functions  
  const saveGradeInline = async (studentId: string, lessonId: string, keepEditing = false) => {
    if (!tempGradeValue.trim()) {
      // If value is empty, check if there's an existing grade to delete
      const existingGrade = grades.find(g => g.studentId === studentId && g.lessonId === lessonId);
      if (existingGrade) {
        // Delete the existing grade
        await deleteGrade(studentId, lessonId);
      }
      setEditingCell(null);
      return;
    }

    try {
      // Find the lesson to get max points
      const lesson = (subjectLessons[selectedSubjectId] || []).find(l => l.id === lessonId);
      if (!lesson) {
        toast.error('Lesson not found');
        return;
      }

      let gradeData: any = {};
      const lowerValue = tempGradeValue.toLowerCase();

      // Handle skip case
      if (lowerValue === 's') {
        const lessonMaxPoints = lesson.points || 0;
        if (lessonMaxPoints <= 0) {
          toast.error('Please set lesson points before skipping grades');
          return;
        }
        gradeData.percentage = 0;
        gradeData.errors = lessonMaxPoints;
        gradeData.points = lessonMaxPoints;
      } else {
        // Handle letter grade
        const letterPercentage = processLetterGrade(tempGradeValue);
        if (letterPercentage !== null) {
          const lessonMaxPoints = lesson.points || 0;
          gradeData.percentage = letterPercentage;
          gradeData.errors = lessonMaxPoints > 0
            ? Math.round(lessonMaxPoints * (1 - letterPercentage / 100))
            : 0;
          gradeData.points = lessonMaxPoints;
        } else {
          // Handle fraction entry
          const fractionPoints = processFractionEntry(tempGradeValue, lessonId);
          if (fractionPoints !== null) {
            const maxPoints = parseFloat(tempGradeValue.split('/')[1]);
            if (maxPoints <= 0) {
              toast.error('Invalid fraction - denominator must be greater than 0');
              return;
            }
            gradeData.percentage = roundToNearestHalf(((fractionPoints / maxPoints) * 100));
            gradeData.errors = Math.max(0, maxPoints - fractionPoints);
            gradeData.points = maxPoints;
          } else {
            // Handle numeric entry
            const numericValue = parseFloat(tempGradeValue);
            if (!isNaN(numericValue)) {
              const lessonMaxPoints = lesson.points || 0;

              if (entryMode === 'errors' && lessonMaxPoints <= 0) {
                toast.error('Please set lesson points before entering grades in errors mode');
                return;
              }

              if (entryMode === 'errors') {
                const correctPoints = Math.max(0, lessonMaxPoints - numericValue);
                gradeData.percentage = lessonMaxPoints > 0
                  ? roundToNearestHalf(((correctPoints / lessonMaxPoints) * 100))
                  : 0;
                gradeData.errors = numericValue;
                gradeData.points = lessonMaxPoints;
              } else {
                gradeData.percentage = roundToNearestHalf(numericValue);
                gradeData.errors = lessonMaxPoints > 0
                  ? Math.round(lessonMaxPoints * (1 - numericValue / 100))
                  : 0;
                gradeData.points = lessonMaxPoints;
              }
            } else {
              toast.error('Invalid grade value');
              return;
            }
          }
        }
      }

      // Save grade to backend
      const response = await apiClient.setGrade(studentId, lessonId, gradeData);

      // Update local state
      const existingGradeIndex = grades.findIndex(
        g => g.studentId === studentId && g.lessonId === lessonId
      );

      const newGrade: Grade = {
        id: (response.data as any)?.id || `${studentId}-${lessonId}`,
        studentId,
        lessonId,
        subjectId: selectedSubjectId,
        percentage: gradeData.percentage,
        points: gradeData.points - (gradeData.errors || 0),
        maxPoints: gradeData.points,
        errors: gradeData.errors,
        date: new Date().toISOString(),
        notes: undefined,
        skipped: lowerValue === 's',
        created_at: (response.data as any)?.created_at,
        updated_at: (response.data as any)?.updated_at
      };

      if (existingGradeIndex !== -1) {
        setGrades(current => current.map((g, index) =>
          index === existingGradeIndex ? newGrade : g
        ));
      } else {
        setGrades(current => [...current, newGrade]);
      }

      if (!keepEditing) {
        setEditingCell(null);
      }
      toast.success('Grade updated');
    } catch (error) {
      console.error('Failed to save grade:', error);
      toast.error('Failed to save grade');
    }
  };

  const startEditingLesson = (lessonId: string, currentType: string, currentPoints: number, focusOnPoints = false) => {
    setEditingLesson(lessonId);
    setTempLessonData({ type: currentType, points: currentPoints.toString() });
    setLessonEditFocusOnPoints(focusOnPoints);
  };

  const saveLessonInline = async (lessonId: string) => {
    try {
      const updates: any = {};

      if (tempLessonData.type) {
        const categoryId = getCategoryIdFromTypeName(tempLessonData.type);
        if (categoryId) {
          updates.categoryId = categoryId;
        }
      }

      if (tempLessonData.points !== undefined) {
        const points = parseInt(tempLessonData.points);
        if (tempLessonData.points.trim() === '' || isNaN(points) || points <= 0) {
          toast.error('Please enter a valid number of points (greater than 0)');
          return;
        }
        updates.points = points;
      }

      if (Object.keys(updates).length === 0) {
        setEditingLesson(null);
        return;
      }

      await apiClient.updateLesson(lessonId, updates);

      // Refresh lessons for this subject to get updated type and type_color
      const lessonsRes = await apiClient.getLessonsForSubject(selectedSubjectId);
      const lessonsData = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
      setSubjectLessons(prev => ({ ...prev, [selectedSubjectId]: lessonsData }));

      setEditingLesson(null);
      setLessonEditFocusOnPoints(false);
      setTempLessonData({}); // Clear temporary data
      
      // After saving lesson, focus on first student in table mode
      if (activeView === 'table' && enrolledStudents.length > 0) {
        const firstStudent = enrolledStudents[0];
        const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === lessonId);
        const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
        const currentValue = existingGrade
          ? (isSkipped ? 'S' : (entryMode === 'percentage' 
              ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
              : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
          : '';
        
        // Use a small delay to ensure the lesson editing state is cleared first
        setTimeout(() => {
          startEditingGrade(firstStudent.id, lessonId, currentValue);
        }, 100);
      }
      
      toast.success('Lesson updated');
    } catch (error) {
      console.error('Failed to update lesson:', error);
      toast.error('Failed to update lesson');
    }
  };

  // Navigation function for inline editing
  const navigateToNextCell = (currentStudentId: string, currentLessonId: string) => {
    const currentLessons = (subjectLessons[selectedSubjectId] || [])
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    const currentStudents = enrolledStudents;

    const currentStudentIndex = currentStudents.findIndex(s => s.id === currentStudentId);
    const currentLessonIndex = currentLessons.findIndex(l => l.id === currentLessonId);

    if (currentStudentIndex === -1 || currentLessonIndex === -1) return;

    // Try to move to next student in same lesson
    if (currentStudentIndex < currentStudents.length - 1) {
      const nextStudent = currentStudents[currentStudentIndex + 1];
      const existingGrade = grades.find(g => g.studentId === nextStudent.id && g.lessonId === currentLessonId);
      const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
      const currentValue = existingGrade
        ? (isSkipped ? 'S' : (entryMode === 'percentage' 
            ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
            : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
        : '';
      startEditingGrade(nextStudent.id, currentLessonId, currentValue);
      return;
    }

    // Move to next lesson, first student
    if (currentLessonIndex < currentLessons.length - 1) {
      const nextLesson = currentLessons[currentLessonIndex + 1];
      const firstStudent = currentStudents[0];
      if (firstStudent) {
        const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === nextLesson.id);
        const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
        const currentValue = existingGrade
          ? (isSkipped ? 'S' : (entryMode === 'percentage' 
              ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
              : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
          : '';
        startEditingGrade(firstStudent.id, nextLesson.id, currentValue);
      }
      return;
    }

    // End of all lessons, stay on current cell
    setEditingCell(null);
  };

  const navigateToCell = (direction: 'up' | 'down' | 'left' | 'right', currentStudentId: string, currentLessonId: string) => {
    const currentLessons = (subjectLessons[selectedSubjectId] || [])
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    const currentStudents = enrolledStudents;

    const currentStudentIndex = currentStudents.findIndex(s => s.id === currentStudentId);
    const currentLessonIndex = currentLessons.findIndex(l => l.id === currentLessonId);

    if (currentStudentIndex === -1 || currentLessonIndex === -1) return;

    let newStudentIndex = currentStudentIndex;
    let newLessonIndex = currentLessonIndex;

    switch (direction) {
      case 'up':
        newStudentIndex = Math.max(0, currentStudentIndex - 1);
        break;
      case 'down':
        newStudentIndex = Math.min(currentStudents.length - 1, currentStudentIndex + 1);
        break;
      case 'left':
        newLessonIndex = Math.max(0, currentLessonIndex - 1);
        break;
      case 'right':
        newLessonIndex = Math.min(currentLessons.length - 1, currentLessonIndex + 1);
        break;
    }

    if (newStudentIndex !== currentStudentIndex || newLessonIndex !== currentLessonIndex) {
      const newStudent = currentStudents[newStudentIndex];
      const newLesson = currentLessons[newLessonIndex];
      if (newStudent && newLesson) {
        const existingGrade = grades.find(g => g.studentId === newStudent.id && g.lessonId === newLesson.id);
        const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
        const currentValue = existingGrade
          ? (isSkipped ? 'S' : (entryMode === 'percentage' 
              ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
              : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
          : '';
        startEditingGrade(newStudent.id, newLesson.id, currentValue);
      }
    }
  };

  // Update grade entry logic
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Grade Entry</h2>
          <p className="text-muted-foreground">
            {selectedSubject?.name || "Select a subject"} - {selectedLesson?.name || "Select a lesson"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={activeView === 'entry' ? 'default' : 'outline'}
            onClick={() => switchViewMode('entry')}
            className="flex items-center gap-2"
          >
            <Keyboard size={16} />
            Entry
          </Button>
          <Button 
            variant={activeView === 'table' ? 'default' : 'outline'}
            onClick={() => switchViewMode('table')}
            className="flex items-center gap-2"
          >
            <Table size={16} />
            Table
          </Button>
        </div>
      </div>

      {activeView === 'table' ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Grade Table - {selectedSubject?.name || "Select a subject"}</CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={entryMode === 'errors'}
                    onCheckedChange={(checked) => setEntryMode(checked ? 'errors' : 'percentage')}
                    id="table-entry-mode"
                  />
                  <Label htmlFor="table-entry-mode" className="sr-only">
                    {entryMode === 'errors' ? 'Errors' : 'Percentage'} mode
                  </Label>
                  {entryMode === 'errors' && (
                    <Badge variant="outline" className="text-xs">
                      <X size={12} className="mr-1" />
                      Errors
                    </Badge>
                  )}
                  {entryMode === 'percentage' && (
                    <Badge variant="outline" className="text-xs">
                      <Percent size={12} className="mr-1" />
                      Percentage
                    </Badge>
                  )}
                </div>
                <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                  <Keyboard size={16} />
                  Click cells to edit grades inline • Use arrow keys to navigate • Enter to save & move to next • Click lesson headers to edit lesson properties
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {enrolledStudents.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No students enrolled in this subject
              </p>
            ) : !selectedSubjectId ? (
              <p className="text-center text-muted-foreground py-8">
                Please select a subject to view the grade table
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-background z-10 min-w-[200px]">
                        Student
                      </th>
                      {(subjectLessons[selectedSubjectId] || [])
                        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                        .map(lesson => (
                        <th
                          key={lesson.id}
                          className={`text-center p-2 font-medium min-w-[100px]`}
                          style={{
                            backgroundColor: !isDefaultLessonType(lesson.type) 
                              ? `${getCategoryColor(lesson)}20` 
                              : 'hsl(var(--muted))',
                            borderLeft: !isDefaultLessonType(lesson.type) 
                              ? `2px solid ${getCategoryColor(lesson)}` 
                              : undefined,
                            borderRight: !isDefaultLessonType(lesson.type) 
                              ? `2px solid ${getCategoryColor(lesson)}` 
                              : undefined
                          }}
                        >
                          {editingLesson === lesson.id ? (
                            <div className="space-y-1">
                              <div className="text-xs font-medium truncate max-w-[90px]" title={lesson.name}>
                                {lesson.name}
                              </div>
                              <div className="flex flex-col gap-1">
                                <select
                                  value={tempLessonData.type || lesson.type}
                                  onChange={(e) => setTempLessonData(prev => ({ ...prev, type: e.target.value }))}
                                  className="text-xs p-1 border rounded"
                                  autoFocus={!lessonEditFocusOnPoints}
                                >
                                  {gradeCategoryTypes.map(categoryType => (
                                    <option key={categoryType.id} value={categoryType.name}>
                                      {categoryType.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  value={tempLessonData.points !== undefined ? tempLessonData.points : (lesson.points || '')}
                                  onChange={(e) => setTempLessonData(prev => ({ ...prev, points: e.target.value }))}
                                  className="text-xs p-1 border rounded w-full"
                                  placeholder="points"
                                  autoFocus={lessonEditFocusOnPoints}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      saveLessonInline(lesson.id);
                                    } else if (e.key === 'Escape') {
                                      setEditingLesson(null);
                                      setLessonEditFocusOnPoints(false);
                                      setTempLessonData({}); // Clear temporary data
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1 cursor-pointer" onClick={() => startEditingLesson(lesson.id, lesson.type, lesson.points || 0, false)}>
                              <div className="text-xs font-medium truncate max-w-[90px]" title={lesson.name}>
                                {lesson.name}
                              </div>
                              <Badge
                                className="text-xs text-white border-0"
                                style={{ backgroundColor: getCategoryColor(lesson) }}
                              >
                                {lesson.type}
                              </Badge>
                              <div 
                                className="text-xs text-muted-foreground hover:bg-gray-100 rounded px-1" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingLesson(lesson.id, lesson.type, lesson.points || 0, true);
                                }}
                                title="Click to edit points directly"
                              >
                                {lesson.points}pts
                              </div>
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {enrolledStudents.map((student) => (
                      <tr key={student.id} className="border-b border-border hover:bg-muted/20">
                        <td className="p-3 font-medium sticky left-0 bg-background z-10">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                              {student.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </div>
                            <span className="truncate max-w-[150px]" title={student.name}>
                              {student.name}
                            </span>
                          </div>
                        </td>
                        {(subjectLessons[selectedSubjectId] || [])
                          .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                          .map(lesson => {
                          const existingGrade = grades.find(
                            g => g.studentId === student.id && g.lessonId === lesson.id
                          );
                          
                          let displayValue = '';
                          let displayPercentage = 0;
                          let isSkipped = false;
                          
                          if (existingGrade) {
                            // Use stored values directly from database - convert to numbers
                            const percentage = typeof existingGrade.percentage === 'number' ? existingGrade.percentage : 
                                             (typeof existingGrade.percentage === 'string' ? parseFloat(existingGrade.percentage) : 0);
                            const errors = typeof existingGrade.errors === 'number' ? existingGrade.errors : 
                                          (typeof existingGrade.errors === 'string' ? parseFloat(existingGrade.errors) : 0);
                            const maxPoints = existingGrade.maxPoints || existingGrade.points || 0;
                            
                            // Check if this is a skipped grade (0% with full errors)
                            isSkipped = percentage === 0 && errors === maxPoints;
                            
                            if (isSkipped) {
                              displayValue = 'S';
                              displayPercentage = 0;
                            } else if (entryMode === 'percentage') {
                              displayValue = percentage > 0 ? percentage.toString() : '';
                              displayPercentage = roundToNearestHalf(percentage);
                            } else {
                              displayValue = errors > 0 ? errors.toString() : '';
                              // Calculate percentage from stored values for display
                              const rawPercentage = maxPoints > 0 ? ((maxPoints - errors) / maxPoints) * 100 : 0;
                              displayPercentage = roundToNearestHalf(rawPercentage);
                            }
                          }
                          
                          const getGradeColor = (percentage: number, skipped: boolean) => {
                            if (skipped) return 'bg-gray-100 text-gray-600';
                            if (percentage >= 90) return 'bg-green-100 text-green-800 border-green-200';
                            if (percentage >= 70) return 'bg-blue-100 text-blue-800 border-blue-200';
                            return 'bg-red-100 text-red-800 border-red-200';
                          };
                          
                          return (
                            <td
                              key={lesson.id}
                              className={`text-center p-2 border-x border-border cursor-pointer hover:bg-muted/50 transition-colors`}
                              style={{ 
                                backgroundColor: !isDefaultLessonType(lesson.type) 
                                  ? `${getCategoryColor(lesson)}10` 
                                  : undefined 
                              }}
                              onClick={() => {
                                if (editingCell?.studentId === student.id && editingCell?.lessonId === lesson.id) {
                                  return; // Already editing this cell
                                }
                                startEditingGrade(student.id, lesson.id, displayValue);
                              }}
                            >
                              {editingCell?.studentId === student.id && editingCell?.lessonId === lesson.id ? (
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    value={tempGradeValue}
                                    onChange={(e) => setTempGradeValue(e.target.value)}
                                    className="text-xs p-1 border rounded w-full text-center"
                                    placeholder={entryMode === 'percentage' ? '%' : 'errors'}
                                    autoFocus
                                    onFocus={(e) => e.target.select()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        saveGradeInline(student.id, lesson.id, true);
                                        setTimeout(() => navigateToNextCell(student.id, lesson.id), 100);
                                      } else if (e.key === 'Escape') {
                                        setEditingCell(null);
                                      } else if (e.key === ' ') {
                                        // Space key: in table mode, edit the lesson points for the current lesson
                                        e.preventDefault();
                                        if (activeView === 'table') {
                                          // Start editing the lesson header for points
                                          const currentLesson = (subjectLessons[selectedSubjectId] || []).find(l => l.id === lesson.id);
                                          if (currentLesson) {
                                            startEditingLesson(lesson.id, currentLesson.type, currentLesson.points || 0, true);
                                            toast.success('Lesson points editing activated');
                                          }
                                        } else if (lessonPointsRef.current && selectedLesson) {
                                          lessonPointsRef.current.focus();
                                          lessonPointsRef.current.select();
                                          toast.success('Lesson points selected');
                                        }
                                      } else if (e.key === 'Delete' && existingGrade) {
                                        e.preventDefault();
                                        deleteGrade(student.id, lesson.id);
                                        setEditingCell(null);
                                      } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        navigateToCell('up', student.id, lesson.id);
                                      } else if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        navigateToCell('down', student.id, lesson.id);
                                      } else if (e.key === 'ArrowLeft') {
                                        e.preventDefault();
                                        navigateToCell('left', student.id, lesson.id);
                                      } else if (e.key === 'ArrowRight') {
                                        e.preventDefault();
                                        navigateToCell('right', student.id, lesson.id);
                                      } else if (e.key === 'PageUp') {
                                        e.preventDefault();
                                        if (enrolledStudents.length > 0) {
                                          const firstStudent = enrolledStudents[0];
                                          const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === lesson.id);
                                          const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                                          const currentValue = existingGrade
                                            ? (isSkipped ? 'S' : (entryMode === 'percentage' 
                                                ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
                                                : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                                            : '';
                                          startEditingGrade(firstStudent.id, lesson.id, currentValue);
                                          toast.success('Jumped to first student');
                                        }
                                      } else if (e.key === 'PageDown') {
                                        e.preventDefault();
                                        if (enrolledStudents.length > 0) {
                                          const lastStudent = enrolledStudents[enrolledStudents.length - 1];
                                          const existingGrade = grades.find(g => g.studentId === lastStudent.id && g.lessonId === lesson.id);
                                          const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                                          const currentValue = existingGrade
                                            ? (isSkipped ? 'S' : (entryMode === 'percentage' 
                                                ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
                                                : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                                            : '';
                                          startEditingGrade(lastStudent.id, lesson.id, currentValue);
                                          toast.success('Jumped to last student');
                                        }
                                      }
                                    }}
                                    onBlur={() => {
                                      // Auto-save on blur if value changed
                                      if (tempGradeValue !== (existingGrade
                                        ? (isSkipped ? 'S' : (entryMode === 'percentage' ? (existingGrade.percentage || 0).toString() : (existingGrade.errors || 0).toString()))
                                        : '')) {
                                        saveGradeInline(student.id, lesson.id, false);
                                      } else {
                                        setEditingCell(null);
                                      }
                                    }}
                                  />
                                </div>
                              ) : existingGrade ? (
                                <div className="space-y-1">
                                  <div
                                    className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${
                                      getGradeColor(displayPercentage, isSkipped)
                                    }`}
                                  >
                                    {isSkipped ? 'SKIP' : `${formatPercentage(typeof displayPercentage === 'number' ? displayPercentage : 0)}%`}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {displayValue}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-muted-foreground text-sm">-</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Legend */}
            <div className="mt-6 p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium mb-3">Grade Color Legend</h4>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
                  <span>90%+ (Excellent)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-100 border border-blue-200"></div>
                  <span>70-89% (Good)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-100 border border-red-200"></div>
                  <span>Below 70% (Needs Improvement)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200"></div>
                  <span>Skipped</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-50 border-2 border-blue-200"></div>
                  <span>Non-lesson columns (Tests, Reviews, etc.)</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Click any grade cell to edit inline • Use arrow keys to navigate • Enter saves and moves to next cell • Click lesson headers to edit properties • F2 switches between entry/table modes
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Students ({enrolledStudents.length})</CardTitle>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={entryMode === 'errors'}
                        onCheckedChange={(checked) => setEntryMode(checked ? 'errors' : 'percentage')}
                        id="entry-mode"
                      />
                      <Label htmlFor="entry-mode" className="sr-only">
                        {entryMode === 'errors' ? 'Errors' : 'Percentage'} mode
                      </Label>
                      {entryMode === 'errors' && (
                        <Badge variant="outline" className="text-xs">
                          <X size={12} className="mr-1" />
                          Errors
                        </Badge>
                      )}
                      {entryMode === 'percentage' && (
                        <Badge variant="outline" className="text-xs">
                          <Percent size={12} className="mr-1" />
                          Percentage
                        </Badge>
                      )}
                    </div>
                    <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                      <Keyboard size={16} />
                      Enhanced keyboard navigation
                    </div>
                    {/* Mobile Navigation Buttons */}
                    <div className="md:hidden flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (currentLessonIndex > 0) {
                            const prevLesson = filteredSubjectLessons[currentLessonIndex - 1];
                            setSelectedLessonId(prevLesson.id);
                            toast.success(`Switched to ${prevLesson.name}`);
                          }
                        }}
                        disabled={currentLessonIndex <= 0}
                        className="px-2"
                      >
                        ‹
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {currentLessonIndex + 1} / {filteredSubjectLessons.length}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (currentLessonIndex < filteredSubjectLessons.length - 1) {
                            const nextLesson = filteredSubjectLessons[currentLessonIndex + 1];
                            setSelectedLessonId(nextLesson.id);
                            toast.success(`Switched to ${nextLesson.name}`);
                          }
                        }}
                        disabled={currentLessonIndex >= filteredSubjectLessons.length - 1}
                        className="px-2"
                      >
                        ›
                      </Button>
                      {/* Subject Navigation */}
                      <div className="mx-2 h-4 w-px bg-border"></div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (currentSubjectIndex > 0) {
                            const prevSubject = availableSubjects[currentSubjectIndex - 1];
                            setSelectedSubjectId(prevSubject.id);
                            setSelectedLessonId('');
                            toast.success(`Switched to ${prevSubject.name}`);
                          }
                        }}
                        disabled={currentSubjectIndex <= 0}
                        className="px-2"
                      >
                        «
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (currentSubjectIndex < availableSubjects.length - 1) {
                            const nextSubject = availableSubjects[currentSubjectIndex + 1];
                            setSelectedSubjectId(nextSubject.id);
                            setSelectedLessonId('');
                            toast.success(`Switched to ${nextSubject.name}`);
                          }
                        }}
                        disabled={currentSubjectIndex >= availableSubjects.length - 1}
                        className="px-2"
                      >
                        »
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Subject and Lesson Selection Dropdowns */}
                {/* Smarter notifications: students, subjects, subject activation, lessons */}
                {loadingInitialData ? (
                  <div className="p-3 mb-2 rounded bg-blue-50 text-blue-700 border border-blue-200 text-sm">
                    Loading data...
                  </div>
                ) : students.length === 0 ? (
                  <div className="p-3 mb-2 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 text-sm">
                    No students found. Please add students before proceeding.<br />
                    <button
                      className="underline text-blue-700 hover:text-blue-900 font-medium mt-2"
                      type="button"
                      onClick={() => goToTab('students')}
                    >
                      Take me there
                    </button>
                  </div>
                ) : subjects.length === 0 ? (
                  <div className="p-3 mb-2 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 text-sm">
                    No subjects found. Please add subjects before proceeding.<br />
                    <button
                      className="underline text-blue-700 hover:text-blue-900 font-medium mt-2"
                      type="button"
                      onClick={() => goToTab('subjects')}
                    >
                      Take me there
                    </button>
                  </div>
                ) : availableSubjects.length === 0 ? (
                  <div className="p-3 mb-2 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 text-sm">
                    No subjects available for grade entry.<br />
                    Please activate subjects for students on the <b>Students</b> tab by clicking the appropriate subject buttons for each student.
                    <button
                      className="underline text-blue-700 hover:text-blue-900 font-medium mt-2"
                      type="button"
                      onClick={() => goToTab('students')}
                    >
                      Take me there
                    </button>
                  </div>
                ) : selectedSubject && (!subjectLessons[selectedSubjectId] || subjectLessons[selectedSubjectId].length === 0) && !loadingLessons[selectedSubjectId] && (
                  <div className="p-3 mb-2 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 text-sm">
                    No lessons found for this subject. Please add lessons before proceeding.<br />
                    You can use <b>Add Lessons</b> to quickly add the chosen number of lessons automatically.<br />
                    <button
                      className="underline text-blue-700 hover:text-blue-900 font-medium mt-2"
                      type="button"
                      onClick={() => goToTab('subjects')}
                    >
                      Take me there
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div>
                    <Label htmlFor="grade-entry-subject-select" className="text-sm font-medium">Subject</Label>
                    <Select value={selectedSubjectId} onValueChange={(subjectId) => {
                      setSelectedSubjectId(subjectId);
                      // Clear lesson selection so auto-selection logic will run
                      setSelectedLessonId("");
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSubjects.map(subject => (
                          <SelectItem key={subject.id} value={subject.id}>
                            {subject.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="grade-entry-lesson-select" className="text-sm font-medium">Lesson</Label>
                    <div className="flex gap-2">
                      <Select value={selectedLessonId} onValueChange={(lessonId) => {
                        const lesson = subjectLessons[selectedSubjectId]?.find(l => l.id === lessonId)
                        if (lesson) {
                          setSelectedLessonId(lessonId)
                        }
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select lesson" />
                        </SelectTrigger>
                        <SelectContent>
                          {(subjectLessons[selectedSubjectId] || []).map(lesson => {
                            const hasGrades = lessonHasGrades(lesson.id);
                            return (
                              <SelectItem key={lesson.id} value={lesson.id}>
                                <div className={`flex items-center gap-2 ${hasGrades ? 'text-green-700' : 'text-gray-600'}`}>
                                  <span className={hasGrades ? 'font-medium' : ''}>{lesson.name}</span>
                                  <Badge 
                                    className={`text-xs text-white border-0 ${hasGrades ? 'opacity-90' : ''}`}
                                    style={{ backgroundColor: getCategoryColor(lesson) }}
                                  >
                                    {lesson.type}
                                  </Badge>
                                  <Badge variant="outline" className={`text-xs ${hasGrades ? 'border-green-300 bg-green-50' : ''}`}>
                                    {lesson.points}pts
                                  </Badge>
                                  {hasGrades && (
                                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                      ✓ Graded
                                    </Badge>
                                  )}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {selectedSubjectId && (
                        <>
                          {selectedLessonId && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => {
                                const lesson = subjectLessons[selectedSubjectId]?.find(l => l.id === selectedLessonId)
                                if (lesson) {
                                  editLesson(lesson, selectedSubjectId)
                                }
                              }}
                              title="Edit Lesson"
                              className="shrink-0"
                            >
                              <PencilSimple className="h-4 w-4" />
                            </Button>
                          )}
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={addLessonAfterSelected}
                            title="Add New Lesson After This One"
                            className="shrink-0"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Points Entry Box */}
                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                  (entryMode === 'errors' && (!selectedLesson?.points || selectedLesson.points <= 0)) 
                    ? 'bg-yellow-100 border border-yellow-300' 
                    : 'bg-muted/30'
                }`}>
                  <Label className="text-sm font-medium">
                    Points for this lesson:
                    {(!selectedLesson?.points || selectedLesson.points <= 0) && (
                      <span className="text-red-600 ml-1">
                        *Required for errors mode
                      </span>
                    )}
                  </Label>
                  <Input
                    ref={lessonPointsRef}
                    type="number"
                    value={lessonPoints}
                    onChange={(e) => setLessonPoints(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!selectedLesson) return;
                        
                        const newPoints = parseFloat(lessonPoints);
                        const isTableMode = (activeView as 'entry' | 'table') === 'table';
                        const currentSelectedLessonId = selectedLessonId;
                        
                        // Function to focus first student based on mode
                        const focusFirstStudent = () => {
                          if (enrolledStudents.length > 0) {
                            if (isTableMode && currentSelectedLessonId) {
                              // Table view: start editing first student in current lesson
                              const firstStudent = enrolledStudents[0];
                              const existingGrade = grades.find(g => g.studentId === firstStudent.id && g.lessonId === currentSelectedLessonId);
                              const isSkipped = existingGrade && existingGrade.percentage === 0 && existingGrade.errors === (existingGrade.maxPoints || existingGrade.points);
                              const currentValue = existingGrade
                                ? (isSkipped ? 'S' : (entryMode === 'percentage' 
                                    ? ((existingGrade.percentage || 0) > 0 ? (existingGrade.percentage || 0).toString() : '') 
                                    : ((existingGrade.errors || 0) > 0 ? (existingGrade.errors || 0).toString() : '')))
                                : '';
                              startEditingGrade(firstStudent.id, currentSelectedLessonId, currentValue);
                            } else {
                              // Entry view: focus first input
                              const firstStudentId = enrolledStudents[0].id;
                              const firstInput = inputRefs.current[firstStudentId];
                              if (firstInput) {
                                firstInput.focus();
                                // Auto-select the text if there's a value
                                if (firstInput.value) {
                                  setTimeout(() => firstInput.select(), 0);
                                }
                                setFocusedCell({ row: 0, col: 0 });
                              }
                            }
                          }
                        };
                        
                        if (!isNaN(newPoints) && newPoints > 0 && newPoints !== selectedLesson.points) {
                          updateLessonPoints(newPoints).then(() => {
                            focusFirstStudent();
                          });
                        } else {
                          // If no change needed, still jump back to first student
                          focusFirstStudent();
                        }
                      }
                    }}
                    onBlur={() => {
                      if (!selectedLesson) return;
                      const newPoints = parseFloat(lessonPoints)
                      if (!isNaN(newPoints) && newPoints > 0 && newPoints !== selectedLesson.points) {
                        updateLessonPoints(newPoints)
                      }
                    }}
                    className={`w-20 ${
                      (entryMode === 'errors' && (!selectedLesson?.points || selectedLesson.points <= 0)) 
                        ? 'border-yellow-400 focus:border-yellow-500' 
                        : ''
                    }`}
                    min="1"
                    step="1"
                    placeholder={placeholderValue}
                    disabled={!selectedLesson}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!selectedLesson) return;
                      const newPoints = parseFloat(lessonPoints)
                      if (!isNaN(newPoints) && newPoints > 0 && newPoints !== selectedLesson.points) {
                        updateLessonPoints(newPoints)
                      }
                    }}
                    disabled={!selectedLesson}
                  >
                    Update
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {enrolledStudents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No students enrolled in this subject
                  </p>
                ) : (
                  <div ref={gridRef} className="space-y-2">
                    {/* Warning for missing lesson points */}
                    {selectedLesson && entryMode === 'errors' && (!selectedLesson.points || selectedLesson.points <= 0) && (
                      <div className="p-3 mb-4 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 text-sm">
                        <strong>⚠️ Missing Lesson Points:</strong> Lesson points are required for errors mode and skipping grades.
                        You can still enter grades in percentage mode without setting points.
                      </div>
                    )}
                    
                    <div className="grid grid-cols-12 gap-4 p-3 text-sm font-medium text-muted-foreground border-b border-border">
                      <div className="col-span-5">Student</div>
                      <div className="col-span-3">
                        {entryMode === 'errors' ? 'Errors' : 'Grade'}
                        {entryMode === 'errors' && selectedLesson ? ` (/${selectedLesson.points})` : entryMode === 'percentage' ? ' (0-100 or A, B+, etc.)' : ''}
                      </div>
                      <div className="col-span-2">Preview</div>
                      <div className="col-span-2">Status</div>
                    </div>
                    
                    {enrolledStudents.map((student, index) => {
                      const currentValue = gradeValues[student.id] || ''
                      let displayPercentage = 0
                      
                      // Calculate percentage based on entry mode
                      if (currentValue && selectedLesson) {
                        if (currentValue.toLowerCase() === 's') {
                          displayPercentage = 0 // Skip shows as 0% but will be marked as skipped
                        } else {
                          const letterPercentage = processLetterGrade(currentValue);
                          if (letterPercentage !== null) {
                            displayPercentage = roundToNearestHalf(letterPercentage);
                          } else {
                            const fractionPoints = processFractionEntry(currentValue, selectedLessonId)
                            if (fractionPoints !== null) {
                              const maxPoints = parseFloat(currentValue.split('/')[1])
                              displayPercentage = roundToNearestHalf(((fractionPoints / maxPoints) * 100))
                            } else {
                              const numericValue = parseFloat(currentValue)
                              if (!isNaN(numericValue)) {
                                if (entryMode === 'errors') {
                                  const points = selectedLesson?.points ? selectedLesson.points - numericValue : 0
                                  displayPercentage = selectedLesson?.points ? roundToNearestHalf(((points / selectedLesson.points) * 100)) : 0
                                } else {
                                  // Direct percentage entry - round to nearest 0.5%
                                  displayPercentage = roundToNearestHalf(numericValue)
                                }
                              }
                            }
                          }
                        }
                      }
                      
                      const existingGrade = grades.find(g => g.studentId === student.id && g.lessonId === selectedLessonId)
                      
                      return (
                        <div
                          key={student.id}
                          className={`grid grid-cols-12 gap-4 p-3 rounded-lg border transition-colors ${
                            focusedCell?.row === index ? 'bg-primary/5 border-primary' : 'bg-card border-border'
                          }`}
                        >
                          <div className="col-span-5 flex items-center">
                            <div>
                              <p className="font-medium">{student.name}</p>
                            </div>
                          </div>
                          
                          <div className="col-span-3">
                            <Input
                              ref={el => {
                                if (el) inputRefs.current[student.id] = el
                              }}
                              type="text"
                              value={currentValue}
                              onChange={(e) => updateGradeValue(student.id, e.target.value)}
                              onBlur={() => saveGrade(student.id)}
                              onKeyDown={(e) => handleKeyNavigation(e, student.id, index)}
                              onFocus={(e) => {
                                setFocusedCell({ row: index, col: 0 });
                                e.target.select();
                              }}
                              className="grade-cell font-medium tabular-nums"
                              placeholder={entryMode === 'errors' ? '# of errors' : '%, A, B+, S(skip)'}
                            />
                          </div>
                          
                          <div className="col-span-2 flex items-center">
                            {currentValue ? (
                              currentValue.toLowerCase() === 's' ? (
                                <Badge variant="outline" className="text-xs">
                                  SKIP
                                </Badge>
                              ) : !isNaN(displayPercentage) ? (
                                <Badge variant={displayPercentage >= 90 ? "default" : displayPercentage >= 70 ? "secondary" : "destructive"}>
                                  {formatPercentage(typeof displayPercentage === 'number' && !isNaN(displayPercentage) ? displayPercentage : 0)}%
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </div>
                          
                          <div className="col-span-2 flex items-center gap-2">
                            {existingGrade ? (
                              <>
                                {(() => {
                                  // Use stored values directly from database
                                  const percentage = existingGrade.percentage || 0;
                                  const errors = existingGrade.errors || 0;
                                  const maxPoints = existingGrade.maxPoints || existingGrade.points || 0;
                                  const isSkipped = percentage === 0 && errors === maxPoints;
                                  return isSkipped ? (
                                    <Badge variant="outline" className="text-xs">
                                      Skipped
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">
                                      Saved
                                    </Badge>
                                  );
                                })()}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                  onClick={() => deleteGrade(student.id, selectedLessonId)}
                                  title="Delete grade"
                                >
                                  <Trash size={12} />
                                </Button>
                              </>
                            ) : currentValue ? (
                              <Badge variant="secondary" className="text-xs">
                                Unsaved
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">Empty</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {selectedLesson && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Lesson Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-sm">Type</Label>
                    <Badge 
                      className="ml-2 capitalize text-white border-0"
                      style={{ backgroundColor: getCategoryColor(selectedLesson) }}
                    >
                      {selectedLesson.type}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-sm">Max Points</Label>
                    <p className="font-medium">{selectedLesson.points || selectedLesson.maxPoints}</p>
                  </div>
                  {selectedLesson.dueDate && (
                    <div>
                      <Label className="text-sm">Due Date</Label>
                      <p className="font-medium">{new Date(selectedLesson.dueDate).toLocaleDateString()}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-sm">Entry Mode</Label>
                    <p className="font-medium">
                      {entryMode === 'errors' ? 'Errors (out of ' + (selectedLesson.points || selectedLesson.maxPoints) + ')' : 'Percentage (0-100)'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="hidden md:block">
              <CardHeader>
                <CardTitle className="text-lg">Keyboard Shortcuts</CardTitle>
                <p className="text-sm text-muted-foreground">Most shortcuts work globally - no need to focus inputs first!</p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Next student</span>
                  <Badge variant="outline" className="text-xs">↓ / Enter</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Previous student</span>
                  <Badge variant="outline" className="text-xs">↑</Badge>
                </div>
                <div className="flex justify-between">
                  <span>First student</span>
                  <Badge variant="outline" className="text-xs">PageUp</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Last student</span>
                  <Badge variant="outline" className="text-xs">PageDown</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Next lesson</span>
                  <Badge variant="outline" className="text-xs">→</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Previous lesson</span>
                  <Badge variant="outline" className="text-xs">←</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Next subject</span>
                  <Badge variant="outline" className="text-xs">Shift+↓</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Previous subject</span>
                  <Badge variant="outline" className="text-xs">Shift+↑</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Switch entry mode</span>
                  <Badge variant="outline" className="text-xs">F1</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Switch view mode</span>
                  <Badge variant="outline" className="text-xs">F2</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Skip lesson</span>
                  <Badge variant="outline" className="text-xs">S</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Edit lesson points</span>
                  <Badge variant="outline" className="text-xs">Space</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Save current grade</span>
                  <Badge variant="outline" className="text-xs">Tab / Blur</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Exit focus</span>
                  <Badge variant="outline" className="text-xs">Esc</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Edit Lesson Dialog */}
      <Dialog open={editLessonDialog.open} onOpenChange={v => { if (!v) closeEditLessonDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Lesson</DialogTitle>
          </DialogHeader>
          {editLessonDialog.lesson && (
            <form onSubmit={e => { 
              e.preventDefault(); 
              const formData = new FormData(e.currentTarget);
              handleEditLessonSave({
                name: formData.get('name') as string,
                type: formData.get('type') as string, // Allow any custom grade category type
                points: parseInt(formData.get('points') as string) || 0
              });
            }}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-lesson-name">Name</Label>
                  <Input id="edit-lesson-name" name="name" defaultValue={editLessonDialog.lesson.name} />
                </div>
                <div>
                  <Label htmlFor="edit-lesson-type">Type</Label>
                  <div className="flex items-center gap-2">
                    <select id="edit-lesson-type" name="type" defaultValue={editLessonDialog.lesson.type} className="flex-1 border rounded px-2 py-1">
                      {gradeCategoryTypes.map(categoryType => (
                        <option key={categoryType.id} value={categoryType.name}>
                          {categoryType.name}
                        </option>
                      ))}
                    </select>
                    <div 
                      className="w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: getCategoryColor(editLessonDialog.lesson) }}
                      title={`Color for ${editLessonDialog.lesson.type}`}
                    ></div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="edit-lesson-points">Points</Label>
                  <Input id="edit-lesson-points" name="points" type="number" defaultValue={editLessonDialog.lesson.points} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeEditLessonDialog}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    Save Changes
                  </Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}