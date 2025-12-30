import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Database, Users, HardDrive, Activity, Download, Upload, RefreshCw, CheckCircle, Calendar, School, Key, UserCheck, Plus, Pencil, Trash2, FileJson, LogOut } from "lucide-react";
import { toast } from 'sonner';
import { apiClient } from '@/lib/api';
export default function SystemAdmin() {
    const [students, setStudents] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [grades, setGrades] = useState([]);
    const [studentGroups, setStudentGroups] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    // Settings state
    const [schoolSettings, setSchoolSettings] = useState({
        schoolName: '',
        firstDayOfSchool: '',
        gradingPeriods: 6,
        autoEnrollSubjects: false
    });
    const [passwordChange, setPasswordChange] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [passwordDialog, setPasswordDialog] = useState(false);
    const [userProfile, setUserProfile] = useState(null);
    // Teachers state
    const [teachers, setTeachers] = useState([]);
    const [teacherDialog, setTeacherDialog] = useState({
        open: false,
        mode: 'add',
        teacher: null
    });
    const [teacherForm, setTeacherForm] = useState({
        name: '',
        email: '',
        password: '',
        selectedGroups: []
    });
    // Student Group Management state
    const [groupDialog, setGroupDialog] = useState({
        open: false,
        mode: 'add',
        group: null
    });
    const [groupForm, setGroupForm] = useState({
        name: '',
        description: ''
    });
    // Grade Category Types state
    const [gradeCategoryTypes, setGradeCategoryTypes] = useState([]);
    const [categoryDialog, setCategoryDialog] = useState({
        open: false,
        mode: 'add',
        category: null
    });
    const [categoryForm, setCategoryForm] = useState({
        name: '',
        description: '',
        color: '#6366f1',
        is_default: false
    });
    // Restore state
    const [restoreDialog, setRestoreDialog] = useState({
        open: false,
        type: 'json'
    });
    const [restoreOptions, setRestoreOptions] = useState({
        mergeData: true,
        updateSettings: false
    });
    const [selectedFile, setSelectedFile] = useState(null);
    const [isRestoring, setIsRestoring] = useState(false);
    useEffect(() => {
        loadSystemStats();
        loadUserProfile();
    }, []);
    // Listen for settings navigation event
    useEffect(() => {
        const handleGotoSettings = () => {
            setActiveTab('settings');
        };
        window.addEventListener('gradeflow-admin-goto-settings', handleGotoSettings);
        return () => {
            window.removeEventListener('gradeflow-admin-goto-settings', handleGotoSettings);
        };
    }, []);
    const loadSystemStats = async () => {
        try {
            setIsLoading(true);
            // Fetch actual data from API
            const studentsRes = await apiClient.getStudents();
            const studentsData = Array.isArray(studentsRes.data) ? studentsRes.data : [];
            setStudents(studentsData);
            const subjectsRes = await apiClient.getSubjects();
            const subjectsData = Array.isArray(subjectsRes.data) ? subjectsRes.data : [];
            setSubjects(subjectsData);
            const gradesRes = await apiClient.getGrades();
            const gradesData = Array.isArray(gradesRes.data) ? gradesRes.data : [];
            setGrades(gradesData);
            // Fetch student groups
            const groupsRes = await apiClient.getStudentGroups();
            const groupsData = Array.isArray(groupsRes.data) ? groupsRes.data : [];
            setStudentGroups(groupsData);
            // Fetch grade category types
            const categoriesRes = await apiClient.getGradeCategoryTypes();
            // Handle nested data structure: response.data.data
            const categoriesData = Array.isArray(categoriesRes.data?.data) ? categoriesRes.data.data :
                Array.isArray(categoriesRes.data) ? categoriesRes.data : [];
            setGradeCategoryTypes(categoriesData);
            // Load settings from Users
            await loadSettings();
            // Load teachers
            const teachersRes = await apiClient.getTeachers();
            const teachersData = Array.isArray(teachersRes.data?.data) ? teachersRes.data.data : [];
            setTeachers(teachersData);
            setLastRefresh(new Date());
        }
        catch (error) {
            console.error('Failed to load system stats:', error);
            toast.error('Failed to load system statistics');
        }
        finally {
            setIsLoading(false);
        }
    };
    const loadUserProfile = async () => {
        try {
            const response = await apiClient.getProfile();
            setUserProfile(response.data);
        }
        catch (error) {
            console.error('Failed to load user profile:', error);
        }
    };
    const loadSettings = async () => {
        try {
            const response = await apiClient.getProfile();
            if (response.data) {
                const user = response.data;
                // Format date for HTML input (YYYY-MM-DD)
                const formattedDate = user.first_day_of_school
                    ? new Date(user.first_day_of_school).toISOString().split('T')[0]
                    : '';
                setSchoolSettings({
                    schoolName: user.school_name || '',
                    firstDayOfSchool: formattedDate,
                    gradingPeriods: user.grading_periods || 6,
                    autoEnrollSubjects: user.auto_enroll_subjects || false
                });
            }
        }
        catch (error) {
            console.error('Failed to load settings:', error);
        }
    };
    const saveSettings = async () => {
        try {
            await apiClient.updateProfile({
                school_name: schoolSettings.schoolName,
                first_day_of_school: schoolSettings.firstDayOfSchool,
                grading_periods: schoolSettings.gradingPeriods,
                auto_enroll_subjects: schoolSettings.autoEnrollSubjects
            });
            toast.success('School settings saved successfully');
        }
        catch (error) {
            console.error('Failed to save settings:', error);
            toast.error('Failed to save settings');
        }
    };
    const openPasswordDialog = () => {
        setPasswordDialog(true);
        setPasswordChange({
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
        });
    };
    const closePasswordDialog = () => {
        setPasswordDialog(false);
        setPasswordChange({
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
        });
    };
    const changePassword = async () => {
        if (passwordChange.newPassword !== passwordChange.confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (passwordChange.newPassword.length < 6) {
            toast.error('Password must be at least 6 characters long');
            return;
        }
        if (!passwordChange.currentPassword) {
            toast.error('Current password is required');
            return;
        }
        try {
            await apiClient.changePassword({
                currentPassword: passwordChange.currentPassword,
                newPassword: passwordChange.newPassword
            });
            toast.success('Password changed successfully');
            closePasswordDialog();
        }
        catch (error) {
            console.error('Failed to change password:', error);
            toast.error('Failed to change password');
        }
    };
    const logout = async () => {
        try {
            await apiClient.logout();
            // Clear local storage and redirect to login
            localStorage.removeItem('authToken');
            window.location.href = '/';
            toast.success('Logged out successfully');
        }
        catch (error) {
            console.error('Logout error:', error);
            // Even if the API call fails, clear local storage and redirect
            localStorage.removeItem('authToken');
            window.location.href = '/';
        }
    };
    // Teachers Management functions
    const openTeacherDialog = (mode, teacher) => {
        setTeacherDialog({ open: true, mode, teacher });
        if (mode === 'edit' && teacher) {
            setTeacherForm({
                name: teacher.name || '',
                email: teacher.email || '',
                password: '',
                selectedGroups: teacher.assigned_groups?.map((g) => g.name) || []
            });
        }
        else {
            setTeacherForm({
                name: '',
                email: '',
                password: '',
                selectedGroups: []
            });
        }
    };
    const closeTeacherDialog = () => {
        setTeacherDialog({ open: false, mode: 'add', teacher: null });
        setTeacherForm({
            name: '',
            email: '',
            password: '',
            selectedGroups: []
        });
    };
    const saveTeacher = async () => {
        if (!teacherForm.name.trim()) {
            toast.error('Teacher name is required');
            return;
        }
        if (!teacherForm.email.trim()) {
            toast.error('Teacher email is required');
            return;
        }
        if (teacherDialog.mode === 'add' && !teacherForm.password.trim()) {
            toast.error('Password is required for new teachers');
            return;
        }
        try {
            if (teacherDialog.mode === 'edit' && teacherDialog.teacher) {
                await apiClient.updateTeacher(teacherDialog.teacher.id, {
                    name: teacherForm.name,
                    email: teacherForm.email,
                    selectedGroups: teacherForm.selectedGroups
                });
                toast.success('Teacher updated successfully');
            }
            else {
                await apiClient.createTeacher({
                    name: teacherForm.name,
                    email: teacherForm.email,
                    password: teacherForm.password,
                    selectedGroups: teacherForm.selectedGroups
                });
                toast.success('Teacher created successfully');
            }
            // Refresh teachers list
            const teachersRes = await apiClient.getTeachers();
            const teachersData = Array.isArray(teachersRes.data?.data) ? teachersRes.data.data : [];
            setTeachers(teachersData);
            // Notify other components that teachers have been updated
            window.dispatchEvent(new CustomEvent('gradeflow-teachers-updated'));
            closeTeacherDialog();
        }
        catch (error) {
            console.error('Failed to save teacher:', error);
            toast.error(`Failed to ${teacherDialog.mode === 'edit' ? 'update' : 'create'} teacher`);
        }
    };
    const deleteTeacher = async (teacher) => {
        if (!window.confirm(`Are you sure you want to delete teacher "${teacher.name}"?`)) {
            return;
        }
        try {
            await apiClient.deleteTeacher(teacher.id);
            toast.success('Teacher deleted successfully');
            // Refresh teachers list
            const teachersRes = await apiClient.getTeachers();
            const teachersData = Array.isArray(teachersRes.data?.data) ? teachersRes.data.data : [];
            setTeachers(teachersData);
            // Notify other components that teachers have been updated
            window.dispatchEvent(new CustomEvent('gradeflow-teachers-updated'));
        }
        catch (error) {
            console.error('Failed to delete teacher:', error);
            toast.error('Failed to delete teacher');
        }
    };
    // Student Group Management functions
    const openGroupDialog = (mode, group) => {
        setGroupDialog({ open: true, mode, group });
        if (mode === 'edit' && group) {
            setGroupForm({
                name: group.name || '',
                description: group.description || ''
            });
        }
        else {
            setGroupForm({ name: '', description: '' });
        }
    };
    const closeGroupDialog = () => {
        setGroupDialog({ open: false, mode: 'add', group: null });
        setGroupForm({ name: '', description: '' });
    };
    const saveStudentGroup = async () => {
        if (!groupForm.name.trim()) {
            toast.error('Group name is required');
            return;
        }
        try {
            const groupData = {
                name: groupForm.name.trim()
            };
            // Only include description if it's not empty
            const description = groupForm.description.trim();
            if (description) {
                groupData.description = description;
            }
            if (groupDialog.mode === 'edit' && groupDialog.group) {
                await apiClient.updateStudentGroup(groupDialog.group.id, groupData);
                toast.success('Student group updated successfully');
            }
            else {
                await apiClient.createStudentGroup(groupData);
                toast.success('Student group created successfully');
            }
            // Refresh student groups
            const groupsRes = await apiClient.getStudentGroups();
            const groupsData = Array.isArray(groupsRes.data) ? groupsRes.data : [];
            setStudentGroups(groupsData);
            closeGroupDialog();
        }
        catch (error) {
            console.error('Failed to save student group:', error);
            toast.error(`Failed to ${groupDialog.mode === 'edit' ? 'update' : 'create'} student group`);
        }
    };
    const deleteStudentGroup = async (group) => {
        // Calculate student count using group_name field (comma-separated names)
        const studentCount = students.filter(student => {
            if (!student.group_name || !group.name)
                return false;
            // Split group_name by comma and check if group.name is included
            const studentGroups = student.group_name.split(',').map(g => g.trim());
            return studentGroups.includes(group.name);
        }).length;
        const confirmMessage = studentCount > 0
            ? `Are you sure you want to delete "${group.name}"? This group has ${studentCount} student(s) assigned to it. The students will not be deleted, but they will be removed from this group.`
            : `Are you sure you want to delete "${group.name}"?`;
        if (!window.confirm(confirmMessage)) {
            return;
        }
        try {
            await apiClient.deleteStudentGroup(group.id);
            toast.success('Student group deleted successfully');
            // Refresh student groups and students
            const [groupsRes, studentsRes] = await Promise.all([
                apiClient.getStudentGroups(),
                apiClient.getStudents()
            ]);
            setStudentGroups(Array.isArray(groupsRes.data) ? groupsRes.data : []);
            setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : []);
        }
        catch (error) {
            console.error('Failed to delete student group:', error);
            toast.error('Failed to delete student group');
        }
    };
    // Grade Category Types Management functions
    // Toggle active status with usage check
    const toggleCategoryActive = async (category) => {
        // If trying to deactivate, check usage first
        if (category.is_active) {
            try {
                const response = await apiClient.checkGradeCategoryTypeUsage(category.id);
                if (response.data && response.data.inUse) {
                    toast.error(`Cannot deactivate "${category.name}" - it is currently used by ${response.data.usageCount} subject weight(s)`);
                    return;
                }
            }
            catch (error) {
                toast.error('Failed to check category usage');
                console.error('Error checking category usage:', error);
                return;
            }
        }
        try {
            const updatedCategory = {
                name: category.name,
                description: category.description,
                color: category.color,
                is_active: !category.is_active,
                is_default: category.is_default
            };
            const response = await apiClient.updateGradeCategoryType(category.id, updatedCategory);
            if (response.data) {
                setGradeCategoryTypes(prev => prev.map(cat => cat.id === category.id ? { ...cat, is_active: !category.is_active } : cat));
                toast.success(`Category "${category.name}" ${!category.is_active ? 'activated' : 'deactivated'}`);
            }
        }
        catch (error) {
            toast.error('Failed to update category status');
            console.error('Error toggling category active status:', error);
        }
    };
    const openCategoryDialog = (mode, category) => {
        setCategoryDialog({ open: true, mode, category });
        if (mode === 'edit' && category) {
            setCategoryForm({
                name: category.name || '',
                description: category.description || '',
                color: category.color || '#6366f1',
                is_default: category.is_default || false
            });
        }
        else {
            setCategoryForm({
                name: '',
                description: '',
                color: '#6366f1',
                is_default: false
            });
        }
    };
    const closeCategoryDialog = () => {
        setCategoryDialog({ open: false, mode: 'add', category: null });
        setCategoryForm({
            name: '',
            description: '',
            color: '#6366f1',
            is_default: false
        });
    };
    const saveCategory = async () => {
        if (!categoryForm.name.trim()) {
            toast.error('Category name is required');
            return;
        }
        try {
            const categoryData = {
                name: categoryForm.name.trim(),
                description: categoryForm.description.trim(),
                color: categoryForm.color,
                is_active: categoryDialog.mode === 'edit' && categoryDialog.category ? categoryDialog.category.is_active : true,
                is_default: categoryForm.is_default
            };
            if (categoryDialog.mode === 'edit' && categoryDialog.category) {
                await apiClient.updateGradeCategoryType(categoryDialog.category.id, categoryData);
                toast.success('Grade category updated successfully');
            }
            else {
                await apiClient.createGradeCategoryType(categoryData);
                toast.success('Grade category created successfully');
            }
            // Refresh categories
            const categoriesRes = await apiClient.getGradeCategoryTypes();
            const categoriesData = Array.isArray(categoriesRes.data?.data) ? categoriesRes.data.data :
                Array.isArray(categoriesRes.data) ? categoriesRes.data : [];
            setGradeCategoryTypes(categoriesData);
            closeCategoryDialog();
        }
        catch (error) {
            console.error('Failed to save grade category:', error);
            toast.error(`Failed to ${categoryDialog.mode === 'edit' ? 'update' : 'create'} grade category`);
        }
    };
    const deleteCategory = async (category) => {
        const confirmMessage = `Are you sure you want to delete "${category.name}"? This may affect existing lessons that use this category type.`;
        if (!window.confirm(confirmMessage)) {
            return;
        }
        try {
            await apiClient.deleteGradeCategoryType(category.id);
            toast.success('Grade category deleted successfully');
            // Remove from local state
            setGradeCategoryTypes(prev => prev.filter(c => c.id !== category.id));
        }
        catch (error) {
            console.error('Failed to delete grade category:', error);
            toast.error('Failed to delete grade category');
        }
    };
    const refreshStats = () => {
        loadSystemStats();
    };
    const exportData = async () => {
        try {
            // Get user profile for school settings
            const profileRes = await apiClient.getProfile();
            const userProfile = profileRes.data || {};
            // Get lessons for all subjects
            const lessonsData = [];
            for (const subject of subjects) {
                try {
                    const lessonsRes = await apiClient.getLessonsForSubject(subject.id);
                    const lessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
                    lessonsData.push(...lessons.map(lesson => ({ ...lesson, subjectId: subject.id })));
                }
                catch (error) {
                    console.warn(`Failed to load lessons for subject ${subject.name}:`, error);
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
                    gradingPeriods: userProfile.grading_periods || schoolSettings.gradingPeriods,
                    autoEnrollSubjects: userProfile.auto_enroll_subjects || schoolSettings.autoEnrollSubjects
                },
                // Export metadata
                exportedAt: new Date().toISOString(),
                exportedBy: userProfile.email || 'Unknown',
                version: '1.0'
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gradeflow-complete-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success(`Exported complete backup with ${students.length} students, ${subjects.length} subjects, ${grades.length} grades, ${lessonsData.length} lessons, ${gradeCategoryTypes.length} categories, and ${studentGroups.length} groups`);
        }
        catch (error) {
            console.error('Export failed:', error);
            toast.error('Failed to export data');
        }
    };
    // Restore functions
    const openRestoreDialog = () => {
        setRestoreDialog({ open: true, type: 'json' });
        setSelectedFile(null);
    };
    const closeRestoreDialog = () => {
        setRestoreDialog({ open: false, type: 'json' });
        setSelectedFile(null);
        setIsRestoring(false);
    };
    const handleFileSelect = (event) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };
    const performRestore = async () => {
        if (!selectedFile) {
            toast.error('Please select a backup file');
            return;
        }
        setIsRestoring(true);
        try {
            const result = await apiClient.restoreFromJSON(selectedFile, restoreOptions);
            toast.success(`Restored: ${result.restored.students} students, ${result.restored.subjects} subjects, ${result.restored.grades} grades, ${result.restored.lessons} lessons`);
            closeRestoreDialog();
            // Refresh data
            loadSystemStats();
        }
        catch (error) {
            console.error('Restore failed:', error);
            toast.error(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        finally {
            setIsRestoring(false);
        }
    };
    const formatBytes = (bytes) => {
        if (bytes === 0)
            return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    // Calculate storage size estimate
    const getStorageSize = () => {
        const dataSize = JSON.stringify({ students, subjects, grades }).length;
        return dataSize * 2; // Rough estimate including metadata
    };
    // Calculate grades entered today (last 24 hours from now)
    const getGradesToday = () => {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return grades.filter(grade => {
            if (!grade.created_at)
                return false;
            const gradeTime = new Date(grade.created_at);
            // Only count grades created in the last 24 hours
            return gradeTime >= twentyFourHoursAgo && gradeTime <= now;
        }).length;
    };
    // Get system statistics
    const stats = {
        gradesToday: getGradesToday(),
        totalStudents: students.length,
        totalSubjects: subjects.length,
        totalGrades: grades.length,
        storageSize: getStorageSize()
    };
    if (isLoading) {
        return (_jsx("div", { className: "flex items-center justify-center p-8", children: _jsxs("div", { className: "flex items-center gap-2 text-muted-foreground", children: [_jsx(RefreshCw, { className: "animate-spin", size: 20 }), "Loading system statistics..."] }) }));
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-3xl font-bold text-foreground", children: "System Administration" }), _jsx("p", { className: "text-muted-foreground", children: "Monitor and manage your GradeFlow data" })] }), _jsxs(Button, { onClick: refreshStats, variant: "outline", className: "flex items-center gap-2", children: [_jsx(RefreshCw, { size: 16 }), "Refresh"] })] }), _jsxs(Tabs, { value: activeTab, onValueChange: setActiveTab, className: "space-y-6", children: [_jsxs(TabsList, { children: [_jsx(TabsTrigger, { value: "overview", children: "Overview" }), _jsx(TabsTrigger, { value: "settings", children: "Settings" }), _jsx(TabsTrigger, { value: "teachers", children: "Teachers" }), _jsx(TabsTrigger, { value: "backups", children: "Backups" })] }), _jsxs(TabsContent, { value: "overview", className: "space-y-6", children: [_jsxs("div", { className: "grid gap-6 md:grid-cols-2 lg:grid-cols-4", children: [_jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium", children: "Recent Grades" }), _jsx(Activity, { className: "h-4 w-4 text-muted-foreground" })] }), _jsxs(CardContent, { children: [_jsx("div", { className: "text-2xl font-bold", children: stats?.gradesToday || 0 }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Last 24 hours" })] })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium", children: "Total Students" }), _jsx(Users, { className: "h-4 w-4 text-muted-foreground" })] }), _jsxs(CardContent, { children: [_jsx("div", { className: "text-2xl font-bold", children: stats?.totalStudents || 0 }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Across all teachers" })] })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium", children: "Total Grades" }), _jsx(Activity, { className: "h-4 w-4 text-muted-foreground" })] }), _jsxs(CardContent, { children: [_jsx("div", { className: "text-2xl font-bold", children: stats?.totalGrades || 0 }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Grade entries recorded" })] })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium", children: "Storage Used" }), _jsx(HardDrive, { className: "h-4 w-4 text-muted-foreground" })] }), _jsxs(CardContent, { children: [_jsx("div", { className: "text-2xl font-bold", children: formatBytes(stats?.storageSize || 0) }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Estimated usage" })] })] })] }), _jsxs("div", { className: "grid gap-6 md:grid-cols-2", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "System Health" }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-sm font-medium", children: "Data Integrity" }), _jsxs(Badge, { variant: "default", className: "bg-green-100 text-green-800", children: [_jsx(CheckCircle, { size: 12, className: "mr-1" }), "Healthy"] })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-sm font-medium", children: "Storage Efficiency" }), _jsxs(Badge, { variant: "default", className: "bg-blue-100 text-blue-800", children: [_jsx(Database, { size: 12, className: "mr-1" }), "Optimized"] })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-sm font-medium", children: "Cache Performance" }), _jsxs(Badge, { variant: "default", className: "bg-purple-100 text-purple-800", children: [_jsx(Activity, { size: 12, className: "mr-1" }), "Active"] })] })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "Quick Actions" }) }), _jsxs(CardContent, { className: "space-y-2", children: [_jsxs(Button, { onClick: exportData, className: "w-full justify-start", variant: "outline", children: [_jsx(Download, { size: 16, className: "mr-2" }), "Export Data"] }), _jsxs(Button, { onClick: refreshStats, className: "w-full justify-start", variant: "outline", children: [_jsx(RefreshCw, { size: 16, className: "mr-2" }), "Refresh Stats"] })] })] })] })] }), _jsxs(TabsContent, { value: "settings", className: "space-y-6", children: [_jsxs("div", { className: "grid gap-6 md:grid-cols-2", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(School, { size: 20 }), "School Information"] }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "schoolName", children: "School Name" }), _jsx(Input, { id: "schoolName", name: "school-name", autoComplete: "organization", value: schoolSettings.schoolName, onChange: (e) => setSchoolSettings(prev => ({ ...prev, schoolName: e.target.value })), placeholder: "Enter school name" })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs(Label, { htmlFor: "firstDay", className: "flex items-center gap-2", children: [_jsx(Calendar, { size: 16 }), "First Day of School"] }), _jsx(Input, { id: "firstDay", type: "date", value: schoolSettings.firstDayOfSchool, onChange: (e) => setSchoolSettings(prev => ({ ...prev, firstDayOfSchool: e.target.value })) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "gradingPeriods", children: "Number of Grading Periods" }), _jsxs(Select, { value: schoolSettings.gradingPeriods.toString(), onValueChange: (value) => setSchoolSettings(prev => ({ ...prev, gradingPeriods: parseInt(value) })), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, {}) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "3", children: "3 Periods (Trimester)" }), _jsx(SelectItem, { value: "4", children: "4 Periods (Quarter)" }), _jsx(SelectItem, { value: "6", children: "6 Periods (Six Weeks)" })] })] })] }), _jsxs("div", { className: "space-y-3", children: [_jsx(Label, { className: "text-sm font-medium", children: "Auto-Enrollment Settings" }), _jsx("div", { className: "flex items-center space-x-3 p-3 bg-muted/30 rounded-lg", children: _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("input", { type: "checkbox", id: "autoEnrollSubjects", checked: schoolSettings.autoEnrollSubjects, onChange: (e) => setSchoolSettings(prev => ({ ...prev, autoEnrollSubjects: e.target.checked })), className: "h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded" }), _jsx(Label, { htmlFor: "autoEnrollSubjects", className: "text-sm", children: "Auto-enroll students in subjects based on their groups" })] }) }), _jsx("p", { className: "text-xs text-muted-foreground", children: "When enabled, new subjects will automatically be assigned to students who belong to the same group as the subject. Similarly, new students will be automatically enrolled in subjects assigned to their group." })] }), _jsx(Button, { onClick: saveSettings, className: "w-full", children: "Save School Settings" })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(UserCheck, { size: 20 }), "Account Information"] }) }), _jsxs(CardContent, { className: "space-y-4", children: [userProfile && (_jsxs("div", { className: "p-3 bg-muted/30 rounded-lg", children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [_jsx("div", { className: "w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center", children: _jsx("span", { className: "text-primary font-medium", children: userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'U' }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "font-medium text-sm truncate", children: userProfile.name || 'Unknown User' }), _jsx("p", { className: "text-xs text-muted-foreground truncate", children: userProfile.email || 'No email' })] })] }), userProfile.created_at && (_jsxs("p", { className: "text-xs text-muted-foreground", children: ["Member since: ", new Date(userProfile.created_at).toLocaleDateString()] }))] })), _jsxs("div", { className: "space-y-2", children: [_jsxs(Button, { onClick: openPasswordDialog, variant: "outline", className: "w-full justify-start", children: [_jsx(Key, { size: 16, className: "mr-2" }), "Change Password"] }), _jsxs(Button, { onClick: logout, variant: "outline", className: "w-full justify-start text-destructive hover:text-destructive", children: [_jsx(LogOut, { size: 16, className: "mr-2" }), "Logout"] })] })] })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(UserCheck, { size: 20 }), "Student Groups"] }), _jsxs(Button, { onClick: () => openGroupDialog('add'), size: "sm", children: [_jsx(Plus, { size: 16, className: "mr-2" }), "Add Group"] })] }) }), _jsx(CardContent, { children: studentGroups.length === 0 ? (_jsxs("div", { className: "text-center py-8 text-muted-foreground", children: [_jsx(UserCheck, { size: 48, className: "mx-auto mb-4 opacity-50" }), _jsx("p", { children: "No student groups found" }), _jsx("p", { className: "text-sm mb-4", children: "Create groups to organize your students" }), _jsxs(Button, { onClick: () => openGroupDialog('add'), variant: "outline", children: [_jsx(Plus, { size: 16, className: "mr-2" }), "Create First Group"] })] })) : (_jsx("div", { className: "grid gap-3 md:grid-cols-2 lg:grid-cols-3", children: studentGroups.map((group, index) => {
                                                // Calculate student count using group_name field (comma-separated names)
                                                const studentCount = students.filter(student => {
                                                    if (!student.group_name || !group.name)
                                                        return false;
                                                    // Split group_name by comma and check if group.name is included
                                                    const studentGroups = student.group_name.split(',').map(g => g.trim());
                                                    return studentGroups.includes(group.name);
                                                }).length;
                                                return (_jsxs("div", { className: "p-4 bg-muted/30 rounded-lg border", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("h4", { className: "font-medium", children: group.name || `Group ${index + 1}` }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsxs(Badge, { variant: "outline", children: [studentCount, " students"] }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => openGroupDialog('edit', group), className: "h-8 w-8", title: "Edit Group", children: _jsx(Pencil, { size: 14 }) }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => deleteStudentGroup(group), className: "h-8 w-8 text-destructive hover:text-destructive", title: "Delete Group", children: _jsx(Trash2, { size: 14 }) })] })] }), group.description && (_jsx("p", { className: "text-sm text-muted-foreground mb-2", children: group.description })), _jsx("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: _jsxs("span", { children: ["Created: ", group.created_at ? new Date(group.created_at).toLocaleDateString() : 'Unknown'] }) })] }, group.id || index));
                                            }) })) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Activity, { size: 20 }), "Grade Category Types"] }), _jsxs(Button, { onClick: () => openCategoryDialog('add'), size: "sm", children: [_jsx(Plus, { size: 16, className: "mr-2" }), "Add Category"] })] }) }), _jsx(CardContent, { children: gradeCategoryTypes.length === 0 ? (_jsxs("div", { className: "text-center py-8 text-muted-foreground", children: [_jsx(Activity, { size: 48, className: "mx-auto mb-4 opacity-50" }), _jsx("p", { children: "No grade category types found" }), _jsx("p", { className: "text-sm mb-4", children: "Manage the types of grading categories available for lessons" }), _jsxs(Button, { onClick: () => openCategoryDialog('add'), variant: "outline", children: [_jsx(Plus, { size: 16, className: "mr-2" }), "Create First Category"] })] })) : (_jsx("div", { className: "grid gap-3 md:grid-cols-2 lg:grid-cols-3", children: gradeCategoryTypes.map((category, index) => (_jsxs("div", { className: "p-4 bg-muted/30 rounded-lg border", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-4 h-4 rounded-full border-2 border-gray-300", style: { backgroundColor: category.color || '#6366f1' }, title: `Color: ${category.color || '#6366f1'}` }), _jsx("h4", { className: "font-medium", children: category.name || `Category ${index + 1}` })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Label, { htmlFor: `active-${category.id}`, className: "text-sm", children: "Active" }), _jsx(Switch, { id: `active-${category.id}`, checked: category.is_active !== undefined ? category.is_active : true, onCheckedChange: () => toggleCategoryActive(category) })] }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => openCategoryDialog('edit', category), className: "h-8 w-8", title: "Edit Category", children: _jsx(Pencil, { size: 14 }) }), _jsx(Button, { size: "icon", variant: "ghost", onClick: () => deleteCategory(category), className: "h-8 w-8 text-destructive hover:text-destructive", title: "Delete Category", children: _jsx(Trash2, { size: 14 }) })] })] }), category.description && (_jsx("p", { className: "text-sm text-muted-foreground mb-2", children: category.description })), _jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [_jsxs("span", { children: ["Color: ", category.color || '#6366f1'] }), category.is_default && _jsx(Badge, { variant: "secondary", className: "text-xs", children: "Default" })] })] }, category.id || index))) })) })] })] }), _jsxs(TabsContent, { value: "teachers", className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-lg font-semibold", children: "Teacher Management" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Manage teacher accounts and assign student groups" })] }), _jsxs(Button, { onClick: () => openTeacherDialog('add'), className: "flex items-center gap-2", children: [_jsx(Plus, { size: 16 }), "Add Teacher"] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx("div", { className: "flex items-center justify-between", children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Users, { size: 20 }), "Teachers (", teachers.length, ")"] }) }) }), _jsx(CardContent, { children: teachers.length === 0 ? (_jsxs("div", { className: "text-center py-12 text-muted-foreground", children: [_jsx(Users, { size: 48, className: "mx-auto mb-4 opacity-50" }), _jsx("p", { className: "text-lg mb-2", children: "No teachers found" }), _jsx("p", { className: "text-sm mb-4", children: "Add teachers to help manage different student groups and subjects" }), _jsxs(Button, { onClick: () => openTeacherDialog('add'), variant: "outline", children: [_jsx(Plus, { size: 16, className: "mr-2" }), "Add First Teacher"] })] })) : (_jsx("div", { className: "space-y-4", children: teachers.map((teacher, index) => (_jsxs("div", { className: "flex items-center justify-between p-4 bg-muted/30 rounded-lg border", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center", children: _jsx("span", { className: "text-primary font-medium", children: teacher.name ? teacher.name.charAt(0).toUpperCase() : 'T' }) }), _jsxs("div", { children: [_jsx("h4", { className: "font-medium", children: teacher.name }), _jsx("p", { className: "text-sm text-muted-foreground", children: teacher.email }), _jsx("div", { className: "flex flex-wrap gap-1 mt-1", children: teacher.assigned_groups?.length > 0 ? teacher.assigned_groups.map((group, idx) => (_jsx(Badge, { variant: "outline", className: "text-xs", children: group.name }, idx))) : _jsx("span", { className: "text-xs text-muted-foreground", children: "No groups assigned" }) })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { size: "sm", variant: "ghost", onClick: () => openTeacherDialog('edit', teacher), title: "Edit Teacher", children: _jsx(Pencil, { size: 16 }) }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => deleteTeacher(teacher), className: "text-destructive hover:text-destructive", title: "Delete Teacher", children: _jsx(Trash2, { size: 16 }) })] })] }, teacher.id || index))) })) })] })] }), _jsxs(TabsContent, { value: "backups", className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "text-lg font-semibold", children: "Data Management" }), _jsxs(Button, { onClick: exportData, className: "flex items-center gap-2", children: [_jsx(Download, { size: 16 }), "Export User Data"] })] }), _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(FileJson, { size: 20 }), "User Data Export (JSON)"] }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Export your personal data for backup or migration" })] }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "grid gap-4 grid-cols-3 mb-4", children: [_jsxs("div", { className: "text-center p-3 bg-muted/30 rounded-lg", children: [_jsx("div", { className: "text-lg font-bold text-blue-600", children: students.length }), _jsx("div", { className: "text-xs text-muted-foreground", children: "Students" })] }), _jsxs("div", { className: "text-center p-3 bg-muted/30 rounded-lg", children: [_jsx("div", { className: "text-lg font-bold text-green-600", children: subjects.length }), _jsx("div", { className: "text-xs text-muted-foreground", children: "Subjects" })] }), _jsxs("div", { className: "text-center p-3 bg-muted/30 rounded-lg", children: [_jsx("div", { className: "text-lg font-bold text-purple-600", children: grades.length }), _jsx("div", { className: "text-xs text-muted-foreground", children: "Grades" })] })] }), _jsxs("div", { className: "p-4 bg-blue-50 border border-blue-200 rounded-lg", children: [_jsx("h4", { className: "font-medium text-blue-900 mb-2", children: "Export Format" }), _jsx("p", { className: "text-sm text-blue-700 mb-3", children: "Data will be exported as a JSON file containing all your students, subjects, lessons, grades, categories, and groups." }), _jsxs("div", { className: "flex gap-2", children: [_jsxs(Button, { onClick: exportData, className: "flex items-center gap-2", children: [_jsx(Download, { size: 16 }), "Export Data"] }), _jsxs(Button, { onClick: () => openRestoreDialog(), variant: "outline", className: "flex items-center gap-2", children: [_jsx(Upload, { size: 16 }), "Restore from JSON"] })] })] }), lastRefresh && (_jsxs("p", { className: "text-xs text-muted-foreground text-center mt-4", children: ["Data last refreshed: ", lastRefresh.toLocaleString()] }))] })] })] })] }), _jsx(Dialog, { open: groupDialog.open, onOpenChange: (open) => !open && closeGroupDialog(), children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: groupDialog.mode === 'edit' ? 'Edit Student Group' : 'Add Student Group' }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "group-name", children: "Group Name *" }), _jsx(Input, { id: "group-name", value: groupForm.name, onChange: (e) => setGroupForm(prev => ({ ...prev, name: e.target.value })), placeholder: "Enter group name" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "group-description", children: "Description" }), _jsx(Textarea, { id: "group-description", value: groupForm.description, onChange: (e) => setGroupForm(prev => ({ ...prev, description: e.target.value })), placeholder: "Enter group description (optional)", rows: 3 })] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsx(Button, { onClick: saveStudentGroup, className: "flex-1", disabled: !groupForm.name.trim(), children: groupDialog.mode === 'edit' ? 'Save Changes' : 'Create Group' }), _jsx(Button, { variant: "outline", onClick: closeGroupDialog, children: "Cancel" })] })] })] }) }), _jsx(Dialog, { open: categoryDialog.open, onOpenChange: (open) => !open && closeCategoryDialog(), children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: categoryDialog.mode === 'edit' ? 'Edit Grade Category Type' : 'Add Grade Category Type' }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "category-name", children: "Category Name *" }), _jsx(Input, { id: "category-name", value: categoryForm.name, onChange: (e) => setCategoryForm(prev => ({ ...prev, name: e.target.value })), placeholder: "e.g. Lesson, Quiz, Test, Project" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "category-description", children: "Description" }), _jsx(Textarea, { id: "category-description", value: categoryForm.description, onChange: (e) => setCategoryForm(prev => ({ ...prev, description: e.target.value })), placeholder: "Brief description of this category type", rows: 3 })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "category-color", children: "Color" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Input, { id: "category-color", type: "color", value: categoryForm.color, onChange: (e) => setCategoryForm(prev => ({ ...prev, color: e.target.value })), className: "w-16 h-10 p-1 rounded border" }), _jsx(Input, { type: "text", value: categoryForm.color, onChange: (e) => setCategoryForm(prev => ({ ...prev, color: e.target.value })), placeholder: "#6366f1", className: "flex-1" })] })] }), _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Switch, { id: "category-default", checked: categoryForm.is_default, onCheckedChange: (checked) => setCategoryForm(prev => ({ ...prev, is_default: checked })) }), _jsx(Label, { htmlFor: "category-default", className: "text-sm font-medium", children: "Default type (no special styling in grade entry)" })] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsx(Button, { onClick: saveCategory, className: "flex-1", disabled: !categoryForm.name.trim(), children: categoryDialog.mode === 'edit' ? 'Save Changes' : 'Create Category' }), _jsx(Button, { variant: "outline", onClick: closeCategoryDialog, children: "Cancel" })] })] })] }) }), _jsx(Dialog, { open: restoreDialog.open, onOpenChange: (open) => !open && closeRestoreDialog(), children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Restore Data from JSON Backup" }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "restore-file", children: "Select Backup File" }), _jsx(Input, { id: "restore-file", type: "file", accept: ".json", onChange: handleFileSelect }), selectedFile && (_jsxs("p", { className: "text-sm text-muted-foreground", children: ["Selected: ", selectedFile.name, " (", (selectedFile.size / 1024).toFixed(1), " KB)"] }))] }), _jsxs("div", { className: "space-y-3 p-4 bg-muted/30 rounded-lg", children: [_jsx("h4", { className: "font-medium", children: "Restore Options" }), _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Switch, { id: "merge-data", checked: restoreOptions.mergeData, onCheckedChange: (checked) => setRestoreOptions(prev => ({ ...prev, mergeData: checked })) }), _jsx(Label, { htmlFor: "merge-data", className: "text-sm", children: "Merge with existing data (skip duplicates)" })] }), _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Switch, { id: "update-settings", checked: restoreOptions.updateSettings, onCheckedChange: (checked) => setRestoreOptions(prev => ({ ...prev, updateSettings: checked })) }), _jsx(Label, { htmlFor: "update-settings", className: "text-sm", children: "Update school settings" })] })] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsx(Button, { onClick: performRestore, className: "flex-1", disabled: !selectedFile || isRestoring, children: isRestoring ? 'Restoring...' : 'Restore from JSON' }), _jsx(Button, { variant: "outline", onClick: closeRestoreDialog, disabled: isRestoring, children: "Cancel" })] })] })] }) }), _jsx(Dialog, { open: passwordDialog, onOpenChange: (open) => !open && closePasswordDialog(), children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { className: "flex items-center gap-2", children: [_jsx(Key, { size: 20 }), "Change Password"] }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "current-password", children: "Current Password" }), _jsx(Input, { id: "current-password", type: "password", value: passwordChange.currentPassword, onChange: (e) => setPasswordChange(prev => ({ ...prev, currentPassword: e.target.value })), placeholder: "Enter current password" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "new-password", children: "New Password" }), _jsx(Input, { id: "new-password", type: "password", value: passwordChange.newPassword, onChange: (e) => setPasswordChange(prev => ({ ...prev, newPassword: e.target.value })), placeholder: "Enter new password" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "confirm-new-password", children: "Confirm New Password" }), _jsx(Input, { id: "confirm-new-password", type: "password", value: passwordChange.confirmPassword, onChange: (e) => setPasswordChange(prev => ({ ...prev, confirmPassword: e.target.value })), placeholder: "Confirm new password" })] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsx(Button, { onClick: changePassword, className: "flex-1", disabled: !passwordChange.currentPassword || !passwordChange.newPassword || !passwordChange.confirmPassword, children: "Change Password" }), _jsx(Button, { variant: "outline", onClick: closePasswordDialog, children: "Cancel" })] })] })] }) }), _jsx(Dialog, { open: teacherDialog.open, onOpenChange: (open) => !open && closeTeacherDialog(), children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: teacherDialog.mode === 'edit' ? 'Edit Teacher' : 'Add Teacher' }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "teacher-name", children: "Teacher Name *" }), _jsx(Input, { id: "teacher-name", name: "teacher-name", autoComplete: "name", value: teacherForm.name, onChange: (e) => setTeacherForm(prev => ({ ...prev, name: e.target.value })), placeholder: "Enter teacher's full name" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "teacher-email", children: "Email Address *" }), _jsx(Input, { id: "teacher-email", name: "teacher-email", type: "email", autoComplete: "email", value: teacherForm.email, onChange: (e) => setTeacherForm(prev => ({ ...prev, email: e.target.value })), placeholder: "teacher@school.edu" })] }), teacherDialog.mode === 'add' && (_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "teacher-password", children: "Password *" }), _jsx(Input, { id: "teacher-password", name: "teacher-password", type: "password", autoComplete: "new-password", value: teacherForm.password, onChange: (e) => setTeacherForm(prev => ({ ...prev, password: e.target.value })), placeholder: "Enter initial password" })] })), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Assigned Student Groups" }), _jsx("div", { className: "max-h-32 overflow-y-auto border rounded p-2 space-y-2", children: studentGroups.length === 0 ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "No student groups available" })) : (studentGroups.map((group) => (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("input", { type: "checkbox", id: `group-${group.id}`, checked: teacherForm.selectedGroups.includes(group.name), onChange: (e) => {
                                                            const groupName = group.name;
                                                            setTeacherForm(prev => ({
                                                                ...prev,
                                                                selectedGroups: e.target.checked
                                                                    ? [...prev.selectedGroups, groupName]
                                                                    : prev.selectedGroups.filter(g => g !== groupName)
                                                            }));
                                                        }, className: "rounded" }), _jsxs(Label, { htmlFor: `group-${group.id}`, className: "text-sm font-normal cursor-pointer flex-1", children: [group.name, group.description && (_jsxs("span", { className: "text-muted-foreground ml-2", children: ["- ", group.description] }))] })] }, group.id)))) })] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsx(Button, { onClick: saveTeacher, className: "flex-1", disabled: !teacherForm.name.trim() || !teacherForm.email.trim() || (teacherDialog.mode === 'add' && !teacherForm.password.trim()), children: teacherDialog.mode === 'edit' ? 'Save Changes' : 'Create Teacher' }), _jsx(Button, { variant: "outline", onClick: closeTeacherDialog, children: "Cancel" })] })] })] }) })] }));
}
