const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB:", err));

// Define Mongoose Schemas and Models

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true }, // 'student', 'counselor', or 'admin'
  }, { timestamps: true });

const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rollNumber: { type: String, required: true, unique: true },
    registrationNumber: { type: String, required: true, unique: true },
    year: { type: Number, required: true },
    password: { type: String, required: true },
    counselor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Reference to User
  }, { timestamps: true });

const leaveRequestSchema = new mongoose.Schema({
  reason: String,
  startDate: Date,
  endDate: Date,
  status: { type: String, default: "pending" },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Student = mongoose.model("Student", studentSchema);
const LeaveRequest = mongoose.model("LeaveRequest", leaveRequestSchema);

const app = express();
app.use(bodyParser.json());

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Endpoints

// Register Student
app.post("/students/register", async (req, res) => {
  const { name, rollNumber, registrationNumber, year, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const student = await Student.create({
      name,
      rollNumber,
      registrationNumber,
      year,
      password: hashedPassword,
    });

    res.status(201).json({ message: "Student registered successfully", student });
  } catch (error) {
    res.status(500).json({ error: "Error registering student", details: error.message });
  }
});

// Get Student by Roll Number
app.get("/students/:rollNumber", async (req, res) => {
  const { rollNumber } = req.params;

  try {
    const student = await Student.findOne({ rollNumber }).populate("counselorId");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.status(200).json(student);
  } catch (error) {
    res.status(500).json({ error: "Error fetching student", details: error.message });
  }
});

// Assign Counselor
app.put("/students/:rollNumber/assign-counselor", async (req, res) => {
  const { rollNumber } = req.params;
  const { counselorId } = req.body;

  try {
    const counselor = await User.findById(counselorId);

    if (!counselor || counselor.role !== "counselor") {
      return res.status(400).json({ error: "Invalid counselor ID" });
    }

    const student = await Student.findOneAndUpdate(
      { rollNumber },
      { counselorId },
      { new: true }
    );

    res.status(200).json({ message: "Counselor assigned successfully", student });
  } catch (error) {
    res.status(500).json({ error: "Error assigning counselor", details: error.message });
  }
});

// Register User
app.post("/users/register", async (req, res) => {
  const { name, email, role, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      role,
      password: hashedPassword,
    });

    res.status(201).json({ message: "User registered successfully", user });
  } catch (error) {
    res.status(500).json({ error: "Error registering user", details: error.message });
  }
});

// Login for Students
app.post("/students/login", async (req, res) => {
  const { rollNumber, password } = req.body;

  try {
    const student = await Student.findOne({ rollNumber });

    if (!student || !(await bcrypt.compare(password, student.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.status(200).json({ message: "Login successful", rollNumber: student.rollNumber });
  } catch (error) {
    res.status(500).json({ error: "Error logging in", details: error.message });
  }
});

// Login for Users
app.post("/users/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.status(200).json({ message: "Login successful", userId: user._id, role: user.role });
  } catch (error) {
    res.status(500).json({ error: "Error logging in", details: error.message });
  }
});

// Fetch Leave Requests
app.get("/leave-requests", async (req, res) => {
  const { counselorId } = req.query;

  try {
    const leaveRequests = await LeaveRequest.find({
      studentId: { $in: await Student.find({ counselorId }).distinct("_id") },
    }).populate("studentId");

    res.status(200).json(leaveRequests);
  } catch (error) {
    res.status(500).json({ error: "Error fetching leave requests", details: error.message });
  }
});

app.get("/students", async (req, res) => {
    const { year, counselorId } = req.query;
  
    try {
      // Fetch students with optional filters
      const students = await Student.find({
        ...(year && { year: parseInt(year) }), // Filter by year if provided
        ...(counselorId && { counselorId }),  // Filter by counselorId if provided
      }).populate("counselor"); // Populate the counselor details
  
      res.status(200).json(students); // Return all matching students
    } catch (error) {
      res.status(500).json({
        error: "Error fetching students",
        details: error.message,
      });
    }
  });
  
  
  // **Route: Get all leave requests for a counselor**
  app.get("/leave-requests", async (req, res) => {
    const { counselorId } = req.query;
  
    try {
      // Validate that the counselorId exists
      const counselor = await User.findById(counselorId);
      if (!counselor || counselor.role !== "counselor") {
        return res.status(404).json({ error: "Counselor not found or not authorized" });
      }
  
      // Find students assigned to this counselor
      const students = await Student.find({ counselorId });
  
      // Fetch leave requests for these students
      const leaveRequests = await LeaveRequest.find({
        student: { $in: students.map((s) => s._id) },
      }).populate("student"); // Include student details
  
      res.status(200).json(leaveRequests);
    } catch (error) {
      res.status(500).json({
        error: "Error fetching leave requests",
        details: error.message,
      });
    }
  });
  
  
  // **Route: Get all users**
  app.get("/users", async (req, res) => {
    const { role } = req.query;
  
    try {
      // Fetch users with optional role filter
      const users = await User.find(role ? { role } : {});
  
      res.status(200).json(users); // Return all matching users
    } catch (error) {
      res.status(500).json({
        error: "Error fetching users",
        details: error.message,
      });
    }
  });
  
  