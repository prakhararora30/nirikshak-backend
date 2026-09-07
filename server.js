require('dotenv').config();
const dns = require('dns');
// Set public DNS to prevent Windows/VPN querySrv ECONNREFUSED error
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

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
    await cleanupLegacyCollections();
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Warning:', err.message);
    console.warn('⚠️ Server remains running. If queries fail, check MongoDB Atlas Network Access (allow 0.0.0.0/0).');
  });

// Automatically drop legacy 'inspectionreports' collection so all reports are stored ONLY in 'reports'
async function cleanupLegacyCollections() {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    if (collections.some(c => c.name === 'inspectionreports')) {
      await mongoose.connection.db.dropCollection('inspectionreports');
      console.log("🧹 Dropped legacy 'inspectionreports' collection from MongoDB Atlas");
    }
  } catch (err) {
    console.warn('Legacy collection cleanup warning:', err.message);
  }
}

// ---------------------------------------------------
// 3. MONGOOSE DATA SCHEMAS
// ---------------------------------------------------

// User Schema (Flexible to read whatever fields exist in your MongoDB database)
const userSchema = new mongoose.Schema({
  username: { type: String },
  userId: { type: String },
  officerId: { type: String },
  name: { type: String },
  full_name: { type: String },
  email: { type: String },
  password: { type: String },
  password_hash: { type: String },
  role: { type: String },
  designation: { type: String },
  jurisdiction: { type: String },
  reports: { type: String }
}, { strict: false });

const User = mongoose.model('User', userSchema);

// Inspection Report Schema (Strictly bound to 'reports' collection)
const reportSchema = new mongoose.Schema({
  reportId: { type: String, sparse: true },
  referenceNo: { type: String },
  reference_no: { type: String },
  officerEmail: { type: String },
  officerId: { type: String },
  lmo_id: { type: String },
  filed_by: { type: String },
  jurisdictionId: { type: String },
  jurisdiction_id: { type: String },
  productName: { type: String },
  product_name: { type: String },
  productId: { type: String },
  brand: { type: String, default: "Generic" },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  complianceResult: { type: String, default: 'COMPLIANT' },
  compliance_result: { type: String, default: 'COMPLIANT' },
  verdict: { type: String, default: "PENDING" },
  imagesCount: { type: Number, default: 1 },
  evidenceImages: { type: Array, default: [] },
  evidence_images: { type: Array, default: [] },
  summary: { type: Object, default: {} },
  declarations: {
    mrpVerified: { type: Boolean, default: true },
    netQuantityVerified: { type: Boolean, default: true },
    countryOfOriginVerified: { type: Boolean, default: true }
  },
  remarks: { type: String, default: "Legal Metrology Inspection report filed" },
  fileUrl: { type: String, default: "" },
  file_url: { type: String },
  pdfUrl: { type: String },
  pdf_url: { type: String },
  cloudinaryUrl: { type: String },
  report_pdf_link: { type: String },
  directPdfUrl: { type: String },
  decisionReason: { type: String, default: null },
  decision_reason: { type: String, default: null },
  decidedBy: { type: String, default: null },
  decided_by: { type: String, default: null },
  decidedAt: { type: Date, default: null },
  decided_at: { type: Date, default: null },
  timestamp: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now }
}, { strict: false });

// Exclusively bind to 'reports' collection (NEVER 'inspectionreports')
const Report = mongoose.model('Report', reportSchema, 'reports');

// Jurisdiction Schema
const jurisdictionSchema = new mongoose.Schema({
  _id: { type: String },
  name: { type: String },
  code: { type: String },
  state: { type: String }
}, { strict: false });

