import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, SignIn, SignOut, UserPlus, Eye, EyeSlash, Database, Download } from "@phosphor-icons/react";
import { toast } from 'sonner';
import { migrateLegacyData, hasLegacyData, getLegacyDataStats } from '@/lib/dataMigration';
import { apiClient } from '@/lib/api';
// Check if running in Tauri (desktop app)
const isTauri = () => {
    return typeof window !== 'undefined' && 'window' in window && '__TAURI__' in window;
};
// Detect user's platform
const getPlatform = () => {
    if (typeof navigator === 'undefined')
        return 'unknown';
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('win'))
        return 'windows';
    if (userAgent.includes('mac'))
        return 'macos';
    if (userAgent.includes('linux'))
        return 'linux';
    return 'unknown';
};
// Get download URL for user's platform
const getDownloadUrl = () => {
    const platform = getPlatform();
    const baseUrl = 'https://github.com/Jaime-Bergen/gradeflowapp/releases/latest/download/';
    switch (platform) {
        case 'windows':
            return {
                url: `${baseUrl}GradeFlowApp_0.1.0_x64-setup.exe`,
                label: 'Download for Windows',
                icon: '🖥️'
            };
        case 'macos':
            return {
                url: `${baseUrl}GradeFlowApp_0.1.0_aarch64.dmg`,
                label: 'Download for macOS',
                icon: '🍎'
            };
        case 'linux':
            return {
                url: `${baseUrl}GradeFlowApp_0.1.0_amd64.AppImage`,
                label: 'Download for Linux',
                icon: '🐧'
            };
        default:
            return {
                url: `${baseUrl}GradeFlowApp_0.1.0_x64-setup.exe`,
                label: 'Download Desktop App',
                icon: '💻'
            };
    }
};
// Validate email format
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
export default function UserAuth({ onUserChange }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [showDialog, setShowDialog] = useState(false);
    const [authMode, setAuthMode] = useState('signin');
    const [isLoading, setIsLoading] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [hasLegacy, setHasLegacy] = useState(false);
    const [legacyStats, setLegacyStats] = useState({ hasData: false, recordCount: 0 });
    const [showResetDialog, setShowResetDialog] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    // Form fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
    // Check for existing user session on mount
    useEffect(() => {
        checkExistingSession();
        checkLegacyData();
    }, []);
    const checkLegacyData = async () => {
        const legacy = await hasLegacyData();
        const stats = await getLegacyDataStats();
        setHasLegacy(legacy);
        setLegacyStats(stats);
    };
    const checkExistingSession = async () => {
        try {
            if (apiClient.isAuthenticated()) {
                const response = await apiClient.getProfile();
                if (response.data) {
                    setCurrentUser(response.data);
                    onUserChange(response.data);
                    toast.success(`Welcome back, ${response.data.name}!`);
                    setShowDialog(false); // Close the modal
                }
                else {
                    apiClient.logout();
                }
            }
        }
        catch (error) {
            // If session check fails, user will remain null and dialog will show
        }
        setIsLoading(false);
    };
    const signUp = async () => {
        if (!email.trim() || !password.trim() || !name.trim()) {
            toast.error('Please fill in all fields');
            return;
        }
        if (!isValidEmail(email)) {
            toast.error('Please enter a valid email address');
            return;
        }
        if (password.length < 6) {
            toast.error('Password must be at least 6 characters long');
            return;
        }
        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        try {
            const response = await apiClient.register(email.toLowerCase(), password, name);
            if (response.error) {
                toast.error(response.error);
                return;
            }
            if (response.data) {
                setCurrentUser(response.data.user);
                onUserChange(response.data.user);
                // Create default grade category types for new user
                try {
                    const defaultCategories = [
                        { name: 'Lesson', description: 'Regular lesson activities', is_active: true, is_default: true, color: '#6366f1' },
                        { name: 'Test', description: 'Major assessments', is_active: true, is_default: false, color: '#dc2626' },
                        { name: 'Quiz', description: 'Short assessments', is_active: true, is_default: false, color: '#f59e0b' },
                        { name: 'Project', description: 'Long-term assignments', is_active: true, is_default: false, color: '#059669' }
                    ];
                    for (const category of defaultCategories) {
                        await apiClient.createGradeCategoryType(category);
                    }
                    console.log('Default grade category types created successfully');
                }
                catch (categoryError) {
                    console.warn('Failed to create default grade categories:', categoryError);
                    // Don't show error to user as account was still created successfully
                }
                toast.success('Account created successfully!');
                setShowDialog(false);
                resetForm();
            }
        }
        catch (error) {
            console.error('Sign up error:', error);
            toast.error('Failed to create account. Please try again.');
        }
    };
    const signIn = async () => {
        if (!email.trim() || !password.trim()) {
            toast.error('Please enter your email and password');
            return;
        }
        if (!isValidEmail(email)) {
            toast.error('Please enter a valid email address');
            return;
        }
        try {
            const response = await apiClient.login(email.toLowerCase(), password);
            if (response.error) {
                toast.error(response.error);
                return;
            }
            if (response.data) {
                setCurrentUser(response.data.user);
                onUserChange(response.data.user);
                // Check for legacy data migration on sign in
                if (hasLegacy) {
                    await migrateLegacyData(response.data.user);
                    setHasLegacy(false);
                }
                toast.success(`Welcome back, ${response.data.user.name}!`);
                setShowDialog(false);
                resetForm();
            }
        }
        catch (error) {
            console.error('Sign in error:', error);
            toast.error('Failed to sign in. Please try again.');
        }
    };
    const signOut = async () => {
        try {
            setCurrentUser(null);
            onUserChange(null);
            apiClient.logout();
            toast.success('Signed out successfully');
        }
        catch (error) {
            console.error('Sign out error:', error);
            toast.error('Error signing out');
        }
    };
    const handleResetPassword = async () => {
        if (!resetEmail.trim()) {
            toast.error('Please enter your email address');
            return;
        }
        if (!isValidEmail(resetEmail)) {
            toast.error('Please enter a valid email address');
            return;
        }
        try {
            const response = await apiClient.resetPassword(resetEmail.toLowerCase());
            if (response.error) {
                toast.error(response.error);
                return;
            }
            if (response.data) {
                toast.success(response.data.message);
                setShowResetDialog(false);
                setResetEmail('');
            }
        }
        catch (error) {
            console.error('Password reset error:', error);
            toast.error('Failed to send reset password. Please try again.');
        }
    };
    const resetForm = () => {
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setName('');
        setShowPassword(false);
    };
    if (isLoading) {
        return (_jsx("div", { className: "flex items-center justify-center p-4", children: _jsx("div", { className: "text-muted-foreground", children: "Loading..." }) }));
    }
    if (!currentUser) {
        return (_jsxs(_Fragment, { children: [_jsxs(Card, { className: "max-w-md mx-auto", children: [_jsxs(CardHeader, { className: "text-center", children: [_jsxs(CardTitle, { className: "flex items-center justify-center gap-2", children: [_jsx(User, { size: 24 }), "Welcome to GradeFlow"] }), _jsx("p", { className: "text-muted-foreground", children: "Sign in or create an account to manage your grades securely" }), hasLegacy && legacyStats.hasData && (_jsxs(Alert, { children: [_jsx(Database, { className: "h-4 w-4" }), _jsxs(AlertDescription, { children: ["We found ", legacyStats.recordCount, " records from your previous session. They will be automatically migrated when you sign in or create an account."] })] }))] }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs(Button, { onClick: () => {
                                        setAuthMode('signin');
                                        setShowDialog(true);
                                    }, className: "w-full", children: [_jsx(SignIn, { size: 16, className: "mr-2" }), "Sign In"] }), _jsxs(Button, { onClick: () => {
                                        setAuthMode('signup');
                                        setShowDialog(true);
                                    }, variant: "outline", className: "w-full", children: [_jsx(UserPlus, { size: 16, className: "mr-2" }), "Create Account"] })] }), !isTauri() && (_jsx("div", { className: "px-6 pb-6", children: _jsx("div", { className: "border-t pt-4", children: _jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-sm text-muted-foreground mb-2", children: "Get the desktop app for a better experience" }), (() => {
                                            const download = getDownloadUrl();
                                            return (_jsxs(Button, { variant: "outline", size: "sm", onClick: () => {
                                                    window.open(download.url, '_blank');
                                                }, className: "text-sm", children: [_jsx(Download, { size: 16, className: "mr-2" }), download.label] }));
                                        })(), _jsxs("details", { className: "mt-2", children: [_jsx("summary", { className: "text-xs text-muted-foreground cursor-pointer", children: "Other platforms" }), _jsxs("div", { className: "mt-2 space-y-1", children: [_jsx("div", { children: _jsx("a", { href: "https://github.com/Jaime-Bergen/gradeflowapp/releases/latest/download/GradeFlowApp_0.1.0_x64-setup.exe", className: "text-xs text-blue-600 hover:underline", target: "_blank", rel: "noopener noreferrer", children: "\uD83D\uDDA5\uFE0F Windows (exe)" }) }), _jsx("div", { children: _jsx("a", { href: "https://github.com/Jaime-Bergen/gradeflowapp/releases/latest/download/GradeFlowApp_0.1.0_aarch64.dmg", className: "text-xs text-blue-600 hover:underline", target: "_blank", rel: "noopener noreferrer", children: "\uD83C\uDF4E macOS Apple Silicon (dmg)" }) }), _jsx("div", { children: _jsx("a", { href: "https://github.com/Jaime-Bergen/gradeflowapp/releases/latest/download/GradeFlowApp_0.1.0_x64_en-US.msi", className: "text-xs text-blue-600 hover:underline", target: "_blank", rel: "noopener noreferrer", children: "\uD83D\uDDA5\uFE0F Windows (msi)" }) }), _jsx("div", { children: _jsx("a", { href: "https://github.com/Jaime-Bergen/gradeflowapp/releases/latest/download/GradeFlowApp_0.1.0_amd64.AppImage", className: "text-xs text-blue-600 hover:underline", target: "_blank", rel: "noopener noreferrer", children: "\uD83D\uDC27 Linux (AppImage)" }) }), _jsx("div", { children: _jsx("a", { href: "https://github.com/Jaime-Bergen/gradeflowapp/releases/latest/download/GradeFlowApp_0.1.0_amd64.deb", className: "text-xs text-blue-600 hover:underline", target: "_blank", rel: "noopener noreferrer", children: "\uD83D\uDC27 Linux (deb)" }) })] })] })] }) }) }))] }), _jsx(Dialog, { open: showDialog, onOpenChange: (open) => {
                        setShowDialog(open);
                    }, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: authMode === 'signin' ? 'Sign In' : 'Create Account' }), _jsx(DialogDescription, { children: authMode === 'signin' ? 'Enter your credentials to sign in to your account.' : 'Create a new account to get started.' })] }), _jsxs(Tabs, { value: authMode, onValueChange: (value) => {
                                    setAuthMode(value);
                                    resetForm();
                                }, children: [_jsxs(TabsList, { className: "grid w-full grid-cols-2", children: [_jsx(TabsTrigger, { value: "signin", children: "Sign In" }), _jsx(TabsTrigger, { value: "signup", children: "Sign Up" })] }), _jsxs(TabsContent, { value: "signin", className: "space-y-4 mt-4", children: [_jsxs("form", { onSubmit: (e) => { e.preventDefault(); signIn(); }, children: [_jsxs("div", { children: [_jsx(Label, { htmlFor: "signin-email", children: "Email" }), _jsx(Input, { id: "signin-email", type: "email", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "your@email.com", autoComplete: "email" })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "signin-password", children: "Password" }), _jsxs("div", { className: "relative", children: [_jsx(Input, { id: "signin-password", type: showPassword ? "text" : "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Enter your password", autoComplete: "current-password" }), _jsx(Button, { type: "button", variant: "ghost", size: "sm", className: "absolute right-0 top-0 h-full px-3", onClick: () => setShowPassword(!showPassword), children: showPassword ? _jsx(EyeSlash, { size: 16 }) : _jsx(Eye, { size: 16 }) })] })] }), _jsxs("div", { className: "flex gap-2 pt-2", children: [_jsx(Button, { type: "submit", className: "flex-1", children: "Sign In" }), _jsx(Button, { type: "button", variant: "outline", onClick: () => setShowDialog(false), children: "Cancel" })] })] }), _jsx("div", { className: "text-center pt-2", children: _jsx(Button, { type: "button", variant: "link", className: "text-sm text-muted-foreground", onClick: () => {
                                                        // Auto-fill reset email if login email is valid
                                                        if (email.trim() && isValidEmail(email)) {
                                                            setResetEmail(email.toLowerCase());
                                                        }
                                                        setShowResetDialog(true);
                                                    }, children: "Forgot your password?" }) })] }), _jsx(TabsContent, { value: "signup", className: "space-y-4 mt-4", children: _jsxs("form", { onSubmit: (e) => { e.preventDefault(); signUp(); }, children: [_jsxs("div", { children: [_jsx(Label, { htmlFor: "signup-name", children: "Full Name" }), _jsx(Input, { id: "signup-name", value: name, onChange: (e) => setName(e.target.value), placeholder: "Enter your full name", autoComplete: "name" })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "signup-email", children: "Email" }), _jsx(Input, { id: "signup-email", type: "email", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "your@email.com", autoComplete: "email" })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "signup-password", children: "Password" }), _jsxs("div", { className: "relative", children: [_jsx(Input, { id: "signup-password", type: showPassword ? "text" : "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Create a password (min 6 characters)", autoComplete: "new-password" }), _jsx(Button, { type: "button", variant: "ghost", size: "sm", className: "absolute right-0 top-0 h-full px-3", onClick: () => setShowPassword(!showPassword), children: showPassword ? _jsx(EyeSlash, { size: 16 }) : _jsx(Eye, { size: 16 }) })] })] }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "signup-confirm", children: "Confirm Password" }), _jsx(Input, { id: "signup-confirm", type: "password", value: confirmPassword, onChange: (e) => setConfirmPassword(e.target.value), placeholder: "Confirm your password", autoComplete: "new-password" })] }), _jsxs("div", { className: "flex gap-2 pt-2", children: [_jsx(Button, { type: "submit", className: "flex-1", children: "Create Account" }), _jsx(Button, { type: "button", variant: "outline", onClick: () => setShowDialog(false), children: "Cancel" })] })] }) })] })] }) }), _jsx(Dialog, { open: showResetDialog, onOpenChange: setShowResetDialog, children: _jsxs(DialogContent, { className: "max-w-md", children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Reset Password" }), _jsx(DialogDescription, { children: "Enter your email address and we'll send you a new password." })] }), _jsx("form", { onSubmit: (e) => { e.preventDefault(); handleResetPassword(); }, children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx(Label, { htmlFor: "reset-email", children: "Email" }), _jsx(Input, { id: "reset-email", type: "email", value: resetEmail, onChange: (e) => setResetEmail(e.target.value), placeholder: "your@email.com", autoComplete: "email" })] }), _jsxs("div", { className: "flex gap-2 pt-2", children: [_jsx(Button, { type: "submit", className: "flex-1", children: "Send New Password" }), _jsx(Button, { type: "button", variant: "outline", onClick: () => {
                                                        setShowResetDialog(false);
                                                        setResetEmail('');
                                                    }, children: "Cancel" })] })] }) })] }) })] }));
    }
    return (_jsxs("div", { className: "flex items-center gap-3 px-4 py-2 bg-card rounded-lg border", children: [_jsxs(Avatar, { className: "h-8 w-8", children: [_jsx(AvatarImage, { src: currentUser.avatar }), _jsx(AvatarFallback, { children: currentUser.name.charAt(0).toUpperCase() })] }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "font-medium text-sm truncate", children: currentUser.name }), _jsx("p", { className: "text-xs text-muted-foreground truncate", children: currentUser.email })] }), _jsx(Button, { variant: "ghost", size: "sm", onClick: signOut, className: "text-muted-foreground hover:text-foreground", children: _jsx(SignOut, { size: 16 }) })] }));
}
