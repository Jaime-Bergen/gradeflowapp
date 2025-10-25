import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash, X, CaretDown, CaretUp, PencilSimple } from "@phosphor-icons/react"
import { Lesson, GradingPeriodMarker, User } from '@/lib/types'
import { apiClient } from '@/lib/api'

function Subjects() {
  // Helper function to get default weights for categories (only active ones)
  const getDefaultWeights = () => {
    const defaultWeights: { [categoryId: string]: number } = {};
    const activeCategories = gradeCategoryTypes.filter(category => category.is_active !== false);
    
    // Initialize all active categories to 0
    activeCategories.forEach(category => {
      defaultWeights[category.id] = 0;
    });
    
    // Helper function to normalize names for comparison
    const normalizeName = (name: string) => name.toLowerCase().replace(/[\s\-_]/g, '');
    
    // Find homework-like category for 34% weight
    let homeworkCategory = activeCategories.find(cat => 
      normalizeName(cat.name) === 'homework'
    );
    
    if (!homeworkCategory) {
      homeworkCategory = activeCategories.find(cat => 
        ['lesson', 'normal'].includes(normalizeName(cat.name))
      );
    }
    
    if (!homeworkCategory) {
      // Find first category that's not test/quiz/project/participation
      const excludeNames = ['test', 'tests', 'quiz', 'quizzes', 'project', 'projects', 'participation'];
      homeworkCategory = activeCategories.find(cat => 
        !excludeNames.includes(normalizeName(cat.name))
      );
    }
    
    // Find test-like category for 66% weight
    let testCategory = activeCategories.find(cat => 
      ['test', 'tests'].includes(normalizeName(cat.name))
    );
    
    // Assign weights
    if (homeworkCategory) {
      defaultWeights[homeworkCategory.id] = 34;
    }
    
    if (testCategory && testCategory.id !== homeworkCategory?.id) {
      defaultWeights[testCategory.id] = 66;
    } else if (!testCategory && activeCategories.length > 1) {
      // If no test category found, give 66% to the last active category (if different from homework)
      const lastCategory = activeCategories[activeCategories.length - 1];
      if (lastCategory.id !== homeworkCategory?.id) {
        defaultWeights[lastCategory.id] = 66;
      }
    }
    
    return defaultWeights;
  };

  // Function to open add dialog with proper initialization
  const openAddSubjectDialog = () => {
    setNewSubject({
      name: '',
      report_card_name: '',
      weights: getDefaultWeights()
    });
    setSelectedGroups([]);
    setIsEditing(false);
    setEditingSubjectId(null);
    setIsAddDialogOpen(true);
  };

  // Edit subject handler - now actually opens the edit dialog
  function handleEditSubject(subjectId: string) {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) {
      toast.error("Subject not found");
      return;
    }

    // Build weights object from subject data
    const weights: { [categoryId: string]: number } = {};
    gradeCategoryTypes.forEach(category => {
      // Use the new weights structure from the backend
      const weight = subject.weights?.[category.id] || 0;
      // Set weight to 0 for disabled categories
      weights[category.id] = category.is_active === false ? 0 : Math.round(weight * 100); // Convert decimal to percentage (0.34 -> 34)
    });

    // Populate the form with current subject data
    setNewSubject({
      name: subject.name,
      report_card_name: subject.report_card_name || '',
      weights
    });

    // Set selected groups from the subject's group_name
    const groups = subject.group_name ? subject.group_name.split(',').map((g: string) => g.trim()) : [];
    setSelectedGroups(groups);

    // Set editing state
    setIsEditing(true);
    setEditingSubjectId(subjectId);
    setIsAddDialogOpen(true);
  }
  // Show/hide lessons for a subject
  const showLessons = (subjectId: string) => expandedSubjects[subjectId] || false;
  // Store lessons per subjectId
  const [subjectLessons, setSubjectLessons] = useState<{ [subjectId: string]: Lesson[] }>({});
  const [loadingLessons, setLoadingLessons] = useState<{ [subjectId: string]: boolean }>({});
  const [subjectMarkers, setSubjectMarkers] = useState<{ [subjectId: string]: GradingPeriodMarker[] }>({});
  const toggleLessons = async (subjectId: string) => {
    setExpandedSubjects(prev => {
      const next = { ...prev, [subjectId]: !prev[subjectId] };
      return next;
    });
    // If opening and lessons not loaded, fetch them
    if (!showLessons(subjectId) && !subjectLessons[subjectId]) {
      setLoadingLessons(prev => ({ ...prev, [subjectId]: true }));
      const [lessonsRes, markersRes] = await Promise.all([
        apiClient.getLessonsForSubject(subjectId),
        apiClient.getGradingPeriodMarkersForSubject(subjectId)
      ]);
      setSubjectLessons(prev => ({ ...prev, [subjectId]: Array.isArray(lessonsRes.data) ? lessonsRes.data : [] }));
      setSubjectMarkers(prev => ({ ...prev, [subjectId]: Array.isArray(markersRes.data) ? markersRes.data : [] }));
      setLoadingLessons(prev => ({ ...prev, [subjectId]: false }));
    }
  };

  // Add or update subject handler
  async function handleSubmitSubject() {
    if (!newSubject.name.trim()) {
      toast.error("Subject name is required");
      return;
    }
    
    // Validate that grade weights total 100%
    const totalWeight = Object.values(newSubject.weights).reduce((sum, weight) => sum + (weight || 0), 0);
    if (totalWeight !== 100) {
      toast.error(`Grade weights must total exactly 100%. Current total: ${totalWeight}%`);
      return;
    }
    
    try {
      const payload: any = {
        name: newSubject.name.trim()
      };
      
      // Only include report_card_name if it's not empty
      const reportCardName = newSubject.report_card_name.trim();
      if (reportCardName) {
        payload.report_card_name = reportCardName;
      }
      
      // Add weights object for the new structure (only include active categories)
      const weights: { [categoryId: string]: number } = {};
      gradeCategoryTypes.forEach(category => {
        if (category.is_active !== false) {
          const weight = newSubject.weights[category.id] || 0;
          weights[category.id] = Number(weight) / 100 || 0; // Convert percentage to decimal (0-1)
        }
      });
      payload.weights = weights;
      
      // Convert selected group names to group IDs
      if (selectedGroups.length > 0) {
        const groupIds = studentGroups
          .filter(group => selectedGroups.includes(group.name))
          .map(group => group.id);
        payload.groupIds = groupIds;
      }
      
      if (isEditing && editingSubjectId) {
        await apiClient.updateSubject(editingSubjectId, payload);
        toast.success("Subject updated");
      } else {
        await apiClient.createSubject(payload);
        toast.success("Subject added");
      }
      const res = await apiClient.getSubjects();
      setSubjects(Array.isArray(res.data) ? res.data : []);
      // reset form and state
      setNewSubject({
        name: '',
        report_card_name: '',
        weights: getDefaultWeights()
      });
      setSelectedGroups([]);
      setIsAddDialogOpen(false);
      setIsEditing(false);
      setEditingSubjectId(null);
    } catch (err) {
      console.error("Failed to save subject", err);
      toast.error("Failed to save subject");
    }
  }

  // Remove subject handler
  async function handleRemoveSubject(subjectId: string) {
    if (!window.confirm('Are you sure you want to delete this subject? This will also delete all lessons and grades associated with it. This action cannot be undone.')) {
      return;
    }

    try {
      await apiClient.deleteSubject(subjectId);
      // Remove the subject from the local state
      setSubjects(prevSubjects => prevSubjects.filter(subject => subject.id !== subjectId));
      // Also remove any cached lessons for this subject
      setSubjectLessons(prev => {
        const updated = { ...prev };
        delete updated[subjectId];
        return updated;
      });
      toast.success('Subject deleted successfully');
    } catch (error) {
      toast.error('Failed to delete subject');
      console.error('Error deleting subject:', error);
    }
  }

  const [editLessonDialog, setEditLessonDialog] = useState<{ open: boolean, lesson: Lesson | null, subjectId: string | null }>({ open: false, lesson: null, subjectId: null });
  function editLesson(lesson: Lesson, subjectId: string) {
    setEditLessonDialog({ open: true, lesson, subjectId });
  }
  async function handleEditLessonSave(updated: Partial<Lesson>) {
    if (!editLessonDialog.lesson || !editLessonDialog.subjectId) return;
    try {
      await apiClient.updateLesson(editLessonDialog.lesson.id, updated);
      
      // Close dialog immediately to prevent stale data display
      setEditLessonDialog({ open: false, lesson: null, subjectId: null });
      
      // Refresh lessons for this subject
      const subjectId = String(editLessonDialog.subjectId);
      const res = await apiClient.getLessonsForSubject(subjectId);
      
      setSubjectLessons(prev => ({ ...prev, [subjectId]: Array.isArray(res.data) ? res.data : [] }));
      toast.success('Lesson updated');
    } catch (err) {
      console.error('Error in handleEditLessonSave:', err);
      toast.error('Failed to update lesson');
    }
  }
  function closeEditLessonDialog() {
    setEditLessonDialog({ open: false, lesson: null, subjectId: null });
  }
  async function handleDeleteLesson(subjectId: string, lessonId: string) {
    if (!window.confirm('Are you sure you want to delete this lesson? This will also delete all grades associated with this lesson. This action cannot be undone.')) return;
    
    try {
      await apiClient.deleteLesson(lessonId);
      
      // Refresh BOTH lessons and markers (order indices were shifted by backend)
      const [lessonsRes, markersRes] = await Promise.all([
        apiClient.getLessonsForSubject(subjectId),
        apiClient.getGradingPeriodMarkersForSubject(subjectId)
      ]);
      
      const lessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
      const markers = Array.isArray(markersRes.data) ? markersRes.data : [];
      
      console.log('📚 Lessons after delete:', lessons.map((l: any) => ({ id: l.id, name: l.name, order_index: l.order_index })));
      console.log('📍 Markers after delete:', markers.map((m: any) => ({ id: m.id, name: m.name, order_index: m.order_index })));
      
      setSubjectLessons(prev => ({ ...prev, [subjectId]: lessons }));
      setSubjectMarkers(prev => ({ ...prev, [subjectId]: markers }));
      
      // Update the lesson count in the subjects array
      setSubjects(prevSubjects =>
        prevSubjects.map(subject =>
          subject.id === subjectId
            ? { ...subject, lesson_count: (subject.lesson_count || 0) - 1 }
            : subject
        )
      );
      
      toast.success('Lesson deleted');
    } catch (err) {
      toast.error('Failed to delete lesson');
    }
  }
  // Insert a lesson directly below the clicked one
  async function insertLessonAt(subjectId: string, afterOrderIndex: number) {
    try {
      const lessons = subjectLessons[subjectId] || [];
      const categoryTypes = await apiClient.getGradeCategoryTypes();
      const defaultCategory = Array.isArray(categoryTypes.data) 
        ? categoryTypes.data.find(c => c.is_default) || categoryTypes.data[0]
        : null;
      
      if (!defaultCategory) {
        toast.error('No grade categories found. Please create categories first.');
        return;
      }
      
      let orderIndex: number;
      let lessonNumber: number;
      let lessonPoints = 100; // Default
      
      if (afterOrderIndex === 0) {
        // Creating the first lesson
        orderIndex = 1;
        lessonNumber = 1;
      } else {
        // Find the lesson with this order_index (cast to any for snake_case property access)
        const lessonAtPosition = lessons.find(l => (l as any).order_index === afterOrderIndex);
        
        if (!lessonAtPosition) {
          toast.error('Cannot find lesson to insert after');
          return;
        }
        
        // The new lesson should go at the position right after this lesson
        orderIndex = afterOrderIndex + 1;
        lessonNumber = orderIndex;
        
        // Copy points from the lesson we're inserting after
        lessonPoints = lessonAtPosition.points || 100;
        
        // Try to extract number from the lesson name (e.g., "Lesson 15" -> 15)
        if (lessonAtPosition.name) {
          const match = lessonAtPosition.name.match(/(\d+)$/);
          if (match) {
            lessonNumber = parseInt(match[1], 10) + 1;
          }
        }
      }
      
      // Create the lesson using the backend endpoint that handles shifting automatically
      await apiClient.createLesson(
        subjectId,
        `${lessonPrefix} ${lessonNumber}`,
        defaultCategory.id,
        lessonPoints,
        orderIndex
      );
      
      // Refresh BOTH lessons and markers (order indices were shifted by backend)
      const [finalRes, markersRes] = await Promise.all([
        apiClient.getLessonsForSubject(subjectId),
        apiClient.getGradingPeriodMarkersForSubject(subjectId)
      ]);
      const finalLessons = Array.isArray(finalRes.data) ? finalRes.data : [];
      setSubjectLessons(prev => ({ ...prev, [subjectId]: finalLessons }));
      setSubjectMarkers(prev => ({ ...prev, [subjectId]: Array.isArray(markersRes.data) ? markersRes.data : [] }));
      
      // Update the lesson count in the subjects array
      setSubjects(prevSubjects =>
        prevSubjects.map(subject =>
          subject.id === subjectId
            ? { ...subject, lesson_count: finalLessons.length }
            : subject
        )
      );
      
      toast.success('Lesson inserted');
    } catch (err) {
      console.error('Failed to insert lesson:', err);
      toast.error('Failed to insert lesson');
    }
  }
  function handleAutoGenDialog(subjectId: string) {
    openAddLessonDialog(subjectId);
  }

  // Insert a grading period marker at the specified position
  async function insertGradingPeriodMarker(subjectId: string, orderIndex: number) {
    try {
      const gradingPeriods = userProfile?.grading_periods || 6;
      const maxMarkers = gradingPeriods - 1; // For N periods, you need N-1 markers
      const currentMarkers = subjectMarkers[subjectId] || [];

      if (currentMarkers.length >= maxMarkers) {
        toast.error(`Cannot add more grading period markers. Your grading periods setting (${gradingPeriods}) allows a maximum of ${maxMarkers} markers per subject.`);
        return;
      }

      await apiClient.createGradingPeriodMarker(subjectId, undefined, orderIndex);

      // Refresh BOTH markers and lessons (lessons were shifted by backend)
      const [markersRes, lessonsRes] = await Promise.all([
        apiClient.getGradingPeriodMarkersForSubject(subjectId),
        apiClient.getLessonsForSubject(subjectId)
      ]);
      
      let markers = Array.isArray(markersRes.data) ? markersRes.data : [];
      
      // Renumber markers
      for (let i = 0; i < markers.length; i++) {
        const newName = `End of Grading Period ${i + 1}`;
        if (markers[i].name !== newName) {
          await apiClient.updateGradingPeriodMarker(markers[i].id, newName, markers[i].order_index);
          markers[i].name = newName;
        }
      }
      
      setSubjectMarkers(prev => ({ ...prev, [subjectId]: markers }));
      setSubjectLessons(prev => ({ ...prev, [subjectId]: Array.isArray(lessonsRes.data) ? lessonsRes.data : [] }));

      toast.success('Grading period marker added');
    } catch (err) {
      console.error('Failed to add grading period marker:', err);
      toast.error('Failed to add grading period marker');
    }
  }

  // Delete a grading period marker
  async function deleteGradingPeriodMarker(subjectId: string, markerId: string) {
    if (!window.confirm('Are you sure you want to delete this grading period marker?')) return;

    try {
      await apiClient.deleteGradingPeriodMarker(markerId);

      // Refresh BOTH markers and lessons (lessons were shifted by backend)
      const [markersRes, lessonsRes] = await Promise.all([
        apiClient.getGradingPeriodMarkersForSubject(subjectId),
        apiClient.getLessonsForSubject(subjectId)
      ]);
      
      let markers = Array.isArray(markersRes.data) ? markersRes.data : [];
      
      // Renumber markers
      for (let i = 0; i < markers.length; i++) {
        const newName = `End of Grading Period ${i + 1}`;
        if (markers[i].name !== newName) {
          await apiClient.updateGradingPeriodMarker(markers[i].id, newName, markers[i].order_index);
          markers[i].name = newName;
        }
      }
      
      setSubjectMarkers(prev => ({ ...prev, [subjectId]: markers }));
      setSubjectLessons(prev => ({ ...prev, [subjectId]: Array.isArray(lessonsRes.data) ? lessonsRes.data : [] }));

      toast.success('Grading period marker deleted');
    } catch (err) {
      console.error('Failed to delete grading period marker:', err);
      toast.error('Failed to delete grading period marker');
    }
  }

  // Shift a marker up or down by swapping order_index with adjacent lesson
  async function shiftMarker(subjectId: string, marker: any, direction: 'up' | 'down') {
    try {
      const lessons = subjectLessons[subjectId] || [];
      const markers = subjectMarkers[subjectId] || [];
      
      // Get combined and sorted items
      // Use 'itemType' to distinguish between lessons and markers, not 'type' (which is the category name)
      const combinedItems = [
        ...lessons.map((l: any) => ({ ...l, itemType: 'lesson' })),
        ...markers.map((m: any) => ({ ...m, itemType: 'marker' }))
      ].sort((a, b) => ((a as any).order_index ?? 0) - ((b as any).order_index ?? 0));
      
      // Find the current marker's position in combined array
      const currentIndex = combinedItems.findIndex((item: any) => 
        item.itemType === 'marker' && item.id === marker.id
      );
      
      if (currentIndex === -1) {
        toast.error('Marker not found');
        return;
      }
      
      // Find the adjacent lesson to swap with
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      
      if (targetIndex < 0 || targetIndex >= combinedItems.length) {
        toast.error(`Cannot move marker ${direction}`);
        return;
      }
      
      const targetItem = combinedItems[targetIndex];
      
      // Only swap with lessons, not other markers
      if (targetItem.itemType !== 'lesson') {
        toast.error(`Can only swap with lessons`);
        return;
      }
      
      // Swap the order_index values
      const markerOrderIndex = (marker as any).order_index;
      const lessonOrderIndex = (targetItem as any).order_index;
      
      // Update both items
      await Promise.all([
        apiClient.updateGradingPeriodMarker(marker.id, marker.name, lessonOrderIndex),
        apiClient.updateLesson(targetItem.id, { orderIndex: markerOrderIndex })
      ]);
      
      // Refresh both datasets
      const [markersRes, lessonsRes] = await Promise.all([
        apiClient.getGradingPeriodMarkersForSubject(subjectId),
        apiClient.getLessonsForSubject(subjectId)
      ]);
      
      setSubjectMarkers(prev => ({ 
        ...prev, 
        [subjectId]: Array.isArray(markersRes.data) ? markersRes.data : [] 
      }));
      setSubjectLessons(prev => ({ 
        ...prev, 
        [subjectId]: Array.isArray(lessonsRes.data) ? lessonsRes.data : [] 
      }));
      
      toast.success(`Marker moved ${direction}`);
    } catch (err) {
      console.error('Failed to shift marker:', err);
      toast.error('Failed to shift marker');
    }
  }

  const [subjects, setSubjects] = useState<any[]>([]);
  const [studentGroups, setStudentGroups] = useState<any[]>([]);
  const [gradeCategoryTypes, setGradeCategoryTypes] = useState<any[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState({
    name: '',
    report_card_name: '',
    weights: {} as { [categoryId: string]: number }
  });

  // Helper function to get category color from lesson object or type name
  const getCategoryColor = (lesson: any): string => {
    // First try to use the type_color field from the API response
    if (lesson.type_color) {
      return lesson.type_color;
    }
    // Fallback to looking up by type name
    const categoryType = gradeCategoryTypes.find(cat => cat.name === lesson.type);
    return categoryType?.color || '#6366f1'; // Default color
  };
  const [expandedSubjects, setExpandedSubjects] = useState<{ [id: string]: boolean }>({});
  const [addLessonDialog, setAddLessonDialog] = useState<{ open: boolean, subjectId: string | null }>({ open: false, subjectId: null });
  const [lessonReplacementDialog, setLessonReplacementDialog] = useState<{ open: boolean, subjectId: string | null, existingCount: number }>({ open: false, subjectId: null, existingCount: 0 });
  const [lessonCount, setLessonCount] = useState(1);
  const [lessonPrefix, setLessonPrefix] = useState('Lesson');
  const [lessonType, setLessonType] = useState('lesson');
  const [lessonPoints, setLessonPoints] = useState(100);
  const [addMarkerDialog, setAddMarkerDialog] = useState<{ open: boolean, subjectId: string | null, desiredOrderIndex: number | null, selectedOptionIdx: number | null }>({ open: false, subjectId: null, desiredOrderIndex: null, selectedOptionIdx: null });
  const [userProfile, setUserProfile] = useState<User | null>(null);

  // Update lesson type when categories are loaded
  useEffect(() => {
    if (gradeCategoryTypes.length > 0) {
      setLessonType(gradeCategoryTypes[0].name.toLowerCase());
    }
  }, [gradeCategoryTypes]);

  // Calculate total weight for validation (only include active categories)
  const totalWeight = gradeCategoryTypes
    .filter(category => category.is_active !== false)
    .reduce((sum, category) => sum + (newSubject.weights[category.id] || 0), 0);

  // Fetch subjects and student groups from API on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [subjectsRes, groupsRes, categoriesRes, profileRes] = await Promise.all([
          apiClient.getSubjects(),
          apiClient.getStudentGroups(),
          apiClient.getGradeCategoryTypes(),
          apiClient.getProfile()
        ]);
        setSubjects(Array.isArray(subjectsRes.data) ? subjectsRes.data : []);
        setStudentGroups(Array.isArray(groupsRes.data) ? groupsRes.data : []);
        
        // Handle nested data structure for categories
        const categoriesData = Array.isArray((categoriesRes as any).data?.data) ? (categoriesRes as any).data.data : 
                              Array.isArray((categoriesRes as any).data) ? (categoriesRes as any).data : []
        setGradeCategoryTypes(categoriesData);
        setUserProfile(profileRes.data || null);
      } catch (e) {
        setSubjects([]);
        setStudentGroups([]);
        setGradeCategoryTypes([]);
        setUserProfile(null);
      }
    }
    fetchData();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showGroupDropdown) {
        const target = event.target as Element;
        if (!target.closest('.group-dropdown-container')) {
          setShowGroupDropdown(false);
          setShowNewGroupInput(false);
          setNewGroupName('');
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGroupDropdown]);

  // Listen for expand and highlight requests from other components
  useEffect(() => {
    const handleExpandAndHighlight = (event: CustomEvent) => {
      const { subjectId, action } = event.detail;
      
      // Expand the subject if it's not already expanded
      const isCurrentlyExpanded = expandedSubjects[subjectId];
      if (!isCurrentlyExpanded) {
        toggleLessons(subjectId);
      }
      
      // Scroll to subject after a brief delay
      setTimeout(() => {
        const subjectElement = document.querySelector(`[data-subject-id="${subjectId}"]`);
        if (subjectElement) {
          subjectElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Highlight the appropriate button based on action
          if (action === 'add-marker') {
            const addMarkerButton = subjectElement.querySelector('[data-action="add-marker"]');
            if (addMarkerButton) {
              addMarkerButton.classList.add('animate-pulse', 'ring-2', 'ring-red-500', 'ring-offset-2');
              setTimeout(() => {
                addMarkerButton.classList.remove('animate-pulse', 'ring-2', 'ring-red-500', 'ring-offset-2');
              }, 3000);
            }
          } else if (action === 'add-lesson') {
            // Highlight both "Add Lesson" and "Add Lessons" buttons
            const addLessonButton = subjectElement.querySelector('[data-action="add-lesson"]');
            const addLessonsButton = subjectElement.querySelector('[data-action="add-lessons"]');
            
            if (addLessonButton) {
              addLessonButton.classList.add('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
              setTimeout(() => {
                addLessonButton.classList.remove('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
              }, 3000);
            }
            
            if (addLessonsButton) {
              addLessonsButton.classList.add('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
              setTimeout(() => {
                addLessonsButton.classList.remove('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
              }, 3000);
            }
          }
        }
      }, 200);
    };

    window.addEventListener('gradeflow-subjects-expand-and-highlight', handleExpandAndHighlight as EventListener);
    return () => window.removeEventListener('gradeflow-subjects-expand-and-highlight', handleExpandAndHighlight as EventListener);
  }, [expandedSubjects, toggleLessons]);

  // Listen for general highlight action (for top-level buttons like Add Subject)
  useEffect(() => {
    const handleHighlightAction = (event: CustomEvent) => {
      const { action } = event.detail;
      
      setTimeout(() => {
        const button = document.querySelector(`[data-action="${action}"]`);
        if (button) {
          button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          button.classList.add('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
          setTimeout(() => {
            button.classList.remove('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
          }, 3000);
        }
      }, 200);
    };

    window.addEventListener('gradeflow-subjects-highlight-action', handleHighlightAction as EventListener);
    return () => window.removeEventListener('gradeflow-subjects-highlight-action', handleHighlightAction as EventListener);
  }, []);

  // Group selection handlers
  const toggleGroup = (groupName: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupName) 
        ? prev.filter(g => g !== groupName)
        : [...prev, groupName]
    );
  };

  const createNewGroup = async () => {
    if (!newGroupName.trim()) return;
    
    try {
      const newGroup = { name: newGroupName.trim() };
      await apiClient.createStudentGroup(newGroup);
      
      // Refresh student groups
      const groupsRes = await apiClient.getStudentGroups();
      setStudentGroups(Array.isArray(groupsRes.data) ? groupsRes.data : []);
      
      // Add the new group to selected groups
      setSelectedGroups(prev => [...prev, newGroupName.trim()]);
      
      // Reset form
      setNewGroupName('');
      setShowNewGroupInput(false);
      toast.success('Group created and added');
    } catch (error) {
      toast.error('Failed to create group');
    }
  };

  function openAddLessonDialog(subjectId: string) {
    setAddLessonDialog({ open: true, subjectId });
    setLessonCount(1);
  }
  function closeAddLessonDialog() {
    setAddLessonDialog({ open: false, subjectId: null });
  }
  function openAddMarkerDialog(subjectId: string, insertAfterOrderIndex: number | null) {
    const desiredOrderIndex = insertAfterOrderIndex !== null ? insertAfterOrderIndex + 1 : null;
    
    // Find the option index that matches this orderIndex
    let selectedOptionIdx = null;
    if (desiredOrderIndex !== null) {
      const lessons = subjectLessons[subjectId] ?? [];
      const markers = subjectMarkers[subjectId] ?? [];
      
      const combinedItems = [
        ...lessons.map(item => ({ ...item, itemType: 'lesson' })),
        ...markers.map(item => ({ ...item, itemType: 'marker' }))
      ].sort((a, b) => ((a as any).order_index ?? 0) - ((b as any).order_index ?? 0));
      
      const options = [
        { label: 'At the beginning', value: 1 },
        ...combinedItems.map((item: any) => ({
          label: `After ${item.itemType === 'marker' ? item.name : item.name}`,
          value: (item.order_index ?? 0) + 1
        })),
        { label: 'At the end', value: Math.max(...combinedItems.map((item: any) => item.order_index ?? 0), 0) + 1 }
      ];
      
      selectedOptionIdx = options.findIndex(opt => opt.value === desiredOrderIndex);
      if (selectedOptionIdx === -1) selectedOptionIdx = null;
    }
    
    setAddMarkerDialog({ open: true, subjectId, desiredOrderIndex, selectedOptionIdx });
  }
  function closeAddMarkerDialog() {
    setAddMarkerDialog({ open: false, subjectId: null, desiredOrderIndex: null, selectedOptionIdx: null });
  }
  function closeLessonReplacementDialog() {
    setLessonReplacementDialog({ open: false, subjectId: null, existingCount: 0 });
  }

  async function addLessonsToSubject(subjectId: string, replaceExisting: boolean) {
    try {
      const existingLessons = subjectLessons[subjectId] || [];

      if (replaceExisting) {
        // Delete all existing lessons first
        for (const lesson of existingLessons) {
          await apiClient.deleteLesson(lesson.id);
        }
      }

      // Add new lessons - backend will automatically continue numbering from existing lessons
      await apiClient.addLessonsToSubject(
        subjectId,
        lessonCount,
        lessonPrefix,
        lessonType,
        lessonPoints
      );

      // Always refetch lessons for this subject to update the UI
      const subjectIdStr = String(subjectId);
      setLoadingLessons(prev => ({ ...prev, [subjectIdStr]: true }));
      const res = await apiClient.getLessonsForSubject(subjectIdStr);
      const newLessonsData = Array.isArray(res.data) ? res.data : [];
      setSubjectLessons(prev => ({ ...prev, [subjectIdStr]: newLessonsData }));
      setLoadingLessons(prev => ({ ...prev, [subjectIdStr]: false }));

      // Update the lesson count in the subjects array
      setSubjects(prevSubjects =>
        prevSubjects.map(subject =>
          subject.id === subjectId
            ? { ...subject, lesson_count: newLessonsData.length }
            : subject
        )
      );

      closeAddLessonDialog();
      closeLessonReplacementDialog();
      toast.success(replaceExisting ? 'Lessons replaced successfully' : 'Lesson(s) added successfully');
    } catch (err) {
      toast.error('Failed to add/replace lesson(s)');
    }
  }

  async function handleReplaceLessons() {
    if (!lessonReplacementDialog.subjectId) return;
    await addLessonsToSubject(lessonReplacementDialog.subjectId, true);
  }

  async function handleContinueLessons() {
    if (!lessonReplacementDialog.subjectId) return;
    await addLessonsToSubject(lessonReplacementDialog.subjectId, false);
  }
  async function handleAddLessonSubmit() {
    if (!addLessonDialog.subjectId) return;

    try {
      const subjectId = addLessonDialog.subjectId;
      const existingLessons = subjectLessons[subjectId] || [];
      const hasExistingLessons = existingLessons.length > 0;

      // If subject already has lessons, show replacement options dialog
      if (hasExistingLessons) {
        setLessonReplacementDialog({ open: true, subjectId, existingCount: existingLessons.length });
        return;
      }

      // No existing lessons, proceed directly
      await addLessonsToSubject(subjectId, false);
    } catch (err) {
      toast.error('Failed to add lessons');
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Subjects</h2>
            <p className="text-muted-foreground">Manage subjects and lessons</p>
          </div>
          <Button variant="default" onClick={openAddSubjectDialog} data-action="add-subject">
            <Plus size={16} className="mr-2" /> Add Subject
          </Button>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) {
            setShowGroupDropdown(false);
            setShowNewGroupInput(false);
            setNewGroupName('');
          }
        }}>
          <DialogContent aria-describedby="add-subject-desc">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Subject' : 'Add New Subject'}</DialogTitle>
            </DialogHeader>
            <div id="add-subject-desc" className="text-muted-foreground text-sm mt-1 mb-2">
              Enter a subject name and (optionally) a group. This helps organize your curriculum.
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="subject-name">Name *</Label>
                <Input
                  id="subject-name"
                  value={newSubject.name}
                  onChange={e => setNewSubject(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Subject name"
                  aria-describedby="add-subject-desc"
                />
              </div>
              <div>
                <Label htmlFor="subject-report-name">Report Card Name</Label>
                <Input
                  id="subject-report-name"
                  value={newSubject.report_card_name}
                  onChange={e => setNewSubject(prev => ({ ...prev, report_card_name: e.target.value }))}
                  placeholder="Name to appear on report cards (optional)"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  If blank, the subject name will be used on report cards
                </div>
              </div>
              <div>
                <Label htmlFor="subject-group">Groups</Label>
                <div className="relative group-dropdown-container">
                  <div 
                    className="flex min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                    onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                  >
                    <div className="flex flex-wrap gap-1 flex-1 items-center">
                      {selectedGroups.length === 0 ? (
                        <span className="text-muted-foreground">Select groups (optional)</span>
                      ) : (
                        selectedGroups.map((group, index) => (
                          <Badge key={index} variant="secondary" className="text-xs flex items-center gap-1">
                            {group}
                            <X 
                              size={12} 
                              className="cursor-pointer hover:text-destructive" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedGroups(prev => prev.filter(g => g !== group));
                              }}
                            />
                          </Badge>
                        ))
                      )}
                    </div>
                    <CaretDown size={16} className="text-muted-foreground" />
                  </div>
                  
                  {showGroupDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-background border border-input rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {studentGroups.map((group) => (
                        <div
                          key={group.id}
                          className="flex items-center space-x-2 px-3 py-2 hover:bg-accent cursor-pointer"
                          onClick={() => toggleGroup(group.name)}
                        >
                          <Checkbox 
                            checked={selectedGroups.includes(group.name)}
                            onChange={() => {}} // Controlled by parent click
                          />
                          <span className="text-sm">{group.name}</span>
                        </div>
                      ))}
                      
                      {showNewGroupInput ? (
                        <div className="px-3 py-2 border-t">
                          <div className="flex gap-2">
                            <Input
                              value={newGroupName}
                              onChange={(e) => setNewGroupName(e.target.value)}
                              placeholder="New group name"
                              className="flex-1"
                              autoFocus
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  createNewGroup();
                                }
                              }}
                            />
                            <Button size="sm" onClick={createNewGroup} disabled={!newGroupName.trim()}>
                              Add
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => {
                                setShowNewGroupInput(false);
                                setNewGroupName('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="flex items-center space-x-2 px-3 py-2 hover:bg-accent cursor-pointer border-t"
                          onClick={() => setShowNewGroupInput(true)}
                        >
                          <Plus size={16} />
                          <span className="text-sm text-muted-foreground">Add new group</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label>Grade Weights (%)</Label>
                {gradeCategoryTypes.length === 0 ? (
                  <div className="mt-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-2 text-yellow-800 mb-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span className="font-medium">No Grade Categories Available</span>
                    </div>
                    <p className="text-sm text-yellow-700 mb-3">
                      You need to set up grade category types before creating subjects. 
                      Categories define how different types of assignments (lessons, tests, projects, etc.) are weighted in your gradebook.
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          // Dispatch custom event to navigate to admin settings
                          window.dispatchEvent(new CustomEvent('gradeflow-admin-goto-settings'))
                          setIsAddDialogOpen(false)
                        }}
                        className="bg-white border-yellow-300 text-yellow-800 hover:bg-yellow-50"
                      >
                        Set Up Categories
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {gradeCategoryTypes.map((category) => (
                        <div key={category.id} className={category.is_active === false ? 'opacity-50' : ''}>
                          <Label htmlFor={`${category.id}Weight`} className={category.is_active === false ? 'text-muted-foreground' : ''}>
                            {category.name}
                            {category.is_active === false && <span className="text-xs ml-1">(disabled)</span>}
                          </Label>
                          <Input
                            id={`${category.id}Weight`}
                            type="number"
                            min={0}
                            max={100}
                            value={category.is_active === false ? 0 : (newSubject.weights[category.id] || 0)}
                            onChange={e => {
                              if (category.is_active === false) return; // Prevent editing disabled categories
                              setNewSubject(prev => ({ 
                                ...prev, 
                                weights: { 
                                  ...prev.weights, 
                                  [category.id]: Number(e.target.value) 
                                }
                              }))
                            }}
                            disabled={category.is_active === false}
                            className={category.is_active === false ? 'bg-muted cursor-not-allowed' : ''}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Total Weight:</span>
                        <span className={`text-sm font-bold ${
                          totalWeight === 100 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {totalWeight}%
                        </span>
                      </div>
                      {totalWeight !== 100 && (
                        <p className="text-xs text-red-600 mt-1">
                          Grade weights must total exactly 100%
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleSubmitSubject} 
                  className="flex-1" 
                  disabled={gradeCategoryTypes.length === 0 || totalWeight !== 100}
                >
                  {isEditing ? 'Save Changes' : <><Plus size={16} className="mr-2" /> Add Subject</>}
                </Button>
                <Button variant="outline" onClick={() => { 
                  setIsAddDialogOpen(false); 
                  setIsEditing(false); 
                  setEditingSubjectId(null);
                  setShowGroupDropdown(false);
                  setShowNewGroupInput(false);
                  setNewGroupName('');
                  // Reset form to defaults
                  setNewSubject({
                    name: '',
                    report_card_name: '',
                    weights: getDefaultWeights()
                  });
                  setSelectedGroups([]);
                }}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {subjects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Plus size={48} className="mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No subjects yet</h3>
              <p className="text-muted-foreground mb-4">Add your first subject to get started</p>
              <Button onClick={openAddSubjectDialog}>
                <Plus size={16} className="mr-2" /> Add Subject
              </Button>
            </CardContent>
          </Card>
        ) : (
          subjects.map((subject) => (
            <Card key={subject.id} className="relative group" data-subject-id={subject.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl cursor-pointer select-none" onClick={() => toggleLessons(subject.id)}>
                      {subject.name}
                      <span className="ml-2 text-xs text-muted-foreground">({subject.lesson_count ?? 0} lessons)</span>
                      <span className="ml-2 text-xs">{showLessons(subject.id) ? '▲' : '▼'}</span>
                    </CardTitle>
                    <div className="flex items-center gap-4 mt-1">
                      {subject.group_name && (
                        <div className="flex gap-1 flex-wrap">
                          {subject.group_name.split(',').map((group: string, index: number) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {group.trim()}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Action buttons - shown when lessons are expanded */}
                  {showLessons(subject.id) && (
                    <div className="flex gap-2 mx-4">
                      <Button size="sm" variant="outline" onClick={() => {
                        const lessons = subjectLessons[subject.id] || [];
                        if (lessons.length === 0) {
                          // If no lessons exist, create the first lesson at position 1
                          insertLessonAt(subject.id, 0); // This will create lesson at order_index 1
                          return;
                        }
                        const lastLesson = lessons[lessons.length - 1];
                        insertLessonAt(subject.id, (lastLesson as any).order_index);
                      }}
                      data-action="add-lesson"
                      >
                        <Plus size={14} className="mr-1 text-primary" /> Add Lesson
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => openAddMarkerDialog(subject.id, null)}
                        data-action="add-marker"
                      >
                        📍 Add Marker
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleAutoGenDialog(subject.id)} data-action="add-lessons">
                        Add Lessons
                      </Button>
                    </div>
                  )}
                  
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditSubject(subject.id)}
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
                          <AlertDialogTitle>Delete Subject</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete <strong>{subject.name}</strong>? 
                            This action cannot be undone and will permanently remove the subject and all associated lessons.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleRemoveSubject(subject.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete Subject
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Grade Weights</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(() => {
                      const weightBadges = gradeCategoryTypes
                        .map(category => {
                          // Use the new weights structure from the backend
                          const value = subject.weights?.[category.id];
                          return { 
                            key: category.id, 
                            value: value, 
                            label: category.name 
                          };
                        })
                        .filter(item => item.value && item.value > 0)
                        .map((item) => (
                          <Badge key={item.key} variant="outline" className="capitalize">
                            {item.label}: {Math.round(Number(item.value) * 100)}%
                          </Badge>
                        ));

                      // If no weights are set, show a warning message
                      if (weightBadges.length === 0) {
                        return (
                          <Badge variant="destructive" className="text-sm">
                            Please specify grading weights
                          </Badge>
                        );
                      }
                      
                      return weightBadges;
                    })()}
                  </div>
                </div>
                {showLessons(subject.id) && (
                  <div className="mt-4 max-h-60 overflow-y-auto border rounded bg-muted/30 p-2">
                    {loadingLessons[subject.id] ? (
                      <div className="text-center text-muted-foreground py-4">Loading lessons...</div>
                    ) : (subjectLessons[subject.id]?.length ?? 0) === 0 && (subjectMarkers[subject.id]?.length ?? 0) === 0 ? (
                      <div className="text-center text-muted-foreground py-4">No lessons yet</div>
                    ) : (
                      <ul className="space-y-2">
                        {(() => {
                          const lessons = subjectLessons[subject.id] ?? [];
                          const markers = subjectMarkers[subject.id] ?? [];
                          
                          // Combine and sort lessons and markers by order_index
                          // Use 'itemType' to distinguish between lessons and markers, not 'type' (which is the category name)
                          const combinedItems = [
                            ...lessons.map(item => ({ ...item, itemType: 'lesson' })),
                            ...markers.map(item => ({ ...item, itemType: 'marker' }))
                          ].sort((a, b) => ((a as any).order_index ?? 0) - ((b as any).order_index ?? 0));
                          
                          return combinedItems.map((item: any, idx: number) => {
                            if (item.itemType === 'marker') {
                              // Check if there's a lesson above or below to swap with
                              const prevItem = idx > 0 ? combinedItems[idx - 1] : null;
                              const nextItem = idx < combinedItems.length - 1 ? combinedItems[idx + 1] : null;
                              const canMoveUp = prevItem && prevItem.itemType === 'lesson';
                              const canMoveDown = nextItem && nextItem.itemType === 'lesson';
                              
                              // Render marker
                              return (
                                <li key={`marker-${item.id}`} className="flex items-center gap-2 bg-red-50 border-2 border-red-200 rounded p-2 shadow-sm">
                                  <span className="flex-1 font-bold text-red-800">📍 {item.name}</span>
                                  <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded border font-medium">
                                    Grading Period Marker
                                  </span>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={() => shiftMarker(subject.id, item, 'up')} 
                                    disabled={!canMoveUp}
                                    title="Move marker up"
                                  >
                                    <CaretUp size={14} className={canMoveUp ? "text-red-600" : "text-gray-300"} />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={() => shiftMarker(subject.id, item, 'down')} 
                                    disabled={!canMoveDown}
                                    title="Move marker down"
                                  >
                                    <CaretDown size={14} className={canMoveDown ? "text-red-600" : "text-gray-300"} />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => deleteGradingPeriodMarker(subject.id, item.id)} title="Delete"><Trash size={14} /></Button>
                                </li>
                              );
                            } else {
                              // Render lesson
                              return (
                                <li key={item.id} className="flex items-center gap-2 bg-white rounded p-2 shadow-sm">
                                  <span className="flex-1 font-medium">{item.name}</span>
                                  <span 
                                    className="text-xs px-2 py-1 rounded border text-white font-medium"
                                    style={{ backgroundColor: getCategoryColor(item) }}
                                  >
                                    {item.type}
                                  </span>
                                  <span className="text-xs px-2">{(item as any).points ?? (item as any).maxPoints} pts</span>
                                  <Button size="icon" variant="ghost" onClick={() => insertLessonAt(subject.id, (item as any).order_index)} title="Add a new lesson below this one"><Plus size={14} className="text-primary" /></Button>
                                  <Button size="icon" variant="ghost" onClick={() => editLesson(item as Lesson, subject.id)} title="Edit"><PencilSimple size={14} /></Button>
                                  <Button size="icon" variant="ghost" onClick={() => handleDeleteLesson(subject.id, item.id)} title="Delete"><Trash size={14} /></Button>
                                </li>
                              );
                            }
                          });
                        })()}
      {/* Edit Lesson Dialog */}
      <Dialog open={editLessonDialog.open} onOpenChange={v => { if (!v) closeEditLessonDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Lesson</DialogTitle>
          </DialogHeader>
          {editLessonDialog.lesson && (
            <form key={editLessonDialog.lesson.id} onSubmit={e => { 
              e.preventDefault(); 
              const formData = e.target as any;
              const selectedTypeName = formData.type.value;
              
              // Find the category ID from the name (case-insensitive comparison)
              const selectedCategory = gradeCategoryTypes.find(cat => cat.name.toLowerCase() === selectedTypeName.toLowerCase());
              
              if (!selectedCategory) {
                toast.error('Invalid category selected');
                return;
              }
              
              const updateData = {
                name: formData.name.value,
                categoryId: selectedCategory.id,
                points: Number(formData.points.value),
                maxPoints: Number(formData.points.value)
              };
              
              handleEditLessonSave(updateData); 
            }} className="space-y-4">
              <div>
                <Label htmlFor="edit-lesson-name">Name</Label>
                <Input id="edit-lesson-name" name="name" defaultValue={editLessonDialog.lesson.name} />
              </div>
              <div>
                <Label htmlFor="edit-lesson-type">Type</Label>
                <select id="edit-lesson-type" name="type" defaultValue={editLessonDialog.lesson.type.toLowerCase()} className="w-full border rounded px-2 py-1">
                  {gradeCategoryTypes.map((category) => (
                    <option 
                      key={category.id} 
                      value={category.name.toLowerCase()}
                      disabled={category.is_active === false}
                      style={category.is_active === false ? { color: '#9ca3af' } : undefined}
                    >
                      {category.name}{category.is_active === false ? ' (disabled)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="edit-lesson-points">Points</Label>
                <Input id="edit-lesson-points" name="points" type="number" min={1} max={1000} defaultValue={editLessonDialog.lesson.points ?? editLessonDialog.lesson.maxPoints} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1">Save</Button>
                <Button variant="outline" onClick={closeEditLessonDialog}>Cancel</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
      {/* Add Lesson Dialog */}
      <Dialog open={addLessonDialog.open} onOpenChange={v => { if (!v) closeAddLessonDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Lesson(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="lesson-prefix">Lesson name prefix</Label>
              <Input
                id="lesson-prefix"
                value={lessonPrefix}
                onChange={e => setLessonPrefix(e.target.value)}
                placeholder="Lesson"
              />
            </div>
            <div>
              <Label htmlFor="lesson-type">Lesson type</Label>
              <select
                id="lesson-type"
                value={lessonType}
                onChange={e => setLessonType(e.target.value)}
                className="w-full border rounded px-2 py-1"
              >
                {gradeCategoryTypes.map((category) => (
                  <option 
                    key={category.id} 
                    value={category.name.toLowerCase()}
                    disabled={category.is_active === false}
                    style={category.is_active === false ? { color: '#9ca3af' } : undefined}
                  >
                    {category.name}{category.is_active === false ? ' (disabled)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="lesson-points">Default points</Label>
              <Input
                id="lesson-points"
                type="number"
                min={1}
                max={1000}
                value={lessonPoints}
                onChange={e => setLessonPoints(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="lesson-count">Number of lessons</Label>
              <Input
                id="lesson-count"
                type="number"
                min={1}
                max={200}
                value={lessonCount}
                onChange={e => setLessonCount(Number(e.target.value))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleAddLessonSubmit} className="flex-1">Add</Button>
              <Button variant="outline" onClick={closeAddLessonDialog}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Lesson Replacement Options Dialog */}
      <Dialog open={lessonReplacementDialog.open} onOpenChange={v => { if (!v) closeLessonReplacementDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Lessons</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              This subject already has {lessonReplacementDialog.existingCount} lesson(s). How would you like to proceed?
            </p>
            <div className="space-y-3">
              <div className="p-3 border rounded-lg">
                <h4 className="font-medium text-sm mb-1">Replace All Lessons</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Delete all existing lessons and add {lessonCount} new lesson{lessonCount !== 1 ? 's' : ''} starting from 1.
                </p>
                <Button onClick={handleReplaceLessons} variant="destructive" size="sm" className="w-full">
                  Replace All Lessons
                </Button>
              </div>
              <div className="p-3 border rounded-lg">
                <h4 className="font-medium text-sm mb-1">Continue from Highest Number</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Keep existing lessons and add {lessonCount} new lesson{lessonCount !== 1 ? 's' : ''} continuing from the highest current sequence number.
                </p>
                <Button onClick={handleContinueLessons} variant="default" size="sm" className="w-full">
                  Continue Adding Lessons
                </Button>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={closeLessonReplacementDialog} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Add Marker Dialog */}
      <Dialog open={addMarkerDialog.open} onOpenChange={v => { if (!v) closeAddMarkerDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Grading Period Marker</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Select where to insert the grading period marker:
            </p>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {(() => {
                const lessons = subjectLessons[addMarkerDialog.subjectId || ''] ?? [];
                const markers = subjectMarkers[addMarkerDialog.subjectId || ''] ?? [];
                
                // Combine and sort lessons and markers by orderIndex
                const combinedItems = [
                  ...lessons.map(item => ({ ...item, itemType: 'lesson' })),
                  ...markers.map(item => ({ ...item, itemType: 'marker' }))
                ].sort((a, b) => ((a as any).order_index ?? 0) - ((b as any).order_index ?? 0));
                
                const options = [
                  { label: 'At the beginning', value: 1 },
                  ...combinedItems.map((item: any) => ({
                    label: `After ${item.itemType === 'marker' ? item.name : item.name}`,
                    value: (item.order_index ?? 0) + 1
                  })),
                  { label: 'At the end', value: Math.max(...combinedItems.map((item: any) => item.order_index ?? 0), 0) + 1 }
                ];
                
                return options.map((option, idx) => (
                  <div
                    key={idx}
                    className={`p-3 border rounded cursor-pointer hover:bg-accent ${
                      addMarkerDialog.selectedOptionIdx === idx ? 'bg-accent border-primary' : ''
                    }`}
                    onClick={() => setAddMarkerDialog(prev => ({ ...prev, desiredOrderIndex: option.value, selectedOptionIdx: idx }))}
                  >
                    <div className="font-medium">{option.label}</div>
                  </div>
                ));
              })()}
            </div>
            <div className="flex gap-2 pt-2">
              <Button 
                onClick={() => {
                  if (addMarkerDialog.subjectId && addMarkerDialog.desiredOrderIndex !== null) {
                    insertGradingPeriodMarker(addMarkerDialog.subjectId, addMarkerDialog.desiredOrderIndex);
                    closeAddMarkerDialog();
                  }
                }} 
                className="flex-1"
                disabled={addMarkerDialog.desiredOrderIndex === null}
              >
                Add Marker
              </Button>
              <Button variant="outline" onClick={closeAddMarkerDialog}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default Subjects;