const Jurisdiction = mongoose.model('Jurisdiction', jurisdictionSchema, 'jurisdictions');

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
    const { name, email, password, officerId, designation, jurisdiction, userId, username, full_name, role } = req.body;

    const existingUser = await User.findOne({
      $or: [
        { username: username || "" },
        { email: email || "" },
        { userId: userId || "" }
      ]
    });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username or Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username: username || userId || email,
      full_name: full_name || name || username,
      name: full_name || name || username,
      email: email || "",
      userId: userId || username || email || "",
      password_hash: hashedPassword,
      password,
      role: role || designation || "Legal Metrology Inspector",
      officerId: officerId || username || `DLN-INS-${Math.floor(1000 + Math.random() * 9000)}`,
      designation: role || designation || "Legal Metrology Inspector",
      jurisdiction: jurisdiction || "Delhi North"
    });

    await newUser.save();
    res.status(201).json({
      success: true,
      message: 'Officer account created successfully',
      user: {
        name: newUser.full_name || newUser.name,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        officerId: newUser.officerId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// B. OFFICER LOGIN (Queries Database for username, email, or userId with bcrypt password_hash support)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, userId, username, password } = req.body;
    const identifier = (username || email || userId || "").trim();

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database is still connecting or unreachable. Please check MongoDB Atlas Network Access (whitelist 0.0.0.0/0).'
      });
    }

    // Query user strictly from database by username, email, userId, officerId, or phone (case-insensitive)
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { userId: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { officerId: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { phone: identifier }
      ]
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Username / Official ID not found in database' });
    }

    // Check account status
    if (user.status && user.status.toLowerCase() !== 'active') {
      return res.status(403).json({ success: false, message: `Account status is '${user.status}'. Please contact system administrator.` });
    }

    // Verify Password: check bcrypt password_hash OR plain-text password
    let isPasswordValid = false;
    if (user.password_hash) {
      isPasswordValid = await bcrypt.compare(password, user.password_hash);
    } else if (user.password) {
      if (user.password === password) {
        isPasswordValid = true;
      } else {
        isPasswordValid = await bcrypt.compare(password, user.password).catch(() => false);
      }
    }

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Incorrect password. Please enter valid credentials.' });
    }

    // Resolve jurisdiction name from jurisdictions collection if jurisdiction_id exists
    let jurisdictionName = user.jurisdiction || 'Delhi North';
    if (user.jurisdiction_id) {
      try {
        const jur = await mongoose.connection.collection('jurisdictions').findOne({
          $or: [
            { _id: user.jurisdiction_id },
            { id: user.jurisdiction_id }
          ]
        });
        if (jur && (jur.name || jur.jurisdiction_name || jur.title)) {
          jurisdictionName = jur.name || jur.jurisdiction_name || jur.title;
        }
      } catch (_) {}
    }

    // Generate random 6-Digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Map designation nicely: LMO -> Legal Metrology Officer, CLM -> Chief Controller
    let designationDisplay = user.role || user.designation || 'Legal Metrology Officer';
    if (user.role === 'LMO') designationDisplay = 'Legal Metrology Officer (LMO)';
    if (user.role === 'CLM') designationDisplay = 'Chief Controller (CLM)';

    res.json({
      success: true,
      message: 'Login credentials verified. OTP generated.',
      otp: generatedOtp,
      user: {
        _id: user._id ? user._id.toString() : (user.id || 'b4b9c13e-b3fb-4603-a2c3-7b7516b4a33c'),
        id: user._id ? user._id.toString() : (user.id || 'b4b9c13e-b3fb-4603-a2c3-7b7516b4a33c'),
        name: user.full_name || user.name || user.username || 'Officer',
        username: user.username || user.userId || '',
        email: user.email || user.username || '',
        officerId: user.username || user.officerId || user.userId || 'LMO-01',
        designation: designationDisplay,
        jurisdiction: jurisdictionName,
        jurisdictionId: user.jurisdiction_id || user.jurisdictionId || '',
        phone: user.phone || '',
        reports: user.reports || ''
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// C. CREATE INSPECTION REPORT (Strictly saves / upserts into 'reports' collection)
app.post('/api/reports/create', async (req, res) => {
  try {
    const {
      officerEmail,
      officerId,
      jurisdictionId,
      reportId,
      referenceNo,
      productName,
      brand,
      status,
      complianceResult,
      verdict,
      imagesCount,
      declarations,
      remarks,
      fileUrl
    } = req.body;

    const generatedReportId = reportId || referenceNo || `REP-${Date.now()}`;
    const initialStatus = status || (verdict && ['APPROVED', 'VERIFIED'].includes(verdict.toUpperCase()) ? 'approved' : verdict === 'REJECTED' ? 'rejected' : 'pending');

    // Check if report already exists in 'reports' collection
    let report = await Report.findOne({
      $or: [
        { reportId: generatedReportId },
        { referenceNo: generatedReportId },
        { reference_no: generatedReportId },
        ...(mongoose.Types.ObjectId.isValid(generatedReportId) ? [{ _id: generatedReportId }] : [])
      ]
    });

    if (report) {
      if (officerEmail) report.officerEmail = officerEmail;
      if (officerId) { report.officerId = officerId; report.lmo_id = officerId; report.filed_by = officerId; }
      if (jurisdictionId) { report.jurisdictionId = jurisdictionId; report.jurisdiction_id = jurisdictionId; }
      if (productName) { report.productName = productName; report.product_name = productName; }
      if (brand) report.brand = brand;
      if (status) report.status = status.toLowerCase();
      if (complianceResult) { report.complianceResult = complianceResult; report.compliance_result = complianceResult; }
      if (verdict) report.verdict = verdict;
      if (fileUrl) { report.fileUrl = fileUrl; report.pdfUrl = fileUrl; }
      if (declarations) report.declarations = declarations;
      if (remarks) report.remarks = remarks;
      await report.save();
    } else {
      report = new Report({
        reportId: generatedReportId,
        referenceNo: generatedReportId,
        reference_no: generatedReportId,
        officerEmail: officerEmail || '',
        officerId: officerId || 'LMO-01',
        lmo_id: officerId || 'LMO-01',
        filed_by: officerId || 'LMO-01',
        jurisdictionId: jurisdictionId || '',
        jurisdiction_id: jurisdictionId || '',
        productName: productName || 'Packaged Commodity',
        product_name: productName || 'Packaged Commodity',
        brand: brand || "Generic",
        status: initialStatus,
        complianceResult: complianceResult || "COMPLIANT",
        compliance_result: complianceResult || "COMPLIANT",
        verdict: verdict || "PENDING",
        imagesCount: imagesCount || 1,
        declarations,
        remarks: remarks || "Statutory inspection filed in reports collection",
        fileUrl: fileUrl || "",
        pdfUrl: fileUrl || ""
      });
      await report.save();
    }

    res.status(201).json({
      success: true,
      message: 'Inspection report filed in reports collection',
      report
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// D. FETCH ALL REPORTS (Exclusively from 'reports' collection)
// D. FETCH ALL REPORTS (Filtered strictly by LMO ID: defaults to 'b4b9c13e-b3fb-4603-a2c3-7b7516b4a33c')
app.get('/api/reports', async (req, res) => {
  try {
    const targetLmoId = (req.query.lmo_id || req.query.officerId || req.query.filed_by || 'b4b9c13e-b3fb-4603-a2c3-7b7516b4a33c').trim();

    const filter = {
      $or: [
        { lmo_id: targetLmoId },
        { filed_by: targetLmoId },
        { officerId: targetLmoId }
      ]
    };

    const dbReports = await Report.find(filter).sort({ created_at: -1, timestamp: -1, _id: -1 }).lean();

    const formattedDbReports = dbReports.map(r => {
      const realPdfUrl = r.pdfUrl || r.pdf_url || r.cloudinaryUrl || r.report_pdf_link || r.directPdfUrl || r.fileUrl || r.file_url || "";
      const prodName = r.productName || r.product_name || r.title || "Packaged Commodity Audit.pdf";
      const repId = r.reportId || r.referenceNo || r.reference_no || (r._id ? r._id.toString() : "REP-OFFICIAL");
      const statusVal = (r.status || (r.verdict && ['APPROVED', 'VERIFIED'].includes(r.verdict.toUpperCase()) ? 'approved' : r.verdict === 'REJECTED' ? 'rejected' : 'pending')).toLowerCase();
      const compVal = r.complianceResult || r.compliance_result || "COMPLIANT";

      return {
        _id: r._id ? r._id.toString() : repId,
        id: r._id ? r._id.toString() : repId,
        reportId: repId,
        referenceNo: r.referenceNo || r.reference_no || repId,
        reference_no: r.reference_no || r.referenceNo || repId,
        officerEmail: r.officerEmail || r.created_by || "prakhar.arora2877@gmail.com",
        officerId: r.officerId || r.lmo_id || r.filed_by || targetLmoId,
        lmo_id: r.lmo_id || r.filed_by || targetLmoId,
        filed_by: r.filed_by || r.lmo_id || targetLmoId,
        jurisdictionId: r.jurisdictionId || r.jurisdiction_id || "",
        jurisdiction_id: r.jurisdiction_id || r.jurisdictionId || "",
        productName: prodName,
        product_name: prodName,
        brand: r.brand || "Rule 6 / Rule 9 Act",
        status: statusVal,
        complianceResult: compVal,
        compliance_result: compVal,
        verdict: r.verdict || statusVal.toUpperCase(),
        imagesCount: r.imagesCount || 1,
        decisionReason: r.decisionReason || r.decision_reason || null,
        decision_reason: r.decision_reason || r.decisionReason || null,
        decidedBy: r.decidedBy || r.decided_by || null,
        decided_by: r.decided_by || r.decidedBy || null,
        decidedAt: r.decidedAt || r.decided_at || null,
        decided_at: r.decided_at || r.decidedAt || null,
        fileUrl: realPdfUrl,
        file_url: realPdfUrl,
        pdfUrl: realPdfUrl,
        pdf_url: realPdfUrl,
        cloudinaryUrl: r.cloudinaryUrl || realPdfUrl,
        report_pdf_link: r.report_pdf_link || realPdfUrl,
        directPdfUrl: r.directPdfUrl || (realPdfUrl ? realPdfUrl : `https://nirikshak-api.duckdns.org/api/v1/reports/${repId}/pdf`),
        remarks: r.remarks || "Legal Metrology Packaged Commodities Rule Inspection",
        timestamp: r.timestamp || r.createdAt || r.created_at || new Date(),
        created_at: r.created_at || r.createdAt || r.timestamp || new Date()
      };
    });

    res.json({
      success: true,
      count: formattedDbReports.length,
      reports: formattedDbReports
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// STATUTORY SECTION 3: GET SINGLE REPORT STATUTORY STATUS & AC DECISION
// GET /api/v1/reports/:id
app.get('/api/v1/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let report = await Report.findOne({
      $or: [
        { reportId: id },
        { referenceNo: id },
        { reference_no: id },
        ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }] : [])
      ]
    }).lean();

    if (!report) {
      return res.status(404).json({ success: false, message: `Report ${id} not found` });
    }

    const realPdfUrl = report.pdfUrl || report.pdf_url || report.cloudinaryUrl || report.report_pdf_link || report.directPdfUrl || report.fileUrl || report.file_url || "";
    const repId = report.reportId || report.referenceNo || report.reference_no || (report._id ? report._id.toString() : id);

    res.json({
      success: true,
      data: {
        reportId: repId,
        referenceNo: report.referenceNo || report.reference_no || repId,
        reference_no: report.reference_no || report.referenceNo || repId,
        productName: report.productName || report.product_name,
        product_name: report.productName || report.product_name,
        status: report.status,
        complianceResult: report.complianceResult || report.compliance_result,
        officerId: report.officerId || report.lmo_id || report.filed_by,
        lmo_id: report.lmo_id || report.filed_by || report.officerId,
        jurisdictionId: report.jurisdictionId || report.jurisdiction_id,
        decisionReason: report.decisionReason || report.decision_reason,
        decidedBy: report.decidedBy || report.decided_by,
        decidedAt: report.decidedAt || report.decided_at,
        fileUrl: realPdfUrl,
        pdfUrl: realPdfUrl,
        cloudinaryUrl: report.cloudinaryUrl || realPdfUrl,
        report_pdf_link: report.report_pdf_link || realPdfUrl,
        directPdfUrl: report.directPdfUrl || (realPdfUrl ? realPdfUrl : `https://nirikshak-api.duckdns.org/api/v1/reports/${repId}/pdf`)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// STATUTORY SECTION 4: INSPECTOR'S OWN REPORTS LIST API
// GET /api/inspector/reports
app.get('/api/inspector/reports', async (req, res) => {
  try {
    const targetLmoId = (req.query.lmo_id || req.query.officerId || req.query.filed_by || 'b4b9c13e-b3fb-4603-a2c3-7b7516b4a33c').trim();

    const filter = {
      $or: [
        { lmo_id: targetLmoId },
        { filed_by: targetLmoId },
        { officerId: targetLmoId }
      ]
    };

    const reports = await Report.find(filter).sort({ created_at: -1, timestamp: -1, _id: -1 }).lean();

    const formattedReports = reports.map(r => {
      const realPdfUrl = r.pdfUrl || r.pdf_url || r.cloudinaryUrl || r.report_pdf_link || r.directPdfUrl || r.fileUrl || r.file_url || "";
      const repId = r.reportId || r.referenceNo || r.reference_no || (r._id ? r._id.toString() : "REP-OFFICIAL");
      const prodName = r.productName || r.product_name || "Packaged Commodity Audit.pdf";

      return {
        _id: r._id ? r._id.toString() : repId,
        id: r._id ? r._id.toString() : repId,
        reportId: repId,
        referenceNo: r.referenceNo || r.reference_no || repId,
        reference_no: r.reference_no || r.referenceNo || repId,
        productName: prodName,
        product_name: prodName,
        status: r.status,
        complianceResult: r.complianceResult || r.compliance_result || "COMPLIANT",
        officerId: r.officerId || r.lmo_id || r.filed_by || targetLmoId,
        lmo_id: r.lmo_id || r.filed_by || targetLmoId,
        filed_by: r.filed_by || r.lmo_id || targetLmoId,
        jurisdictionId: r.jurisdictionId || r.jurisdiction_id,
        decisionReason: r.decisionReason || r.decision_reason,
        decidedBy: r.decidedBy || r.decided_by,
        decidedAt: r.decidedAt || r.decided_at,
        fileUrl: realPdfUrl,
        pdfUrl: realPdfUrl,
        cloudinaryUrl: r.cloudinaryUrl || realPdfUrl,
        report_pdf_link: r.report_pdf_link || realPdfUrl,
        directPdfUrl: r.directPdfUrl || (realPdfUrl ? realPdfUrl : `https://nirikshak-api.duckdns.org/api/v1/reports/${repId}/pdf`),
        timestamp: r.timestamp || r.createdAt || r.created_at || new Date()
      };
    });

    res.json({
      success: true,
      count: formattedReports.length,
      reports: formattedReports,
      data: formattedReports
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ASSISTANT CONTROLLER WORKFLOW SIMULATION ENDPOINT
// POST /api/v1/reports/:id/decide
app.post('/api/v1/reports/:id/decide', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, decisionReason, decidedBy } = req.body;

    if (!status || !['approved', 'rejected', 'pending'].includes(status.toLowerCase())) {
      return res.status(400).json({ success: false, message: "Valid status required ('approved', 'rejected', or 'pending')" });
    }

    let report = await Report.findOne({
      $or: [
        { reportId: id },
        { referenceNo: id },
        { reference_no: id },
        ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }] : [])
      ]
    });

    if (!report) {
      return res.status(404).json({ success: false, message: `Report ${id} not found` });
    }

    report.status = status.toLowerCase();
    report.verdict = status.toUpperCase();
    report.decisionReason = decisionReason || (status.toLowerCase() === 'rejected' ? 'Statutory rejection by Assistant Controller' : null);
    report.decidedBy = decidedBy || 'Assistant Controller';
    report.decidedAt = status.toLowerCase() === 'pending' ? null : new Date();

    await report.save();

    res.json({
      success: true,
      message: `Report ${report.reportId} updated to ${report.status}`,
      data: {
        reportId: report.reportId,
        referenceNo: report.referenceNo,
        productName: report.productName,
        status: report.status,
        complianceResult: report.complianceResult,
        decisionReason: report.decisionReason,
        decidedBy: report.decidedBy,
        decidedAt: report.decidedAt,
        pdfUrl: report.fileUrl
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// E. GET OFFICER PROFILE (Fetches Officer Details from Database)
app.get('/api/officer/profile', async (req, res) => {
  try {
    const { identifier } = req.query;
    let user = null;

    if (identifier && identifier.trim()) {
      const id = identifier.trim();
      user = await User.findOne({
        $or: [
          { username: { $regex: new RegExp(`^${id}$`, 'i') } },
          { email: { $regex: new RegExp(`^${id}$`, 'i') } },
          { userId: { $regex: new RegExp(`^${id}$`, 'i') } },
          { officerId: { $regex: new RegExp(`^${id}$`, 'i') } },
          { phone: id }
        ]
      });
    }

    // Fallback: If no identifier or not found, return active officer from database
    if (!user) {
      user = await User.findOne({
        $or: [
          { status: { $regex: new RegExp('^active$', 'i') } },
          { role: { $exists: true } }
        ]
      });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Officer not found in database' });
    }

    // Resolve jurisdiction name
    let jurisdictionName = user.jurisdiction || 'Delhi North';
    if (user.jurisdiction_id) {
      try {
        const jur = await mongoose.connection.collection('jurisdictions').findOne({
          $or: [
            { _id: user.jurisdiction_id },
            { id: user.jurisdiction_id }
          ]
        });
        if (jur && (jur.name || jur.jurisdiction_name || jur.title)) {
          jurisdictionName = jur.name || jur.jurisdiction_name || jur.title;
        }
      } catch (_) {}
    }

    // Format designation
    let designationDisplay = user.role || user.designation || 'Legal Metrology Officer';
    if (user.role === 'LMO') designationDisplay = 'Legal Metrology Officer (LMO)';
    if (user.role === 'CLM') designationDisplay = 'Chief Controller (CLM)';
    if (user.role === 'AC') designationDisplay = 'Assistant Controller (AC)';

    res.json({
      success: true,
      officer: {
        name: user.full_name || user.name || user.username || 'Officer',
        username: user.username || user.userId || '',
        email: user.email || user.username || '',
        officerId: user.username || user.officerId || user.userId || 'LMO-01',
        designation: designationDisplay,
        jurisdiction: jurisdictionName,
        phone: user.phone || '',
        reports: user.reports || ''
      }
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