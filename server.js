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
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas Cloud Database');
    await seedDefaultOfficer();
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
  verdict: { type: String, enum: ['VERIFIED', 'REJECTED', 'PENDING'], required: true },
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

// ---------------------------------------------------
// 4. REST API ENDPOINTS FOR ANDROID APP
// ---------------------------------------------------

// ROOT CHECK
app.get('/', (req, res) => {
  res.send('🏛️ Nirikshak Legal Metrology API Server Running');
});

// A. OFFICER REGISTRATION
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, officerId, designation, jurisdiction } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const newUser = new User({
      name,
      email,
      password, // In production, hash with bcrypt.hash(password, 10)
      officerId: officerId || `DLN-INS-${Math.floor(1000 + Math.random() * 9000)}`,
      designation: designation || "Legal Metrology Inspector",
      jurisdiction: jurisdiction || "Delhi North"
    });

    await newUser.save();
    res.status(201).json({
      success: true,
      message: 'Officer account created successfully',
      user: {
        name: newUser.name,
        email: newUser.email,
        officerId: newUser.officerId,
        designation: newUser.designation
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

    const user = await User.findOne({ email });
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