import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Routes, Route } from 'react-router-dom';
import { GraduationCap, ChartBar, FileText, Users, BookOpen, Gear, Database, Question } from "@phosphor-icons/react";
import Dashboard from './components/Dashboard';
import Students from './components/Students';
import Subjects from './components/Subjects';
import GradeEntry from './components/GradeEntry';
import Reports from './components/Reports';
import SystemAdmin from './components/SystemAdmin';
import Help from './components/Help';
import UserAuth from './components/UserAuth';
import TeacherSelector from './components/TeacherSelector';
import AdminDanger from '@/components/AdminDanger';
import { Toaster } from 'sonner';
function App() {
    useEffect(() => {
        const handler = (e) => {
            const customEvent = e;
            if (customEvent.detail?.tab) {
                setActiveTab(customEvent.detail.tab);
            }
        };
        window.addEventListener('gradeflow-goto-tab', handler);
        return () => window.removeEventListener('gradeflow-goto-tab', handler);
    }, []);
    const [activeTab, setActiveTab] = useState("dashboard");
    const [currentUser, setCurrentUser] = useState(null);
    const handleUserChange = (userData) => {
        setCurrentUser(userData);
        // Set global user context for data isolation
        if (userData) {
            window.CURRENT_USER_ID = userData.id;
        }
        else {
            delete window.CURRENT_USER_ID;
        }
    };
    const handleTeacherChange = (teacher) => {
        // Store selected teacher's group IDs globally for filtering
        if (teacher && teacher.assigned_groups) {
            window.SELECTED_TEACHER_GROUPS = teacher.assigned_groups.map((g) => g.id);
        }
        else {
            // For admin or no teacher selection, set empty array to show all data
            window.SELECTED_TEACHER_GROUPS = [];
        }
    };
    return (_jsxs(_Fragment, { children: [_jsxs(Routes, { children: [_jsx(Route, { path: "/AdminDanger", element: _jsx(AdminDanger, {}) }), _jsx(Route, { path: "*", element: !currentUser ? (_jsx("div", { className: "min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-8", children: _jsx(UserAuth, { onUserChange: handleUserChange }) })) : (_jsxs("div", { className: "min-h-screen bg-background", children: [_jsx("header", { className: "border-b border-border bg-card", children: _jsx("div", { className: "container mx-auto px-6 py-4", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(GraduationCap, { size: 32, className: "text-primary", weight: "bold" }), _jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-foreground", children: "GradeFlow" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Streamlined Grade Management" })] })] }), _jsx(TeacherSelector, { onTeacherChange: handleTeacherChange })] }) }) }), _jsx("div", { className: "container mx-auto px-6 py-6", children: _jsxs(Tabs, { value: activeTab, onValueChange: setActiveTab, className: "space-y-6", children: [_jsxs(TabsList, { className: "grid w-full grid-cols-7 lg:w-auto lg:grid-cols-7", children: [_jsxs(TabsTrigger, { value: "dashboard", className: "flex items-center gap-2", children: [_jsx(ChartBar, { size: 18 }), _jsx("span", { className: "hidden sm:inline", children: "Dashboard" })] }), _jsxs(TabsTrigger, { value: "students", className: "flex items-center gap-2", children: [_jsx(Users, { size: 18 }), _jsx("span", { className: "hidden sm:inline", children: "Students" })] }), _jsxs(TabsTrigger, { value: "subjects", className: "flex items-center gap-2", children: [_jsx(BookOpen, { size: 18 }), _jsx("span", { className: "hidden sm:inline", children: "Subjects" })] }), _jsxs(TabsTrigger, { value: "grades", className: "flex items-center gap-2", children: [_jsx(Gear, { size: 18 }), _jsx("span", { className: "hidden sm:inline", children: "Grades" })] }), _jsxs(TabsTrigger, { value: "reports", className: "flex items-center gap-2", children: [_jsx(FileText, { size: 18 }), _jsx("span", { className: "hidden sm:inline", children: "Reports" })] }), _jsxs(TabsTrigger, { value: "admin", className: "flex items-center gap-2", children: [_jsx(Database, { size: 18 }), _jsx("span", { className: "hidden sm:inline", children: "Admin" })] }), _jsxs(TabsTrigger, { value: "help", className: "flex items-center gap-2", children: [_jsx(Question, { size: 18 }), _jsx("span", { className: "hidden sm:inline", children: "Help" })] })] }), _jsx(TabsContent, { value: "dashboard", className: "space-y-6", children: _jsx(Dashboard, {}) }), _jsx(TabsContent, { value: "students", className: "space-y-6", children: _jsx(Students, {}) }), _jsx(TabsContent, { value: "subjects", className: "space-y-6", children: _jsx(Subjects, {}) }), _jsx(TabsContent, { value: "grades", className: "space-y-6", children: _jsx(GradeEntry, {}) }), _jsx(TabsContent, { value: "reports", className: "space-y-6", children: _jsx(Reports, {}) }), _jsx(TabsContent, { value: "admin", className: "space-y-6", children: _jsx(SystemAdmin, {}) }), _jsx(TabsContent, { value: "help", className: "space-y-6", children: _jsx(Help, {}) })] }) })] })) })] }), _jsx(Toaster, {})] }));
}
export default App;
