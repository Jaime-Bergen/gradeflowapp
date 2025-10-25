import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { 
  Question, 
  Bug, 
  Lightbulb, 
  CaretDown, 
  CaretRight,
  CheckCircle,
  Info,
  Users,
  GraduationCap,
  ChartBar,
  Gear,
  FileText
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { apiClient } from '@/lib/api'

function Help() {
  const [activeSection, setActiveSection] = useState<'setup' | 'faq' | 'bug' | 'feature'>('setup')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const [bugReportDialog, setBugReportDialog] = useState(false)
  const [featureRequestDialog, setFeatureRequestDialog] = useState(false)
  const [bugForm, setBugForm] = useState({
    title: '',
    description: '',
    steps: '',
    expected: '',
    actual: '',
    browser: '',
    email: ''
  })
  const [featureForm, setFeatureForm] = useState({
    title: '',
    description: '',
    useCase: '',
    priority: 'medium',
    email: ''
  })

  const setupSteps = [
    {
      icon: <Users size={24} className="text-blue-600" />,
      title: "1. Add Students",
      description: "Import your students from a CSV file or add them individually.",
      steps: [
        "Go to the Students tab",
        "Click 'Add Student' to add each of your students",
        "Alternatively, click 'Import CSV' to bulk import from a file",
        "Format: First column = Student Name, Second column = Group Name, Third column = Birthday (yyyy-mm-dd)",
        "Example CSV: 'John Smith,Grade 5,2010-01-01'",
        "Groups will be created automatically if they don't exist",
        "You can also create/edit groups manually in the Admin/Settings tab"
      ],
      status: "required"
    },
    {
      icon: <Gear size={24} className="text-green-600" />,
      title: "2. Set Up Grade Categories",
      description: "Review and customize your grading categories. Common ones (Lesson, Test, Project, Quiz) have been added automatically. These will be used for grading weights and color-coded throughout for easy identification.",
      steps: [
        "Go to the Admin tab",
        "Click on 'Settings'",
        "Review the pre-created categories (Lesson and Test are the most commonly used categories. We recommend de-activating any you won't use to avoid accidental selection.)",
        "Enable additional categories like Project or Quiz if needed",
        "Customize colors and add new categories as desired",
        "Ensure one is marked as default (usually 'Lesson' or 'Homework') so that new lessons use that category unless a specific selection is made."
      ],
      status: "required"
    },
    {
      icon: <GraduationCap size={24} className="text-purple-600" />,
      title: "3. Add Subjects",
      description: "Create subjects and set up grade weights for each category.",
      steps: [
        "Go to the Subjects tab",
        "Click 'Add Subject'",
        "Enter subject name and optional report card name (for example 'MATH 7' or 'Algebra' might be 'Mathematics' on report cards)",
        "Select student groups, if you need more you can simply scroll to the bottom of the dropdown, click add new, and type in a new group name. Special uses could include '5th & 6th' or 'Music Group', useful for organizing beyond simple grades",
        "Set grade weights (must total 100% [default: lessons 34%, tests 66%])"
      ],
      status: "required"
    },
    {
      icon: <Users size={24} className="text-indigo-600" />,
      title: "4. Activate Subjects for Students",
      description: "Go back to Students tab and click on subjects to make them available for grading.",
      steps: [
        "Return to the Students tab",
        "Click on the subjects you created to activate/deactivate them for each student",
        "Activated subjects will appear highlighted/selected",
        "Repeat for all student groups that need these subjects"
      ],
      status: "required"
    },
    {
      icon: <FileText size={24} className="text-orange-600" />,
      title: "5. Add Lessons",
      description: "Create lessons and assignments for your subjects. Note that all of these steps can be edited later as needed. You can edit lesson type, name, or points. Insert and delete lessons anywhere in the list and move grading period markers up and down using the chevrons.",
      steps: [
        "Expand a subject in the Subjects tab",
        "Click 'Add Lesson' or 'Add Lessons' for bulk creation (some teachers prefer to add lessons as they go, others count them all out at the start of the term; both are supported)",
        "Set lesson name, type, and point value",
        "Use grading period markers to separate terms"
      ],
      status: "required"
    },
    {
      icon: <ChartBar size={24} className="text-teal-600" />,
      title: "6. Enter Grades",
      description: "Start grading your students' work.",
      steps: [
        "Go to the Grade Entry tab",
        "Select subject and student group",
        "Click on any lesson to enter grades",
        "Use the grade scale or enter custom values",
        "Take a moment to learn the keyboard shortcuts for faster entry"
      ],
      status: "ongoing"
    }
  ]

  const faqData = [
    {
      question: "How do grading period markers work?",
      answer: "Grading period markers divide your lessons into terms or quarters. They help calculate grades for specific periods and generate accurate report cards. You can add markers between lessons to indicate the end of a grading period. The 'Number of Grading Periods' setting in Admin > Settings determines how many markers you can add per subject. If you select 6, you will need 5 markers to divide the periods. Report cards will use the grades between these markers based on the period selection on that page."
    },
    {
      question: "What are grade weights and how do I set them?",
      answer: "Grade weights are set in the Subjects tab and determine how much each category (Tests, Lessons, Projects) contributes to the subject averages on report. For example, if Tests are 60% and Lessons are 40%, tests will have more impact on the final grade. Weights must total exactly 100%."
    },
    {
      question: "Can I change a lesson's type or name after creating it?",
      answer: "Yes! Click the edit button (pencil icon) next to any lesson to change its name, type, or point value (deleting lessons can only be done from the subjects tab). The grade calculations will automatically update to reflect the new category weights."
    },
    {
      question: "How do I generate report cards?",
      answer: "Go to the Reports tab, select your criteria (student group, grading period, subjects), and click 'Generate Report Cards'. You can preview individual reports or download all as a PDF. If you like to see how the grading weight calculations are done, you can select student in the preview dropdown and click 'Show Calculations' to view the detailed breakdown. (We reccommend doing this especially while the software is in beta to ensure accuracy.)"
    },
    {
      question: "What if I accidentally delete a lesson or subject?",
      answer: "Deletions are permanent and cannot be undone. The system will warn you before deleting and show what will be removed (including all associated grades). Consider backing up your data regularly in the Admin tab."
    },
    {
      question: "How do I backup my data?",
      answer: "Go to the Admin tab and click 'Create Backup'. This downloads all your subjects, lessons, students, and grades. You can restore from a backup file if needed. In the event of major loss or corruption, feel free to reach out to support for assistance. We keep backups for a limited amount of time on our servers to help with recovery. Support fees will apply so regular local backups are recommended."
    },
    {
      question: "How do I import students from a CSV file?",
      answer: "Go to the Students tab and click 'Import CSV'. Your CSV should have student names in the first column and group names in the second column and birthday in the third column. Example: 'John Smith,Grade 5,2010-01-01' or just 'John Smith'. Student groups will be created automatically if they don't exist. Make sure to include a header row which will be skipped during import."
    },
    {
      question: "How do I change the number of grading periods?",
      answer: "Go to Admin > Settings and adjust the 'Grading Periods' setting. This affects how many report card periods you can generate and the maximum number of markers per subject."
    },
    {
      question: "What browsers are supported?",
      answer: "GradeFlow works best on modern browsers including Chrome, Firefox, Safari, and Edge. Internet Explorer is not supported. For the best experience, download the app from the login page to use the desktop version. We currently support Windows and are working on Mac support as well."
    }
  ]

  const handleBugSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const bugReport = {
        type: 'bug' as const,
        timestamp: new Date().toISOString(),
        ...bugForm
      }
      
      // Send bug report via API client
      const response = await apiClient.submitFeedback({
        to: 'feedback@gradeflowapp.com',
        subject: `Bug Report: ${bugForm.title}`,
        type: 'bug',
        data: bugReport
      })

      if (response.error) {
        throw new Error(response.error)
      }
      
      toast.success('Bug report submitted successfully! We\'ll investigate this issue.')
      setBugReportDialog(false)
      setBugForm({
        title: '',
        description: '',
        steps: '',
        expected: '',
        actual: '',
        browser: '',
        email: ''
      })
    } catch (error) {
      console.error('Error submitting bug report:', error)
      toast.error('Failed to submit bug report. Please try again or contact support directly at feedback@gradeflowapp.com')
    }
  }

  const handleFeatureSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const featureRequest = {
        type: 'feature' as const,
        timestamp: new Date().toISOString(),
        ...featureForm
      }
      
      // Send feature request via API client
      const response = await apiClient.submitFeedback({
        to: 'feedback@gradeflowapp.com',
        subject: `Feature Request: ${featureForm.title}`,
        type: 'feature',
        data: featureRequest
      })

      if (response.error) {
        throw new Error(response.error)
      }
      
      toast.success('Feature request submitted! We appreciate your suggestions.')
      setFeatureRequestDialog(false)
      setFeatureForm({
        title: '',
        description: '',
        useCase: '',
        priority: 'medium',
        email: ''
      })
    } catch (error) {
      console.error('Error submitting feature request:', error)
      toast.error('Failed to submit feature request. Please try again or contact us directly at feedback@gradeflowapp.com')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Help & Support</h2>
          <p className="text-muted-foreground">Get started with GradeFlow and find answers to common questions</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveSection('setup')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeSection === 'setup' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <CheckCircle size={16} className="inline mr-2" />
          Setup Guide
        </button>
        <button
          onClick={() => setActiveSection('faq')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeSection === 'faq' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Question size={16} className="inline mr-2" />
          FAQ
        </button>
        <button
          onClick={() => setActiveSection('bug')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeSection === 'bug' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bug size={16} className="inline mr-2" />
          Report Bug
        </button>
        <button
          onClick={() => setActiveSection('feature')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeSection === 'feature' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Lightbulb size={16} className="inline mr-2" />
          Feature Request
        </button>
      </div>

      {/* Setup Guide */}
      {activeSection === 'setup' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-800 mb-2">
              <Info size={20} />
              <span className="font-medium">Getting Started</span>
            </div>
            <p className="text-blue-700 text-sm">
              Follow these steps to set up your gradebook. Required steps must be completed before you can start grading.
            </p>
          </div>

          <div className="grid gap-6">
            {setupSteps.map((step, index) => (
              <Card key={index} className="relative">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      {step.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-lg">{step.title}</CardTitle>
                        <Badge 
                          variant={step.status === 'required' ? 'destructive' : step.status === 'recommended' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {step.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    {step.steps.map((stepItem, stepIndex) => (
                      <li key={stepIndex} className="text-muted-foreground">
                        {stepItem}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-800 mb-2">
              <CheckCircle size={20} />
              <span className="font-medium">Need Help?</span>
            </div>
            <p className="text-green-700 text-sm">
              If you get stuck during setup, check the FAQ section or report a bug if something isn't working as expected.
            </p>
          </div>
        </div>
      )}

      {/* FAQ Section */}
      {activeSection === 'faq' && (
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Find answers to frequently asked questions about using GradeFlow.
          </p>
          
          {faqData.map((faq, index) => (
            <Card key={index} className="cursor-pointer" onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{faq.question}</h3>
                  {expandedFaq === index ? <CaretDown size={16} /> : <CaretRight size={16} />}
                </div>
              </CardHeader>
              {expandedFaq === index && (
                <CardContent className="pt-0">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {faq.answer}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Bug Report */}
      {activeSection === 'bug' && (
        <div className="space-y-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-800 mb-2">
              <Bug size={20} />
              <span className="font-medium">Report a Bug</span>
            </div>
            <p className="text-red-700 text-sm">
              Found something that's not working correctly? Let us know so we can fix it!
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Bug size={48} className="mx-auto text-red-500 mb-4" />
                <h3 className="text-lg font-medium mb-2">Report a Bug</h3>
                <p className="text-muted-foreground mb-4">
                  Help us improve GradeFlow by reporting any issues you encounter.
                </p>
                <Button onClick={() => setBugReportDialog(true)}>
                  <Bug size={16} className="mr-2" />
                  Report Bug
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Feature Request */}
      {activeSection === 'feature' && (
        <div className="space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-yellow-800 mb-2">
              <Lightbulb size={20} />
              <span className="font-medium">Request a Feature</span>
            </div>
            <p className="text-yellow-700 text-sm">
              Have an idea for improving GradeFlow? We'd love to hear your suggestions!
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Lightbulb size={48} className="mx-auto text-yellow-500 mb-4" />
                <h3 className="text-lg font-medium mb-2">Request a Feature</h3>
                <p className="text-muted-foreground mb-4">
                  Share your ideas for new features or improvements to existing functionality.
                </p>
                <Button onClick={() => setFeatureRequestDialog(true)}>
                  <Lightbulb size={16} className="mr-2" />
                  Request Feature
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bug Report Dialog */}
      <Dialog open={bugReportDialog} onOpenChange={setBugReportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug size={20} className="text-red-500" />
              Report a Bug
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBugSubmit} className="space-y-4">
            <div>
              <Label htmlFor="bug-title">Bug Title *</Label>
              <Input
                id="bug-title"
                value={bugForm.title}
                onChange={e => setBugForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Brief description of the issue"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="bug-description">Description *</Label>
              <Textarea
                id="bug-description"
                value={bugForm.description}
                onChange={e => setBugForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Detailed description of what went wrong"
                rows={3}
                required
              />
            </div>

            <div>
              <Label htmlFor="bug-steps">Steps to Reproduce</Label>
              <Textarea
                id="bug-steps"
                value={bugForm.steps}
                onChange={e => setBugForm(prev => ({ ...prev, steps: e.target.value }))}
                placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bug-expected">Expected Result</Label>
                <Textarea
                  id="bug-expected"
                  value={bugForm.expected}
                  onChange={e => setBugForm(prev => ({ ...prev, expected: e.target.value }))}
                  placeholder="What should have happened?"
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="bug-actual">Actual Result</Label>
                <Textarea
                  id="bug-actual"
                  value={bugForm.actual}
                  onChange={e => setBugForm(prev => ({ ...prev, actual: e.target.value }))}
                  placeholder="What actually happened?"
                  rows={2}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bug-browser">Browser/Device</Label>
                <Input
                  id="bug-browser"
                  value={bugForm.browser}
                  onChange={e => setBugForm(prev => ({ ...prev, browser: e.target.value }))}
                  placeholder="Chrome, Firefox, Safari, etc."
                />
              </div>
              <div>
                <Label htmlFor="bug-email">Email (optional)</Label>
                <Input
                  id="bug-email"
                  type="email"
                  value={bugForm.email}
                  onChange={e => setBugForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="For follow-up questions"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1">
                <Bug size={16} className="mr-2" />
                Submit Bug Report
              </Button>
              <Button type="button" variant="outline" onClick={() => setBugReportDialog(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Feature Request Dialog */}
      <Dialog open={featureRequestDialog} onOpenChange={setFeatureRequestDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb size={20} className="text-yellow-500" />
              Request a Feature
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFeatureSubmit} className="space-y-4">
            <div>
              <Label htmlFor="feature-title">Feature Title *</Label>
              <Input
                id="feature-title"
                value={featureForm.title}
                onChange={e => setFeatureForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Brief name for the feature"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="feature-description">Description *</Label>
              <Textarea
                id="feature-description"
                value={featureForm.description}
                onChange={e => setFeatureForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Detailed description of the proposed feature"
                rows={3}
                required
              />
            </div>

            <div>
              <Label htmlFor="feature-usecase">Use Case</Label>
              <Textarea
                id="feature-usecase"
                value={featureForm.useCase}
                onChange={e => setFeatureForm(prev => ({ ...prev, useCase: e.target.value }))}
                placeholder="How would this feature help you? What problem does it solve?"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="feature-priority">Priority</Label>
                <select
                  id="feature-priority"
                  value={featureForm.priority}
                  onChange={e => setFeatureForm(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full border rounded px-2 py-1"
                >
                  <option value="low">Nice to have</option>
                  <option value="medium">Would be helpful</option>
                  <option value="high">Really need this</option>
                  <option value="critical">Can't work without it</option>
                </select>
              </div>
              <div>
                <Label htmlFor="feature-email">Email (optional)</Label>
                <Input
                  id="feature-email"
                  type="email"
                  value={featureForm.email}
                  onChange={e => setFeatureForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="For updates on your request"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1">
                <Lightbulb size={16} className="mr-2" />
                Submit Feature Request
              </Button>
              <Button type="button" variant="outline" onClick={() => setFeatureRequestDialog(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Help