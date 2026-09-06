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
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas Cloud Database');
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// ---------------------------------------------------
// 3. MONGOOSE DATA SCHEMAS
// ---------------------------------------------------

// User Schema (Flexible to read whatever fields exist in your MongoDB database)
const userSchema = new mongoose.Schema({
  userId: { type: String },
  officerId: { type: String },
  name: { type: String },
  email: { type: String },
  password: { type: String, required: true },
  designation: { type: String },
  jurisdiction: { type: String },
  reports: { type: String }
}, { strict: false });

const User = mongoose.model('User', userSchema);

// Inspection Report Schema
const reportSchema = new mongoose.Schema({
  officerEmail: { type: String },
  productName: { type: String, required: true },
  brand: { type: String, default: "Generic" },
  verdict: { type: String, default: "VERIFIED" },
  imagesCount: { type: Number, default: 1 },
  declarations: {
    mrpVerified: { type: Boolean, default: true },
    netQuantityVerified: { type: Boolean, default: true },
    countryOfOriginVerified: { type: Boolean, default: true }
  },
  remarks: { type: String, default: "Compliant under Rule 6 of Metrology Act" },
  fileUrl: { type: String, default: "https://res.cloudinary.com/h4vwjif7/raw/upload/v1788366925/rns-bills/1788366925033-c33496b597c3.pdf" },
  timestamp: { type: Date, default: Date.now }
}, { strict: false });

const InspectionReport = mongoose.model('InspectionReport', reportSchema);

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
    const { name, email, password, officerId, designation, jurisdiction, userId } = req.body;

    const existingUser = await User.findOne({
      $or: [
        { email: email || "" },
        { userId: userId || "" }
      ]
    });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User ID or Email already registered' });
    }

    const newUser = new User({
      name: name || userId || email,
      email: email || "",
      userId: userId || email || "",
      password,
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
        userId: newUser.userId,
        officerId: newUser.officerId,
        designation: newUser.designation
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// B. OFFICER LOGIN (Queries Database for userId or email)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, userId, password } = req.body;
    const identifier = (email || userId || "").trim();

    // Query user strictly from database by email, userId, or officerId (case-insensitive)
    const user = await User.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { userId: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { officerId: { $regex: new RegExp(`^${identifier}$`, 'i') } }
      ]
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User ID / Official email not found in database' });
    }

    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Incorrect password. Please enter valid credentials.' });
    }

    // Generate random 6-Digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    res.json({
      success: true,
      message: 'Login credentials verified. OTP generated.',
      otp: generatedOtp,
      user: {
        name: user.name || user.userId || user.email?.split('@')[0] || 'Inspector',
        email: user.email || user.userId || '',
        officerId: user.officerId || user.userId || 'DLN-001',
        designation: user.designation || 'Legal Metrology Inspector',
        jurisdiction: user.jurisdiction || 'Headquarters',
        reports: user.reports || ''
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