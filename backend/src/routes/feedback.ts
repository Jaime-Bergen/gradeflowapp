import express from 'express';
import nodemailer from 'nodemailer';

const router = express.Router();

// Email configuration
const createTransporter = () => {
  // Use environment variables for email configuration
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Format bug report email
const formatBugReport = (data: any) => {
  return `
<h2>Bug Report: ${data.title}</h2>
<p><strong>Submitted:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
${data.email ? `<p><strong>Contact Email:</strong> ${data.email}</p>` : ''}

<h3>Description</h3>
<p>${data.description}</p>

${data.steps ? `
<h3>Steps to Reproduce</h3>
<pre>${data.steps}</pre>
` : ''}

${data.expected ? `
<h3>Expected Result</h3>
<p>${data.expected}</p>
` : ''}

${data.actual ? `
<h3>Actual Result</h3>
<p>${data.actual}</p>
` : ''}

${data.browser ? `
<h3>Browser/Device</h3>
<p>${data.browser}</p>
` : ''}

<hr>
<p><em>This bug report was automatically generated from GradeFlow Help system.</em></p>
  `.trim();
};

// Format feature request email
const formatFeatureRequest = (data: any) => {
  return `
<h2>Feature Request: ${data.title}</h2>
<p><strong>Submitted:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
<p><strong>Priority:</strong> ${data.priority}</p>
${data.email ? `<p><strong>Contact Email:</strong> ${data.email}</p>` : ''}

<h3>Description</h3>
<p>${data.description}</p>

${data.useCase ? `
<h3>Use Case</h3>
<p>${data.useCase}</p>
` : ''}

<hr>
<p><em>This feature request was automatically generated from GradeFlow Help system.</em></p>
  `.trim();
};

// POST /api/feedback - Send feedback email
router.post('/', async (req, res) => {
  try {
    const { to, subject, type, data } = req.body;

    // Validate required fields
    if (!to || !subject || !type || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, subject, type, data'
      });
    }

    // Validate email address
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address'
      });
    }

    // Format email content based on type
    let htmlContent = '';
    if (type === 'bug') {
      htmlContent = formatBugReport(data);
    } else if (type === 'feature') {
      htmlContent = formatFeatureRequest(data);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid feedback type. Must be "bug" or "feature"'
      });
    }

    // Check if email is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log('Email not configured, logging feedback instead:', {
        to,
        subject,
        type,
        data
      });
      
      return res.json({
        success: true,
        message: 'Feedback received and logged successfully'
      });
    }

    // Create transporter and send email
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: to,
      subject: subject,
      html: htmlContent,
      replyTo: data.email || process.env.SMTP_USER
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Feedback sent successfully'
    });

  } catch (error) {
    console.error('Error sending feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send feedback'
    });
  }
});

export default router;