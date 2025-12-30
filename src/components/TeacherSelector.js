import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
//import { Button } from "@/components/ui/button"
import { Users } from "lucide-react";
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';
export default function TeacherSelector({ onTeacherChange }) {
    const [teachers, setTeachers] = useState([]);
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        loadTeachers();
        // Listen for teacher updates from Admin/Settings
        const handleTeacherUpdated = () => {
            loadTeachers();
        };
        window.addEventListener('gradeflow-teachers-updated', handleTeacherUpdated);
        return () => {
            window.removeEventListener('gradeflow-teachers-updated', handleTeacherUpdated);
        };
    }, []);
    // Load saved teacher selection on mount
    useEffect(() => {
        const savedTeacherId = localStorage.getItem('selectedTeacherId');
        if (savedTeacherId && teachers.length > 0) {
            if (savedTeacherId === 'admin') {
                // Handle admin selection
                setSelectedTeacher(null);
                onTeacherChange(null);
                window.SELECTED_TEACHER_GROUPS = [];
                window.dispatchEvent(new CustomEvent('teacher-selection-changed'));
            }
            else {
                const teacher = teachers.find((t) => t.id === savedTeacherId);
                if (teacher) {
                    setSelectedTeacher(teacher);
                    onTeacherChange(teacher);
                    window.dispatchEvent(new CustomEvent('teacher-selection-changed'));
                }
            }
        }
    }, [teachers, onTeacherChange]);
    const loadTeachers = async () => {
        try {
            setIsLoading(true);
            const response = await apiClient.getTeachers();
            const teachersData = Array.isArray(response.data?.data) ? response.data.data : [];
            setTeachers(teachersData);
            // Auto-select saved teacher or admin as default if available
            if (teachersData.length > 0) {
                const savedTeacherId = localStorage.getItem('selectedTeacherId');
                if (savedTeacherId === 'admin') {
                    // Admin selection
                    setSelectedTeacher(null);
                    onTeacherChange(null);
                    window.SELECTED_TEACHER_GROUPS = [];
                }
                else if (savedTeacherId && teachersData.find((t) => t.id === savedTeacherId)) {
                    // Valid saved teacher
                    const teacherToSelect = teachersData.find((t) => t.id === savedTeacherId);
                    setSelectedTeacher(teacherToSelect);
                    onTeacherChange(teacherToSelect);
                }
                else {
                    // Default to admin to show all data initially
                    setSelectedTeacher(null);
                    onTeacherChange(null);
                    window.SELECTED_TEACHER_GROUPS = [];
                    localStorage.setItem('selectedTeacherId', 'admin');
                }
                // Dispatch event to notify other components
                window.dispatchEvent(new CustomEvent('teacher-selection-changed'));
            }
        }
        catch (error) {
            console.error('Failed to load teachers:', error);
            toast.error('Failed to load teachers');
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleTeacherSelect = (value) => {
        if (value === 'admin') {
            // Admin selection - show all data unfiltered
            setSelectedTeacher(null);
            onTeacherChange(null);
            // Clear teacher groups to show all data
            window.SELECTED_TEACHER_GROUPS = [];
            localStorage.setItem('selectedTeacherId', 'admin');
        }
        else {
            // Regular teacher selection
            const teacher = teachers.find((t) => t.id === value) || null;
            setSelectedTeacher(teacher);
            onTeacherChange(teacher);
            // Save selection to localStorage
            if (teacher) {
                localStorage.setItem('selectedTeacherId', teacher.id);
            }
            else {
                localStorage.removeItem('selectedTeacherId');
            }
        }
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('teacher-selection-changed'));
    };
    if (isLoading) {
        return (_jsxs("div", { className: "flex items-center gap-2 text-muted-foreground", children: [_jsx(Users, { size: 16 }), _jsx("span", { children: "Loading..." })] }));
    }
    if (teachers.length === 0) {
        return (_jsx("div", { className: "flex items-center gap-2", children: _jsx("span", { className: "text-sm text-muted-foreground", children: "No teachers found" }) }));
    }
    return (_jsx("div", { className: "flex items-center gap-3", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Users, { size: 16, className: "text-muted-foreground" }), _jsxs(Select, { value: selectedTeacher?.id || 'admin', onValueChange: handleTeacherSelect, children: [_jsx(SelectTrigger, { className: "w-[200px]", children: _jsx(SelectValue, { placeholder: "Select teacher..." }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "admin", children: _jsx("span", { className: "font-medium text-blue-600", children: "Admin (All Data)" }) }), teachers.map((teacher) => (_jsx(SelectItem, { value: teacher.id, children: teacher.name }, teacher.id)))] })] })] }) }));
}
