import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash, UserPlus, Upload, PencilSimple, CaretDown } from "@phosphor-icons/react";
import { toast } from 'sonner';
export default function Students() {
    const [students, setStudents] = useState([]);
    const [filteredStudents, setFilteredStudents] = useState([]);
    const [studentGroups, setStudentGroups] = useState([]);
    const [enrollmentSubjects, setEnrollmentSubjects] = useState([]); // Only for enrollment dialogs
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState(null);
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
    const [isGroupDropdownOpenEdit, setIsGroupDropdownOpenEdit] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [editSelectedGroupIds, setEditSelectedGroupIds] = useState([]);
    const dropdownRef = useRef(null);
    const editDropdownRef = useRef(null);
    const [newStudent, setNewStudent] = useState({
        name: '',
        birthday: '',
        subjects: []
    });
    const formatDateForInput = (value) => {
        if (!value)
            return '';
        const match = value.match(/^\d{4}-\d{2}-\d{2}/);
        return match ? match[0] : '';
    };
    const normalizeStudentBirthdays = (rawStudents) => rawStudents.map(student => ({
        ...student,
        birthday: formatDateForInput(student.birthday)
    }));
    // Helper function to extract grade number from group name for sorting
    const extractGradeNumber = (groupName) => {
        const match = groupName.match(/Grade\s+(\d+)/i);
        return match ? parseInt(match[1], 10) : 999; // Put non-grade groups at the end
    };
    // Helper function to get the first group from a student's group_name
    const getFirstGroup = (groupName) => {
        if (!groupName)
            return 'No Group';
        return groupName.split(',')[0].trim();
    };
    // Helper function to group and sort students by their first group
    const groupAndSortStudents = (students) => {
        // Group students by their first group
        const grouped = students.reduce((acc, student) => {
            const firstGroup = getFirstGroup(student.group_name);
            if (!acc[firstGroup]) {
                acc[firstGroup] = [];
            }
            acc[firstGroup].push(student);
            return acc;
        }, {});
        // Sort groups by grade number, then alphabetically
        const sortedGroupNames = Object.keys(grouped).sort((a, b) => {
            const gradeA = extractGradeNumber(a);
            const gradeB = extractGradeNumber(b);
            // If both are grades, sort numerically
            if (gradeA !== 999 && gradeB !== 999) {
                return gradeA - gradeB;
            }
            // If one is a grade and one isn't, put grade first
            if (gradeA !== 999 && gradeB === 999)
                return -1;
            if (gradeA === 999 && gradeB !== 999)
                return 1;
            // If neither are grades, sort alphabetically
            return a.localeCompare(b);
        });
        // Return sorted groups with their students (also sorted by name)
        return sortedGroupNames.map(groupName => ({
            groupName,
            students: grouped[groupName].sort((a, b) => a.name.localeCompare(b.name))
        }));
    };
    const filterDataByTeacherGroups = useCallback(() => {
        const selectedGroupIds = window.SELECTED_TEACHER_GROUPS;
        // Don't filter if we don't have student groups data yet
        if (studentGroups.length === 0) {
            return;
        }
        if (!selectedGroupIds || selectedGroupIds.length === 0) {
            // If no teacher selected or no groups, show all data
            setFilteredStudents(students);
            return;
        }
        // Filter students by their group membership
        const filtered = students.filter(student => {
            if (!student.group_name)
                return false;
            // Parse student's group names and check if any match selected teacher's groups
            const studentGroupNames = student.group_name.split(',').map(g => g.trim());
            const teacherGroupNames = studentGroups
                .filter(group => selectedGroupIds.includes(group.id))
                .map(group => group.name);
            return studentGroupNames.some(studentGroup => teacherGroupNames.includes(studentGroup));
        });
        setFilteredStudents(filtered);
    }, [students, studentGroups]);
    const fetchData = async () => {
        try {
            const studentsRes = await apiClient.getStudents();
            const studentsData = Array.isArray(studentsRes.data)
                ? studentsRes.data
                : studentsRes.data?.students || [];
            setStudents(normalizeStudentBirthdays(studentsData));
            const groupsRes = await apiClient.getStudentGroups();
            const rawGroups = Array.isArray(groupsRes.data)
                ? groupsRes.data
                : groupsRes.data?.groups || [];
            // Deduplicate groups by ID to prevent React key conflicts
            const uniqueGroups = rawGroups.filter((group, index, self) => index === self.findIndex((g) => g.id === group.id));
            setStudentGroups(uniqueGroups);
        }
        catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to fetch data');
        }
    };
    useEffect(() => {
        fetchData();
        fetchEnrollmentSubjects(); // Fetch subjects on component mount
        // Add click-outside handler for dropdowns
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsGroupDropdownOpen(false);
            }
            if (editDropdownRef.current && !editDropdownRef.current.contains(event.target)) {
                setIsGroupDropdownOpenEdit(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    // Listen for highlight action from other components
    useEffect(() => {
        const handleHighlightAction = (event) => {
            const { action } = event.detail;
            if (action === 'add-student') {
                // Find and highlight the Add Student button
                setTimeout(() => {
                    const addStudentButton = document.querySelector('[data-action="add-student"]');
                    if (addStudentButton) {
                        addStudentButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        addStudentButton.classList.add('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
                        setTimeout(() => {
                            addStudentButton.classList.remove('animate-pulse', 'ring-2', 'ring-blue-500', 'ring-offset-2');
                        }, 3000);
                    }
                }, 200);
            }
        };
        window.addEventListener('gradeflow-students-highlight-action', handleHighlightAction);
        return () => window.removeEventListener('gradeflow-students-highlight-action', handleHighlightAction);
    }, []);
    // Filter data when teacher selection changes or data is updated
    useEffect(() => {
        filterDataByTeacherGroups();
    }, [filterDataByTeacherGroups]);
    // Listen for teacher selection changes
    useEffect(() => {
        const handleTeacherChange = () => {
            filterDataByTeacherGroups();
        };
        window.addEventListener('teacher-selection-changed', handleTeacherChange);
        return () => {
            window.removeEventListener('teacher-selection-changed', handleTeacherChange);
        };
    }, [filterDataByTeacherGroups]);
    const createNewGroup = async () => {
        if (!newGroupName.trim())
            return;
        setIsCreatingGroup(true);
        try {
            const result = await apiClient.createStudentGroup({ name: newGroupName.trim() });
            await fetchData(); // Refresh groups
            // Add the new group to selected groups
            const newGroupId = result.data?.id || result.data?.group?.id;
            if (newGroupId) {
                setSelectedGroupIds(prev => prev.includes(newGroupId) ? prev : [...prev, newGroupId]);
            }
            setNewGroupName('');
            toast.success('Group created successfully');
        }
        catch (error) {
            toast.error('Failed to create group');
            console.error('Error creating group:', error);
        }
        finally {
            setIsCreatingGroup(false);
        }
    };
    // Check if removing a group would affect enrolled subjects
    const checkGroupRemovalWarning = (groupToRemove, student) => {
        if (!student || !groupToRemove)
            return null;
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
            .map(subjectId => enrollmentSubjects.find(s => s.id === subjectId))
            .filter((subject) => subject !== undefined && !remainingSubjectIds.includes(subject.id));
        return affectedSubjects.length > 0 ? affectedSubjects : null;
    };
    const handleGroupDeselection = (group) => {
        if (!editingStudent)
            return;
        const affectedSubjects = checkGroupRemovalWarning(group, editingStudent);
        if (affectedSubjects && affectedSubjects.length > 0) {
            const subjectNames = affectedSubjects.map(s => s.name).join(', ');
            const proceed = window.confirm(`Warning: Removing "${group.name}" will make these enrolled subjects unavailable: ${subjectNames}.\n\n` +
                `The student will be automatically unenrolled from these subjects. Do you want to continue?`);
            if (!proceed) {
                return; // User cancelled, don't remove the group
            }
            // Remove affected subjects from student's enrollment
            const affectedSubjectIds = affectedSubjects.map(s => s.id);
            setNewStudent(prev => ({
                ...prev,
                subjects: prev.subjects.filter(subjectId => !affectedSubjectIds.includes(subjectId))
            }));
        }
        // Proceed with removal
        setEditSelectedGroupIds(prev => prev.filter(id => id !== group.id));
    };
    // Fetch subjects for enrollment dialogs (separate from Subjects component state)
    const fetchEnrollmentSubjects = async () => {
        try {
            const subjectsRes = await apiClient.getSubjects();
            const subjectsData = Array.isArray(subjectsRes.data)
                ? subjectsRes.data
                : subjectsRes.data?.subjects || [];
            setEnrollmentSubjects(subjectsData);
        }
        catch (error) {
            console.error('Error fetching subjects for enrollment:', error);
            setEnrollmentSubjects([]);
        }
    };
    const getAvailableSubjects = (groupNames) => {
        // Always use the full subjects list for student enrollment, regardless of teacher filtering
        return enrollmentSubjects.filter(subject => {
            // If subject has no group restriction, it's available to all
            if (!subject.group_name || !groupNames)
                return true;
            // Parse comma-separated group names
            const studentGroups = groupNames.split(',').map((g) => g.trim().toLowerCase());
            const subjectGroups = subject.group_name.split(',').map((g) => g.trim().toLowerCase());
            // Check if there's any overlap between student groups and subject groups
            return studentGroups.some(studentGroup => subjectGroups.includes(studentGroup));
        });
    };
    const addStudent = async () => {
        if (!newStudent.name.trim()) {
            toast.error("Student name is required");
            return;
        }
        if (selectedGroupIds.length === 0) {
            toast.error("At least one group is required");
            return;
        }
        try {
            const birthday = formatDateForInput(newStudent.birthday);
            const student = {
                name: newStudent.name.trim(),
                birthday: birthday || null,
                groupIds: selectedGroupIds // Send as groupIds for proper junction table handling
            };
            const res = await apiClient.createStudent(student);
            if (res?.error) {
                throw new Error(res.error);
            }
            await fetchData(); // Refresh data
            setNewStudent({ name: '', birthday: '', subjects: [] });
            setSelectedGroupIds([]);
            setIsAddDialogOpen(false);
            toast.success("Student added successfully");
        }
        catch (error) {
            console.error("Error adding student:", error);
            toast.error("Failed to add student");
        }
    };
    const editStudent = (student) => {
        setEditingStudent(student);
        setNewStudent({
            name: student.name,
            birthday: formatDateForInput(student.birthday),
            subjects: [...student.subjects]
        });
        // Set selected groups for editing
        const studentGroupIds = student.group_name
            ? student.group_name.split(',').map(name => {
                const group = studentGroups.find(g => g.name.trim() === name.trim());
                return group?.id;
            }).filter(Boolean)
            : [];
        setEditSelectedGroupIds(studentGroupIds);
        fetchEnrollmentSubjects(); // Fetch subjects when opening edit dialog
        setIsEditDialogOpen(true);
    };
    const updateStudent = async () => {
        if (!newStudent.name.trim() || !editingStudent) {
            toast.error("Student name is required");
            return;
        }
        if (editSelectedGroupIds.length === 0) {
            toast.error("At least one group is required");
            return;
        }
        try {
            const birthday = formatDateForInput(newStudent.birthday);
            const updatedStudent = {
                name: newStudent.name.trim(),
                birthday: birthday || null,
                groupIds: editSelectedGroupIds // Send as groupIds for proper junction table handling
            };
            const updateRes = await apiClient.updateStudent(editingStudent.id, updatedStudent);
            if (updateRes?.error) {
                throw new Error(updateRes.error);
            }
            // Update student subjects (including any that were removed due to group deselection)
            const subjectsRes = await apiClient.updateStudentSubjects(editingStudent.id, { subjects: newStudent.subjects });
            if (subjectsRes?.error) {
                throw new Error(subjectsRes.error);
            }
            await fetchData(); // Refresh data
            setNewStudent({ name: '', birthday: '', subjects: [] });
            setEditSelectedGroupIds([]);
            setEditingStudent(null);
            setIsEditDialogOpen(false);
            toast.success("Student updated successfully");
        }
        catch (error) {
            console.error("Error updating student:", error);
            toast.error("Failed to update student");
        }
    };
    const removeStudent = async (studentId) => {
        try {
            await apiClient.deleteStudent(studentId);
            setStudents(current => current.filter(s => s.id !== studentId));
            toast.success("Student removed successfully");
        }
        catch (error) {
            toast.error("Failed to remove student");
            console.error("Error removing student:", error);
        }
    };
    const toggleSubject = async (studentId, subjectId) => {
        setStudents(current => current.map(student => {
            if (student.id === studentId) {
                console.log('Before update:', student.subjects);
                const updatedSubjects = student.subjects.includes(subjectId)
                    ? student.subjects.filter(id => id !== subjectId)
                    : [...student.subjects, subjectId];
                console.log('After update:', updatedSubjects);
                return { ...student, subjects: updatedSubjects };
            }
            return student;
        }));
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
        }
        catch (error) {
            toast.error("Failed to update subjects");
        }
    };
    const bulkImport = async (event) => {
        const file = event.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const csv = e.target?.result;
                const lines = csv.split('\n').filter(line => line.trim());
                if (lines.length === 0) {
                    toast.error("CSV file is empty");
                    return;
                }
                // Skip header row and parse data
                const studentsData = [];
                const errors = [];
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(v => v.trim());
                    // Validate that all three fields are provided
                    if (values.length < 3) {
                        errors.push(`Row ${i + 1}: Missing required columns. Expected Name, Group, Birthday`);
                        continue;
                    }
                    const name = values[0];
                    const group = values[1];
                    const birthdayStr = values[2];
                    // Check for empty required fields
                    if (!name) {
                        errors.push(`Row ${i + 1}: Name is required`);
                        continue;
                    }
                    if (!group) {
                        errors.push(`Row ${i + 1}: Group is required`);
                        continue;
                    }
                    if (!birthdayStr) {
                        errors.push(`Row ${i + 1}: Birthday is required`);
                        continue;
                    }
                    // Parse and validate birthday
                    let birthday = undefined;
                    if (!birthdayStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        // Try to convert common formats to YYYY-MM-DD
                        const dateAttempt = new Date(birthdayStr);
                        if (!isNaN(dateAttempt.getTime())) {
                            birthday = dateAttempt.toISOString().split('T')[0]; // Convert to YYYY-MM-DD
                        }
                        else {
                            errors.push(`Row ${i + 1}: Invalid birthday format "${birthdayStr}". Expected YYYY-MM-DD`);
                            continue;
                        }
                    }
                    else {
                        birthday = birthdayStr;
                    }
                    studentsData.push({
                        name: name,
                        birthday: birthday,
                        group: group
                    });
                }
                // Show errors if any
                if (errors.length > 0) {
                    toast.error(`CSV validation failed:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more errors` : ''}`);
                    return;
                }
                if (studentsData.length === 0) {
                    toast.error("No valid student data found in CSV");
                    return;
                }
                // Send to backend
                const result = await apiClient.bulkImportStudents({ students: studentsData });
                // Refresh the students list
                await fetchData();
                toast.success(result.data?.message || `Imported ${studentsData.length} students`);
            }
            catch (error) {
                console.error('Import error:', error);
                toast.error(error.response?.data?.error || "Failed to import CSV file");
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-3xl font-bold text-foreground", children: "Students" }), _jsx("p", { className: "text-muted-foreground", children: "Manage your student roster" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(TooltipProvider, { children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(Label, { htmlFor: "csv-upload", className: "cursor-pointer", children: _jsx(Button, { variant: "outline", asChild: true, children: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(Upload, { size: 16 }), "Import CSV"] }) }) }) }), _jsx(TooltipContent, { children: _jsxs("div", { className: "text-sm", children: [_jsx("div", { className: "font-medium mb-1", children: "CSV Format (All Required):" }), _jsxs("div", { className: "text-xs text-muted-foreground", children: [_jsx("div", { children: "Column 1: Name (required)" }), _jsx("div", { children: "Column 2: Group (required)" }), _jsx("div", { children: "Column 3: Birthday (required, YYYY-MM-DD)" })] }), _jsx("div", { className: "mt-2 text-xs text-blue-600", children: "Groups will be created automatically if they don't exist" })] }) })] }) }), _jsx("input", { id: "csv-upload", type: "file", accept: ".csv", className: "hidden", onChange: bulkImport }), _jsxs(Dialog, { open: isAddDialogOpen, onOpenChange: setIsAddDialogOpen, children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { className: "flex items-center gap-2", "data-action": "add-student", children: [_jsx(Plus, { size: 16 }), "Add Student"] }) }), _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Add New Student" }), _jsx(DialogDescription, { children: "Enter student information and select their groups." })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx(Label, { htmlFor: "student-name", children: "Name *" }), _jsx(Input, { id: "student-name", value: newStudent.name, onChange: (e) => setNewStudent(prev => ({ ...prev, name: e.target.value })), placeholder: "Student full name" })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "student-birthday", children: "Birthday" }), _jsx(Input, { id: "student-birthday", type: "date", value: newStudent.birthday, onChange: (e) => setNewStudent(prev => ({ ...prev, birthday: e.target.value })) })] }), _jsxs("div", { children: [_jsx(Label, { children: "Groups *" }), _jsxs("div", { className: "relative", ref: dropdownRef, children: [_jsxs(Button, { type: "button", variant: "outline", onClick: () => setIsGroupDropdownOpen(!isGroupDropdownOpen), className: "w-full justify-between", children: [_jsx("div", { className: "flex flex-wrap gap-1", children: selectedGroupIds.length > 0 ? (selectedGroupIds.map(id => {
                                                                                    const group = studentGroups.find(g => g.id === id);
                                                                                    return group ? (_jsx(Badge, { variant: "secondary", className: "text-xs", children: group.name }, id)) : null;
                                                                                })) : (_jsx("span", { className: "text-muted-foreground", children: "Select groups..." })) }), _jsx(CaretDown, { className: `h-4 w-4 transition-transform ${isGroupDropdownOpen ? 'rotate-180' : ''}` })] }), isGroupDropdownOpen && (_jsx("div", { className: "absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto", children: _jsxs("div", { className: "p-2", children: [studentGroups.map((group) => (_jsxs("div", { className: "flex items-center space-x-2 py-1", children: [_jsx(Checkbox, { id: `group-${group.id}`, checked: selectedGroupIds.includes(group.id), onCheckedChange: (checked) => {
                                                                                                if (checked) {
                                                                                                    setSelectedGroupIds(prev => prev.includes(group.id) ? prev : [...prev, group.id]);
                                                                                                }
                                                                                                else {
                                                                                                    setSelectedGroupIds(prev => prev.filter(id => id !== group.id));
                                                                                                }
                                                                                            } }), _jsx(Label, { htmlFor: `group-${group.id}`, className: "text-sm cursor-pointer", children: group.name })] }, group.id))), _jsx("div", { className: "border-t mt-2 pt-2", children: _jsxs("div", { className: "flex gap-2", children: [_jsx(Input, { placeholder: "New group name", value: newGroupName, onChange: (e) => setNewGroupName(e.target.value), onKeyDown: (e) => {
                                                                                                    if (e.key === 'Enter') {
                                                                                                        e.preventDefault();
                                                                                                        createNewGroup();
                                                                                                    }
                                                                                                } }), _jsx(Button, { type: "button", onClick: createNewGroup, disabled: !newGroupName.trim() || isCreatingGroup, size: "sm", children: isCreatingGroup ? '...' : 'Add' })] }) })] }) }))] })] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsxs(Button, { onClick: addStudent, className: "flex-1", children: [_jsx(UserPlus, { size: 16, className: "mr-2" }), "Add Student"] }), _jsx(Button, { variant: "outline", onClick: () => {
                                                                    setIsAddDialogOpen(false);
                                                                    setSelectedGroupIds([]);
                                                                    setNewStudent({ name: '', birthday: '', subjects: [] });
                                                                }, children: "Cancel" })] })] })] })] }), _jsx(Dialog, { open: isEditDialogOpen, onOpenChange: setIsEditDialogOpen, children: _jsxs(DialogContent, { children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Edit Student" }), _jsx(DialogDescription, { children: "Modify student information and group assignments." })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx(Label, { htmlFor: "edit-student-name", children: "Name *" }), _jsx(Input, { id: "edit-student-name", value: newStudent.name, onChange: (e) => setNewStudent(prev => ({ ...prev, name: e.target.value })), placeholder: "Student full name" })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "edit-student-birthday", children: "Birthday" }), _jsx(Input, { id: "edit-student-birthday", type: "date", value: newStudent.birthday, onChange: (e) => setNewStudent(prev => ({ ...prev, birthday: e.target.value })) })] }), _jsxs("div", { children: [_jsx(Label, { children: "Groups *" }), _jsxs("div", { className: "relative", ref: editDropdownRef, children: [_jsxs(Button, { type: "button", variant: "outline", onClick: () => setIsGroupDropdownOpenEdit(!isGroupDropdownOpenEdit), className: "w-full justify-between", children: [_jsx("div", { className: "flex flex-wrap gap-1", children: editSelectedGroupIds.length > 0 ? (editSelectedGroupIds.map(id => {
                                                                                const group = studentGroups.find(g => g.id === id);
                                                                                return group ? (_jsx(Badge, { variant: "secondary", className: "text-xs", children: group.name }, id)) : null;
                                                                            })) : (_jsx("span", { className: "text-muted-foreground", children: "Select groups..." })) }), _jsx(CaretDown, { className: `h-4 w-4 transition-transform ${isGroupDropdownOpenEdit ? 'rotate-180' : ''}` })] }), isGroupDropdownOpenEdit && (_jsx("div", { className: "absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto", children: _jsxs("div", { className: "p-2", children: [studentGroups.map((group) => (_jsxs("div", { className: "flex items-center space-x-2 py-1", children: [_jsx(Checkbox, { id: `edit-group-${group.id}`, checked: editSelectedGroupIds.includes(group.id), onCheckedChange: (checked) => {
                                                                                            if (checked) {
                                                                                                setEditSelectedGroupIds(prev => prev.includes(group.id) ? prev : [...prev, group.id]);
                                                                                            }
                                                                                            else {
                                                                                                handleGroupDeselection(group);
                                                                                            }
                                                                                        } }), _jsx(Label, { htmlFor: `edit-group-${group.id}`, className: "text-sm cursor-pointer", children: group.name })] }, group.id))), _jsx("div", { className: "border-t mt-2 pt-2", children: _jsxs("div", { className: "flex gap-2", children: [_jsx(Input, { placeholder: "New group name", value: newGroupName, onChange: (e) => setNewGroupName(e.target.value), onKeyDown: (e) => {
                                                                                                if (e.key === 'Enter') {
                                                                                                    e.preventDefault();
                                                                                                    createNewGroup();
                                                                                                }
                                                                                            } }), _jsx(Button, { type: "button", onClick: createNewGroup, disabled: !newGroupName.trim() || isCreatingGroup, size: "sm", children: isCreatingGroup ? '...' : 'Add' })] }) })] }) }))] })] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsxs(Button, { onClick: updateStudent, className: "flex-1", children: [_jsx(PencilSimple, { size: 16, className: "mr-2" }), "Update Student"] }), _jsx(Button, { variant: "outline", onClick: () => {
                                                                setIsEditDialogOpen(false);
                                                                setEditingStudent(null);
                                                                setEditSelectedGroupIds([]);
                                                                setNewStudent({ name: '', birthday: '', subjects: [] });
                                                            }, children: "Cancel" })] })] })] }) })] })] }), filteredStudents.length === 0 ? (_jsx(Card, { children: _jsxs(CardContent, { className: "py-12 text-center", children: [_jsx(UserPlus, { size: 48, className: "mx-auto text-muted-foreground mb-4" }), _jsx("h3", { className: "text-lg font-medium mb-2", children: "No students yet" }), _jsx("p", { className: "text-muted-foreground mb-4", children: "Add your first student to get started" }), _jsxs(Button, { onClick: () => {
                                fetchEnrollmentSubjects(); // Fetch subjects when opening add dialog
                                setIsAddDialogOpen(true);
                            }, children: [_jsx(Plus, { size: 16, className: "mr-2" }), "Add Student"] })] }) })) : (_jsx("div", { className: "space-y-8", children: groupAndSortStudents(filteredStudents).map(({ groupName, students: groupStudents }) => (_jsxs("div", { children: [_jsx("h3", { className: "text-xl font-semibold mb-4 pb-2 border-b", children: groupName }), _jsx("div", { className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3", children: groupStudents.map((student) => (_jsxs(Card, { className: "relative group", children: [_jsx(CardHeader, { className: "pb-3", children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsxs(CardTitle, { className: "text-lg flex items-center gap-2", children: [student.name, student.group_name && (_jsx("div", { className: "flex gap-1", children: student.group_name.split(',').map(group => group.trim()).filter(g => g).map((group, index) => (_jsx(Badge, { variant: "outline", children: group }, `${student.id}-${group}-${index}`))) }))] }), student.birthday && (_jsxs("p", { className: "text-sm text-muted-foreground mt-1", children: ["Birthday: ", student.birthday] }))] }), _jsxs("div", { className: "flex gap-1", children: [_jsx(Button, { variant: "ghost", size: "sm", onClick: () => editStudent(student), children: _jsx(PencilSimple, { size: 16 }) }), _jsxs(AlertDialog, { children: [_jsx(AlertDialogTrigger, { asChild: true, children: _jsx(Button, { variant: "ghost", size: "sm", children: _jsx(Trash, { size: 16, className: "text-destructive" }) }) }), _jsxs(AlertDialogContent, { children: [_jsxs(AlertDialogHeader, { children: [_jsx(AlertDialogTitle, { children: "Delete Student" }), _jsxs(AlertDialogDescription, { children: ["Are you sure you want to delete ", _jsx("strong", { children: student.name }), "? This action cannot be undone and will permanently remove the student and all associated grades."] })] }), _jsxs(AlertDialogFooter, { children: [_jsx(AlertDialogCancel, { children: "Cancel" }), _jsx(AlertDialogAction, { onClick: () => removeStudent(student.id), className: "bg-destructive text-destructive-foreground hover:bg-destructive/90", children: "Delete Student" })] })] })] })] })] }) }), _jsx(CardContent, { children: _jsx("div", { className: "space-y-3", children: _jsxs("div", { children: [_jsxs(Label, { className: "text-sm font-medium", children: ["Subjects (", student.subjects.length, ")"] }), (() => {
                                                        const availableSubjects = getAvailableSubjects(student.group_name);
                                                        if (enrollmentSubjects.length === 0) {
                                                            return _jsx("p", { className: "text-xs text-muted-foreground", children: "Loading subjects..." });
                                                        }
                                                        if (availableSubjects.length === 0) {
                                                            return _jsx("p", { className: "text-xs text-muted-foreground", children: "No subjects available for this group" });
                                                        }
                                                        return (_jsx("div", { className: "flex flex-wrap gap-1 mt-2", children: availableSubjects.map((subject) => {
                                                                const isEnrolled = student.subjects.includes(subject.id);
                                                                return (_jsx(Button, { variant: isEnrolled ? "default" : "outline", size: "sm", onClick: () => toggleSubject(student.id, subject.id), className: "text-xs px-2 py-1 h-7", children: subject.name }, subject.id));
                                                            }) }));
                                                    })()] }) }) })] }, student.id))) })] }, groupName))) }))] }));
}
