import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { User, SignIn, SignOut, UserPlus, Trash, Eye, EyeSlash, Database } from "@phosphor-icons/react"
import { toast } from 'sonner'
import { migrateLegacyData, hasLegacyData, getLegacyDataStats } from '@/lib/dataMigration'
import { apiClient } from '@/lib/api'

interface UserAuthProps {
  onUserChange: (userData: UserData | null) => void
}

export interface UserData {
  id: string
  name: string
  email: string
  createdAt?: string
  lastLoginAt?: string
  avatar?: string
}

// Validate email format
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export default function UserAuth({ onUserChange }: UserAuthProps) {
  const [currentUser, setCurrentUser] = useState<UserData | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [isLoading, setIsLoading] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [hasLegacy, setHasLegacy] = useState(false)
  const [legacyStats, setLegacyStats] = useState({ hasData: false, recordCount: 0 })
  
  // Form fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')

  // Check for existing user session on mount
  useEffect(() => {
    checkExistingSession()
    checkLegacyData()
  }, [])

  const checkLegacyData = async () => {
    const legacy = await hasLegacyData()
    const stats = await getLegacyDataStats()
    setHasLegacy(legacy)
    setLegacyStats(stats)
  }

  const checkExistingSession = async () => {
    try {
      if (apiClient.isAuthenticated()) {
        const response = await apiClient.getProfile()
        if (response.data) {
          setCurrentUser(response.data)
          onUserChange(response.data)
          toast.success(`Welcome back, ${response.data.name}!`)
          setShowDialog(false) // Close the modal
        } else {
          apiClient.logout()
        }
      }
    } catch (error) {
      // If session check fails, user will remain null and dialog will show
    }
    setIsLoading(false)
  }

  const signUp = async () => {
    if (!email.trim() || !password.trim() || !name.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    if (!isValidEmail(email)) {
      toast.error('Please enter a valid email address')
      return
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    try {
      const response = await apiClient.register(email.toLowerCase(), password, name)
      
      if (response.error) {
        toast.error(response.error)
        return
      }

      if (response.data) {
        setCurrentUser(response.data.user)
        onUserChange(response.data.user)
        
        // Create default grade category types for new user
        try {
          const defaultCategories = [
            { name: 'Lesson', description: 'Regular lesson activities', sort_order: 0, is_active: true, is_default: true },
            { name: 'Test', description: 'Major assessments', sort_order: 1, is_active: true, is_default: false },
            { name: 'Quiz', description: 'Short assessments', sort_order: 2, is_active: true, is_default: false },
            { name: 'Project', description: 'Long-term assignments', sort_order: 3, is_active: true, is_default: false }
          ]
          
          for (const category of defaultCategories) {
            await apiClient.createGradeCategoryType(category)
          }
          
          console.log('Default grade category types created successfully')
        } catch (categoryError) {
          console.warn('Failed to create default grade categories:', categoryError)
          // Don't show error to user as account was still created successfully
        }
        
        toast.success('Account created successfully!')
        setShowDialog(false)
        resetForm()
      }
    } catch (error) {
      console.error('Sign up error:', error)
      toast.error('Failed to create account. Please try again.')
    }
  }

  const signIn = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error('Please enter your email and password')
      return
    }

    if (!isValidEmail(email)) {
      toast.error('Please enter a valid email address')
      return
    }

    try {
      const response = await apiClient.login(email.toLowerCase(), password)
      
      if (response.error) {
        toast.error(response.error)
        return
      }

      if (response.data) {
        setCurrentUser(response.data.user)
        onUserChange(response.data.user)
        
        // Check for legacy data migration on sign in
        if (hasLegacy) {
          await migrateLegacyData(response.data.user)
          setHasLegacy(false)
        }
        
        toast.success(`Welcome back, ${response.data.user.name}!`)
        setShowDialog(false)
        resetForm()
      }
    } catch (error) {
      console.error('Sign in error:', error)
      toast.error('Failed to sign in. Please try again.')
    }
  }

  const signOut = async () => {
    try {
      setCurrentUser(null)
      onUserChange(null)
      apiClient.logout()
      toast.success('Signed out successfully')
    } catch (error) {
      console.error('Sign out error:', error)
      toast.error('Error signing out')
    }
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setName('')
    setShowPassword(false)
  }

  const clearAllData = async () => {
    if (!currentUser) return

    if (!confirm('Are you sure you want to DELETE your account? This cannot be undone.')) {
      return
    }

  if (!confirm('This is your final warning. ALL YOUR DATA WILL BE LOST AND YOUR ACCOUNT WILL BE DELETED. You will need to enter your password to confirm.')) {
      return
    }

    const password = prompt('Enter your password to confirm account deletion:')
    if (!password || password.length < 1) {
      toast.error('Operation cancelled - password required')
      return
    }

    try {
      const response = await apiClient.deleteMyAccount(password);
      if (response.error) {
        toast.error(response.error);
        return;
      }
      await signOut();
      toast.success('Your account and all data have been deleted.');
    } catch (error) {
      console.error('Error clearing data:', error);
      toast.error('Error clearing data');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <>
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <User size={24} />
              Welcome to GradeFlow
            </CardTitle>
            <p className="text-muted-foreground">
              Sign in or create an account to manage your grades securely
            </p>
            {hasLegacy && legacyStats.hasData && (
              <Alert>
                <Database className="h-4 w-4" />
                <AlertDescription>
                  We found {legacyStats.recordCount} records from your previous session. 
                  They will be automatically migrated when you sign in or create an account.
                </AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => {
                setAuthMode('signin')
                setShowDialog(true)
              }} 
              className="w-full"
            >
              <SignIn size={16} className="mr-2" />
              Sign In
            </Button>
            <Button 
              onClick={() => {
                setAuthMode('signup')
                setShowDialog(true)
              }} 
              variant="outline"
              className="w-full"
            >
              <UserPlus size={16} className="mr-2" />
              Create Account
            </Button>
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={(open) => {
          setShowDialog(open);
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {authMode === 'signin' ? 'Sign In' : 'Create Account'}
              </DialogTitle>
              <DialogDescription>
                {authMode === 'signin' ? 'Enter your credentials to sign in to your account.' : 'Create a new account to get started.'}
              </DialogDescription>
            </DialogHeader>
            
            <Tabs value={authMode} onValueChange={(value) => {
              setAuthMode(value as 'signin' | 'signup')
              resetForm()
            }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin" className="space-y-4 mt-4">
                <form onSubmit={(e) => { e.preventDefault(); signIn(); }}>
                  <div>
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button type="submit" className="flex-1">
                      Sign In
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4 mt-4">
                <form onSubmit={(e) => { e.preventDefault(); signUp(); }}>
                  <div>
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your full name"
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a password (min 6 characters)"
                        autoComplete="new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="signup-confirm">Confirm Password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button type="submit" className="flex-1">
                      Create Account
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-card rounded-lg border">
      <Avatar className="h-8 w-8">
        <AvatarImage src={currentUser.avatar} />
        <AvatarFallback>
          {currentUser.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{currentUser.name}</p>
        <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={clearAllData}
        className="text-destructive hover:text-destructive"
        title="Clear All My Data"
      >
        <Trash size={16} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={signOut}
        className="text-muted-foreground hover:text-foreground"
      >
        <SignOut size={16} />
      </Button>
    </div>
  )
}