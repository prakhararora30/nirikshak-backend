require('dotenv').config();
const dns = require('dns');
// Set public DNS to prevent Windows/VPN querySrv ECONNREFUSED error
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// ---------------------------------------------------
// 1. MIDDLEWARES
// ---------------------------------------------------
app.use(express.json()); // Parses incoming JSON bodies
app.use(cors());         // Enables Cross-Origin requests for Android app

// ---------------------------------------------------
// 2. CONNECT TO MONGODB ATLAS
// ---------------------------------------------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://preetsain0306_db_user:c4i71ZBFcWpok8sh@cluster0.f8zmc3h.mongodb.net/nirikshak_db?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas Cloud Database');
    await seedDefaultOfficer();
    await seedDefaultReports();
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// ---------------------------------------------------
// 3. MONGOOSE DATA SCHEMAS
// ---------------------------------------------------

// User Schema (Officer / Inspector)
const userSchema = new mongoose.Schema({
  officerId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  designation: { type: String, default: "Legal Metrology Inspector" },
  jurisdiction: { type: String, default: "Delhi North" },
  reports: { type: String, default: "https://res.cloudinary.com/h4vwjif7/raw/upload/v1788366925/rns-bills/1788366925033-c33496b597c3.pdf" },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Inspection Report Schema
const reportSchema = new mongoose.Schema({
  officerEmail: { type: String, required: true },
  productName: { type: String, required: true },
  brand: { type: String, default: "Generic" },
  verdict: { type: String, enum: ['VERIFIED', 'APPROVED', 'REJECTED', 'PENDING', 'FILED', 'OVERRULED', 'ACTION TAKEN'], required: true },
  imagesCount: { type: Number, default: 1 },
  declarations: {
    mrpVerified: { type: Boolean, default: true },
    netQuantityVerified: { type: Boolean, default: true },
    countryOfOriginVerified: { type: Boolean, default: true }
  },
  remarks: { type: String, default: "Compliant under Rule 6 of Metrology Act" },
  fileUrl: { type: String, default: "https://res.cloudinary.com/h4vwjif7/raw/upload/v1788366925/rns-bills/1788366925033-c33496b597c3.pdf" },
  timestamp: { type: Date, default: Date.now }
});

const InspectionReport = mongoose.model('InspectionReport', reportSchema);

// Auto-seed default officer if not exists in MongoDB Atlas
async function seedDefaultOfficer() {
  try {
    const existing = await User.findOne({ email: 'amit.kumar@gov.in' });
    if (!existing) {
      await User.create({
        name: 'Amit Kumar',
        email: 'amit.kumar@gov.in',
        password: 'admin123',
        officerId: 'DLN-INS-0254',
        designation: 'Legal Metrology Inspector',
        jurisdiction: 'Delhi North'
      });
      console.log('👤 Automatically seeded default officer: amit.kumar@gov.in / admin123');
    } else {
      console.log('👤 Default officer amit.kumar@gov.in verified in database');
    }
  } catch (err) {
    console.error('Seed check warning:', err.message);
  }
}

// Auto-seed default inspection reports into MongoDB Atlas if collection is empty
async function seedDefaultReports() {
  try {
    const count = await InspectionReport.countDocuments();
    if (count === 0) {
      const sampleReports = [
        {
          officerEmail: 'amit.kumar@gov.in',
          productName: 'Report_DLN_2026_0902.pdf',
          brand: 'Rule 6 Act',
          verdict: 'APPROVED',
          imagesCount: 2,
          declarations: { mrpVerified: true, netQuantityVerified: true, countryOfOriginVerified: true },
          remarks: 'Mandatory declarations fully compliant with Legal Metrology Rules',
          fileUrl: 'https://res.cloudinary.com/h4vwjif7/raw/upload/v1788366925/rns-bills/1788366925033-c33496b597c3.pdf'
        },
        {
          officerEmail: 'amit.kumar@gov.in',
          productName: 'Compliance_Audit_Commodities_89.pdf',
          brand: 'Rule 9 Act',
          verdict: 'APPROVED',
          imagesCount: 3,
          declarations: { mrpVerified: true, netQuantityVerified: true, countryOfOriginVerified: true },
          remarks: 'Principal display area sizing and unit sale price compliant',
          fileUrl: 'https://res.cloudinary.com/h4vwjif7/raw/upload/v1788366925/rns-bills/1788366925033-c33496b597c3.pdf'
        },
        {
          officerEmail: 'amit.kumar@gov.in',
          productName: 'Packaged_Commodities_Audit_DelhiNorth.pdf',
          brand: 'Legal Metrology',
          verdict: 'VERIFIED',
          imagesCount: 1,
          declarations: { mrpVerified: true, netQuantityVerified: true, countryOfOriginVerified: true },
          remarks: 'Statutory verification completed with clearance certificate',
          fileUrl: 'https://res.cloudinary.com/h4vwjif7/raw/upload/v1788366925/rns-bills/1788366925033-c33496b597c3.pdf'
        },
        {
          officerEmail: 'amit.kumar@gov.in',
          productName: 'Inspection_Summary_Week35.pdf',
          brand: 'Rule 6 Act',
          verdict: 'PENDING',
          imagesCount: 2,
          declarations: { mrpVerified: true, netQuantityVerified: false, countryOfOriginVerified: true },
          remarks: 'Net quantity verification pending laboratory measurement check',
          fileUrl: 'https://res.cloudinary.com/h4vwjif7/raw/upload/v1788366925/rns-bills/1788366925033-c33496b597c3.pdf'
        },
        {
          officerEmail: 'amit.kumar@gov.in',
          productName: 'Rule6_Packaging_Violations_Audit.pdf',
          brand: 'Rule 6 Act',
          verdict: 'REJECTED',
          imagesCount: 2,
          declarations: { mrpVerified: false, netQuantityVerified: true, countryOfOriginVerified: false },
          remarks: 'MRP font height violation and missing manufacturer address details',
          fileUrl: 'https://res.cloudinary.com/h4vwjif7/raw/upload/v1788366925/rns-bills/1788366925033-c33496b597c3.pdf'
        }
      ];
      await InspectionReport.insertMany(sampleReports);
      console.log('📋 Automatically seeded default inspection reports into MongoDB Atlas');
    } else {
      console.log(`📋 Found ${count} inspection reports in MongoDB Atlas`);
    }
  } catch (err) {
    console.error('Seed reports check warning:', err.message);
  }
}

// ---------------------------------------------------
// 4. REST API ENDPOINTS FOR ANDROID APP
// ---------------------------------------------------

// ROOT CHECK
app.get('/', (req, res) => {
  res.send('🏛️ Nirikshak Legal Metrology API Server Running');
});

// A. OFFICER REGISTRATION (Sign Up)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, officerId, designation, jurisdiction } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Officer name is required' });
    }
    if (!email || !email.trim() || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid official email ID is required' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ success: false, message: 'Password must be at least 4 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Official email ID already registered in database' });
    }

    const assignedOfficerId = officerId && officerId.trim().length > 0
      ? officerId.trim()
      : `DLN-INS-${Math.floor(1000 + Math.random() * 9000)}`;

    const newUser = new User({
      name: name.trim(),
      email: normalizedEmail,
      password, // In production, hash with bcrypt.hash(password, 10)
      officerId: assignedOfficerId,
      designation: designation && designation.trim().length > 0 ? designation.trim() : "Legal Metrology Inspector",
      jurisdiction: jurisdiction && jurisdiction.trim().length > 0 ? jurisdiction.trim() : "Delhi North"
    });

    await newUser.save();

    // Generate random 6-Digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    res.status(201).json({
      success: true,
      message: 'Officer account created successfully. Verification OTP generated.',
      otp: generatedOtp,
      user: {
        name: newUser.name,
        email: newUser.email,
        officerId: newUser.officerId,
        designation: newUser.designation,
        jurisdiction: newUser.jurisdiction,
        reports: newUser.reports
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// B. OFFICER LOGIN (Sends OTP)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Official email ID not found' });
    }

    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    // Generate random 6-Digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    res.json({
      success: true,
      message: 'Login credentials verified. OTP generated.',
      otp: generatedOtp,
      user: {
        name: user.name,
        email: user.email,
        officerId: user.officerId,
        designation: user.designation,
        jurisdiction: user.jurisdiction,
        reports: user.reports
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// C. CREATE INSPECTION REPORT
app.post('/api/reports/create', async (req, res) => {
  try {
    const { officerEmail, productName, brand, verdict, imagesCount, declarations, remarks, fileUrl } = req.body;

    const report = new InspectionReport({
      officerEmail,
      productName,
      brand,
      verdict,
      imagesCount,
      declarations,
      remarks,
      fileUrl: fileUrl || "https://res.cloudinary.com/h4vwjif7/raw/upload/v1788366925/rns-bills/1788366925033-c33496b597c3.pdf"
    });

    await report.save();
    res.status(201).json({
      success: true,
      message: 'Inspection report saved to MongoDB Atlas',
      report
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// D. FETCH ALL REPORTS
app.get('/api/reports', async (req, res) => {
  try {
    const inspectionReports = await InspectionReport.find().sort({ timestamp: -1 });

    // Also fetch reports attached to officers in MongoDB
    const usersWithReports = await User.find({ reports: { $exists: true, $ne: "" } });
    const userReportsList = usersWithReports.map(u => ({
      _id: u._id,
      officerEmail: u.email,
      productName: `${u.name}'s Metrology Audit Report.pdf`,
      brand: "Rule 6 Act",
      verdict: "APPROVED",
      imagesCount: 1,
      fileUrl: u.reports,
      remarks: "Official verified legal metrology report",
      timestamp: u.createdAt || new Date()
    }));

    const allReports = [...userReportsList, ...inspectionReports];

    res.json({
      success: true,
      count: allReports.length,
      reports: allReports
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------
// 5. START EXPRESS SERVER
// ---------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`===========================================`);
  console.log(`🚀 Nirikshak Backend running on port ${PORT}`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`📱 Android Emulator URL: http://10.0.2.2:${PORT}`);
  console.log(`===========================================`);
});