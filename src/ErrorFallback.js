import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
export const ErrorFallback = ({ error, resetErrorBoundary }) => {
    // When encountering an error in the development mode, rethrow it and don't display the boundary.
    // The parent UI will take care of showing a more helpful dialog.
    if (import.meta.env.DEV)
        throw error;
    return (_jsx("div", { className: "min-h-screen bg-background flex items-center justify-center p-4", children: _jsxs("div", { className: "w-full max-w-md", children: [_jsxs(Alert, { variant: "destructive", className: "mb-6", children: [_jsx(AlertTriangleIcon, {}), _jsx(AlertTitle, { children: "This spark has encountered a runtime error" }), _jsx(AlertDescription, { children: "Something unexpected happened while running the application. The error details are shown below. Contact the spark author and let them know about this issue." })] }), _jsxs("div", { className: "bg-card border rounded-lg p-4 mb-6", children: [_jsx("h3", { className: "font-semibold text-sm text-muted-foreground mb-2", children: "Error Details:" }), _jsx("pre", { className: "text-xs text-destructive bg-muted/50 p-3 rounded border overflow-auto max-h-32", children: error.message })] }), _jsxs(Button, { onClick: resetErrorBoundary, className: "w-full", variant: "outline", children: [_jsx(RefreshCwIcon, {}), "Try Again"] })] }) }));
};
