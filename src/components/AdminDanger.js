import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Database, Download, Upload } from "lucide-react";
import { toast } from 'sonner';
import DataCleaner from './DataCleaner';
// import { apiClient } from '@/lib/api' // Uncomment when backend supports /users
export default function AdminDanger() {
    const [entered, setEntered] = useState(false);
    const [input, setInput] = useState("");
    const [restoreDialog, setRestoreDialog] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [isRestoring, setIsRestoring] = useState(false);
    const adminPass = import.meta.env.VITE_ADMIN_PASS;
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!adminPass) {
            toast.error("Admin passcode is not set in the environment (VITE_ADMIN_PASS)");
            return;
        }
        if (input === adminPass) {
            setEntered(true);
        }
        else {
            toast.error("Incorrect passcode.");
        }
    };
    // SQL Backup functions
    const createSQLBackup = async () => {
        try {
            const response = await apiClient.createSQLBackup();
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'gradeflow-backup.sql';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Full database backup created successfully');
        }
        catch (error) {
            console.error('SQL backup failed:', error);
            toast.error('Failed to create SQL backup');
        }
    };
    const openRestoreDialog = () => {
        setRestoreDialog(true);
        setSelectedFile(null);
    };
    const closeRestoreDialog = () => {
        setRestoreDialog(false);
        setSelectedFile(null);
        setIsRestoring(false);
    };
    const handleFileSelect = (event) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };
    const performSQLRestore = async () => {
        if (!selectedFile) {
            toast.error('Please select a backup file');
            return;
        }
        setIsRestoring(true);
        try {
            await apiClient.restoreFromSQL(selectedFile);
            toast.success('Database restored successfully from SQL backup');
            closeRestoreDialog();
        }
        catch (error) {
            console.error('Restore failed:', error);
            toast.error(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        finally {
            setIsRestoring(false);
        }
    };
    if (!entered) {
        return (_jsxs(Card, { className: "max-w-md mx-auto border-destructive mt-12", children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2 text-destructive", children: [_jsx(AlertTriangle, { size: 24 }), "Admin Danger Zone"] }) }), _jsx(CardContent, { children: _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs(Alert, { variant: "destructive", children: [_jsx(AlertTriangle, { className: "h-4 w-4" }), _jsxs(AlertDescription, { children: [_jsx("strong", { children: "Restricted:" }), " Enter the admin passcode to access dangerous system operations."] })] }), _jsx("input", { type: "password", className: "input input-bordered w-full", placeholder: "Admin Passcode", value: input, onChange: e => setInput(e.target.value), autoFocus: true, autoComplete: "new-password" }), _jsx(Button, { type: "submit", variant: "destructive", className: "w-full", children: "Enter Danger Zone" })] }) })] }));
    }
    return (_jsxs("div", { className: "max-w-2xl mx-auto mt-12 space-y-8", children: [_jsxs(Card, { className: "border-destructive", children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2 text-destructive", children: [_jsx(AlertTriangle, { size: 24 }), "Admin Danger Zone"] }) }), _jsx(CardContent, { children: _jsxs(Alert, { variant: "destructive", children: [_jsx(AlertTriangle, { className: "h-4 w-4" }), _jsxs(AlertDescription, { children: [_jsx("strong", { children: "Danger Zone:" }), " You now have access to dangerous system operations."] })] }) })] }), _jsx(DataCleaner, {}), _jsxs(Card, { className: "border-destructive", children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2 text-destructive", children: [_jsx(Database, { size: 24 }), "Database Backup & Restore (SQL)"] }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs(Alert, { variant: "destructive", children: [_jsx(AlertTriangle, { className: "h-4 w-4" }), _jsxs(AlertDescription, { children: [_jsx("strong", { children: "Warning:" }), " SQL backups contain ALL user data. SQL restore will completely replace the database."] })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "space-y-3", children: [_jsx("h4", { className: "font-medium", children: "Full Database Backup" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Creates a complete PostgreSQL dump including all users' data and system settings." }), _jsxs(Button, { onClick: createSQLBackup, className: "flex items-center gap-2 w-full", children: [_jsx(Download, { size: 16 }), "Create SQL Backup"] })] }), _jsxs("div", { className: "space-y-3", children: [_jsx("h4", { className: "font-medium", children: "Database Restore" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Restore from a SQL backup file. This will replace ALL current data." }), _jsxs(Button, { onClick: openRestoreDialog, variant: "destructive", className: "flex items-center gap-2 w-full", children: [_jsx(Upload, { size: 16 }), "Restore from SQL"] })] })] })] })] }), _jsx(Dialog, { open: restoreDialog, onOpenChange: (open) => !open && closeRestoreDialog(), children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { className: "text-destructive flex items-center gap-2", children: [_jsx(AlertTriangle, { size: 20 }), "Restore Database from SQL"] }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs(Alert, { variant: "destructive", children: [_jsx(AlertTriangle, { className: "h-4 w-4" }), _jsxs(AlertDescription, { children: [_jsx("strong", { children: "DANGER:" }), " This will completely replace the current database. All existing data will be permanently lost. This action cannot be undone."] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "sql-restore-file", children: "Select SQL Backup File" }), _jsx(Input, { id: "sql-restore-file", type: "file", accept: ".sql", onChange: handleFileSelect }), selectedFile && (_jsxs("p", { className: "text-sm text-muted-foreground", children: ["Selected: ", selectedFile.name, " (", (selectedFile.size / 1024 / 1024).toFixed(2), " MB)"] }))] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsx(Button, { onClick: performSQLRestore, className: "flex-1", variant: "destructive", disabled: !selectedFile || isRestoring, children: isRestoring ? 'Restoring...' : 'Replace Database' }), _jsx(Button, { variant: "outline", onClick: closeRestoreDialog, disabled: isRestoring, children: "Cancel" })] })] })] }) }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "All Users" }) }), _jsx(CardContent, { children: _jsx(UserList, {}) })] })] }));
}
// UserList component for admin user info
function UserList() {
    const { data: users, loading, error } = useApi(() => apiClient.getAllUsers(), []);
    if (loading)
        return _jsx("div", { children: "Loading users..." });
    if (error)
        return _jsxs("div", { className: "text-destructive", children: ["Error loading users: ", error] });
    if (!users || users.length === 0)
        return _jsx("div", { children: "No users found." });
    // Calculate totals
    const totalGrades = users.reduce((sum, u) => sum + (u.grades_record_count || 0), 0);
    const totalBytes = users.reduce((sum, u) => sum + (u.grades_estimated_bytes || 0), 0);
    return (_jsxs("div", { className: "overflow-x-auto", children: [_jsxs("table", { className: "min-w-full text-sm border", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-muted", children: [_jsx("th", { className: "px-2 py-1 border", children: "Name" }), _jsx("th", { className: "px-2 py-1 border", children: "Email" }), _jsx("th", { className: "px-2 py-1 border", children: "Joined" }), _jsx("th", { className: "px-2 py-1 border", children: "Last Used" }), _jsx("th", { className: "px-2 py-1 border", children: "Grades" }), _jsx("th", { className: "px-2 py-1 border", children: "Data (bytes)" })] }) }), _jsx("tbody", { children: users.map(u => (_jsxs("tr", { children: [_jsx("td", { className: "px-2 py-1 border", children: u.name }), _jsx("td", { className: "px-2 py-1 border", children: u.email }), _jsx("td", { className: "px-2 py-1 border", children: u.created_at ? new Date(u.created_at).toLocaleDateString() : '' }), _jsx("td", { className: "px-2 py-1 border", children: u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '' }), _jsx("td", { className: "px-2 py-1 border text-right", children: u.grades_record_count }), _jsx("td", { className: "px-2 py-1 border text-right", children: u.grades_estimated_bytes })] }, u.id))) }), _jsx("tfoot", { children: _jsxs("tr", { className: "font-bold bg-muted", children: [_jsx("td", { className: "px-2 py-1 border", colSpan: 4, children: "Totals" }), _jsx("td", { className: "px-2 py-1 border text-right", children: totalGrades }), _jsx("td", { className: "px-2 py-1 border text-right", children: totalBytes })] }) })] }), _jsxs("div", { className: "text-xs text-muted-foreground mt-2", children: ["Total users: ", users.length] })] }));
}
