import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Trash, AlertTriangle } from "lucide-react"
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'

export default function DataCleaner() {
  const clearAllData = async () => {
    if (!confirm('⚠️ DANGER: This will permanently delete ALL data in the system, including all user accounts and data. This action cannot be undone. Are you absolutely sure?')) {
      return
    }

    if (!confirm('This is your final warning. ALL DATA WILL BE LOST. Type "DELETE EVERYTHING" in the next prompt to confirm.')) {
      return
    }

    const confirmation = prompt('Type "DELETE EVERYTHING" to confirm:')
    if (confirmation !== 'DELETE EVERYTHING') {
      toast.error('Operation cancelled - confirmation text did not match')
      return
    }

    try {
      // Delete the current user and all their data
      await apiClient.deleteMyAccount(confirmation);
      toast.success('Your account and all data have been deleted');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error clearing all data:', error)
      toast.error('Error clearing data')
    }
  }

  return (
    <Card className="max-w-md mx-auto border-destructive">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle size={24} />
          System Data Reset
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Danger Zone:</strong> This will permanently delete ALL data in the system, 
            including all user accounts, students, subjects, grades, and backups. This action cannot be undone.
          </AlertDescription>
        </Alert>
        
        <Button 
          onClick={clearAllData}
          variant="destructive"
          className="w-full"
        >
          <Trash size={16} className="mr-2" />
          Clear All System Data
        </Button>
        
        <p className="text-xs text-muted-foreground text-center">
          Only use this for testing or when moving to a new system
        </p>
      </CardContent>
    </Card>
  )
}