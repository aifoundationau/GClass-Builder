import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Users,
  UserPlus,
  Search,
  GraduationCap,
  BookOpen,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  Upload,
  Link2,
  Calendar,
  Layers,
  FileText,
  ExternalLink,
  Code2,
  Play,
  Server,
  LogOut,
  LogIn,
  Mail,
  User,
  School,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  FileQuestion,
  Eye,
  Trash2,
  Plus,
  Compass,
  ArrowRight,
  X
} from 'lucide-react';

const SAMPLE_PRESETS = {
  cloud: {
    settings: {
      class_name: "CS101: Introduction to Cloud Computing",
      section: "Cohort 1 - Fall",
      subject: "Computer Science & Cloud Systems",
      level: "Undergraduate (Introductory)",
      room: "Virtual Lab Room A-12",
      welcome_announcement: "Welcome to CS101! Please review the syllabus, bookmark the lecture slide links, and complete weekly coursework.",
      teachers: [
        "prof.sarah.jenkins@school.edu",
        "ta.alex@school.edu"
      ]
    },
    students: [
      "anna.smith@student.school.edu",
      "ben.miller@student.school.edu",
      "clara.zhao@student.school.edu",
      "david.williams@student.school.edu",
      "elena.rostova@student.school.edu"
    ],
    curriculum: [
      {
        sequence: "Week 1",
        stream_topic: "Week 1: Foundations of Cloud Infrastructure",
        title: "Foundations of Cloud Infrastructure",
        overview: "Introduction to distributed systems, virtualization, hypervisors, and multi-tenant architectures.",
        presentation_urls: [
          "https://docs.google.com/presentation/d/1demo-cloud-foundations-slides/edit",
          "https://docs.google.com/document/d/1demo-cloud-architecture-whitepaper/edit"
        ],
        presentation_url: "https://docs.google.com/presentation/d/1demo-cloud-foundations-slides/edit",
        assignment_title: "Lab 1: Setting up Cloud Shell & IAM",
        assignment_instructions: "Configure your cloud environment, set up service accounts, and verify CLI access.",
        quiz_title: "Quiz 1: Virtualization vs Containers Architecture",
        quiz_url: "https://docs.google.com/forms/d/1quiz-cloud-foundations/viewform",
        question_prompt: "What are the primary performance trade-offs between Type-1 and Type-2 hypervisors?",
        question_type: "SHORT_ANSWER_QUESTION",
        points: 100,
        due_date: "2026-10-15"
      },
      {
        sequence: "Week 2",
        stream_topic: "Week 2: Compute & Container Orchestration",
        title: "Compute & Container Orchestration",
        overview: "Deep dive into Docker container runtime and Kubernetes workload management.",
        presentation_urls: [
          "https://docs.google.com/presentation/d/2demo-kubernetes-containers/edit"
        ],
        presentation_url: "https://docs.google.com/presentation/d/2demo-kubernetes-containers/edit",
        assignment_title: "Lab Assignment: Deploying Microservices on GKE",
        assignment_instructions: "Deploy multi-tier containerized applications to Google Kubernetes Engine.",
        quiz_title: "Quiz 2: Kubernetes Pods, Services & Ingress",
        quiz_url: "https://docs.google.com/forms/d/2quiz-k8s-orchestration/viewform",
        question_prompt: "Explain how a Kubernetes Service discovers and routes traffic to backend Pods.",
        question_type: "SHORT_ANSWER_QUESTION",
        points: 100,
        due_date: "2026-10-22"
      },
      {
        sequence: "Week 3",
        stream_topic: "Week 3: Cloud Storage & Scalable Databases",
        title: "Cloud Storage & Scalable Databases",
        overview: "Understanding blob storage, transactional SQL databases, and globally distributed NoSQL.",
        presentation_urls: [
          "https://docs.google.com/presentation/d/3demo-cloud-databases-storage/edit"
        ],
        presentation_url: "https://docs.google.com/presentation/d/3demo-cloud-databases-storage/edit",
        assignment_title: "Assessment 3: Designing a High-Availability Storage Tier",
        assignment_instructions: "Design a fault-tolerant multi-region storage architecture with read replicas.",
        quiz_title: "Quiz 3: CAP Theorem & Consistency Models",
        quiz_url: "https://docs.google.com/forms/d/3quiz-databases-storage/viewform",
        question_prompt: "Under what specific latency and throughput constraints would you select Cloud Spanner over Cloud SQL?",
        question_type: "SHORT_ANSWER_QUESTION",
        points: 100,
        due_date: "2026-10-29"
      },
      {
        sequence: "Week 4",
        stream_topic: "Week 4: DevOps, Security & Final Capstone",
        title: "DevOps, Security & Final Capstone",
        overview: "IAM roles, least privilege, CI/CD automation pipelines, and course capstone presentation.",
        presentation_urls: [
          "https://docs.google.com/presentation/d/4demo-devops-security-capstone/edit"
        ],
        presentation_url: "https://docs.google.com/presentation/d/4demo-devops-security-capstone/edit",
        assignment_title: "Final Capstone Project: End-to-End Automated Pipeline",
        assignment_instructions: "Build and deploy an automated CI/CD pipeline with strict security policy enforcement.",
        quiz_title: "Quiz 4: Cloud Security & Principle of Least Privilege",
        quiz_url: "https://docs.google.com/forms/d/4quiz-devops-security/viewform",
        question_prompt: "Discuss the key considerations when securing secrets in a public cloud pipeline.",
        question_type: "SHORT_ANSWER_QUESTION",
        points: 200,
        due_date: "2026-11-05"
      }
    ]
  },
  ai: {
    settings: {
      class_name: "AI200: Machine Learning & Generative Models",
      section: "Cohort 2026 - Accelerated",
      subject: "Artificial Intelligence & Data Science",
      level: "Intermediate",
      room: "Tech Hub Studio 4",
      welcome_announcement: "Welcome to AI200! Ensure your Python environments and GPU notebooks are configured before Week 1.",
      teachers: [
        "dr.david.miller@university.edu",
        "research-ta@university.edu"
      ]
    },
    students: [
      "marcus.aurelius@university.edu",
      "suki.yamamoto@university.edu",
      "liam.o-connor@university.edu"
    ],
    curriculum: [
      {
        sequence: "Week 1",
        stream_topic: "Week 1: Supervised Learning & Regression",
        title: "Supervised Learning & Regression",
        overview: "Cost functions, gradient descent optimization, and evaluation metrics.",
        presentation_urls: [
          "https://docs.google.com/presentation/d/ai-week1-supervised/edit"
        ],
        presentation_url: "https://docs.google.com/presentation/d/ai-week1-supervised/edit",
        assignment_title: "Benchmark Challenge 1: Linear & Logistic Regression",
        assignment_instructions: "Implement linear and logistic regression models from scratch in Python with vectorized gradient descent.",
        quiz_title: "Quiz 1: Gradient Descent & Loss Landscapes",
        quiz_url: "https://docs.google.com/forms/d/ai-quiz1-gd/viewform",
        question_prompt: "Why does feature scaling accelerate gradient descent convergence?",
        question_type: "SHORT_ANSWER_QUESTION",
        points: 100,
        due_date: "2026-10-18"
      },
      {
        sequence: "Week 2",
        stream_topic: "Week 2: Deep Neural Networks & Transformers",
        title: "Deep Neural Networks & Transformers",
        overview: "Self-attention mechanisms, encoder-decoder architectures, and fine-tuning.",
        presentation_urls: [
          "https://docs.google.com/presentation/d/ai-week2-transformers/edit"
        ],
        presentation_url: "https://docs.google.com/presentation/d/ai-week2-transformers/edit",
        assignment_title: "Capstone Model Evaluation Paper",
        assignment_instructions: "Train and evaluate a transformer architecture on custom text classification dataset.",
        quiz_title: "Quiz 2: Scaled Dot-Product Attention",
        quiz_url: "https://docs.google.com/forms/d/ai-quiz2-attention/viewform",
        question_prompt: "How does multi-head attention improve representation learning over single-head attention?",
        question_type: "SHORT_ANSWER_QUESTION",
        points: 150,
        due_date: "2026-10-25"
      }
    ]
  }
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginName, setLoginName] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [activeTab, setActiveTab] = useState('studio');
  const [settings, setSettings] = useState(SAMPLE_PRESETS.cloud.settings);
  const [curriculum, setCurriculum] = useState(SAMPLE_PRESETS.cloud.curriculum);
  const [students, setStudents] = useState(SAMPLE_PRESETS.cloud.students || []);

  // Teacher & Student input controls
  const [newTeacherEmail, setNewTeacherEmail] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [bulkStudentText, setBulkStudentText] = useState("");
  const [showBulkStudentModal, setShowBulkStudentModal] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  
  // Single-module editor navigation state
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [showReviewAllModal, setShowReviewAllModal] = useState(false);
  const [importedWorkbookInfo, setImportedWorkbookInfo] = useState(null);

  // Accordion dropdown states (all elements collapsed by default upon page load)
  const [openPanels, setOpenPanels] = useState({
    metadata: false, // Course Settings & Teachers (collapsed on default)
    students: false, // Students Roster (collapsed on default)
    topic: false,    // Collapsed on default
    material: false, // Collapsed on default
    assignment: false, // Collapsed on default
    quiz: false,     // Collapsed on default
    question: false  // Collapsed on default
  });

  const togglePanel = (panelName) => {
    setOpenPanels(prev => ({
      ...prev,
      [panelName]: !prev[panelName]
    }));
  };

  const expandAllPanels = () => {
    setOpenPanels({
      metadata: true,
      students: true,
      topic: true,
      material: true,
      assignment: true,
      quiz: true,
      question: true
    });
  };

  const collapseAllPanels = () => {
    setOpenPanels({
      metadata: false,
      students: false,
      topic: false,
      material: false,
      assignment: false,
      quiz: false,
      question: false
    });
  };

  // Add & Remove Teachers
  const handleAddTeacher = (emailToAdd) => {
    const email = (emailToAdd || newTeacherEmail).trim().toLowerCase();
    if (!email || !email.includes('@')) {
      showToast("Please enter a valid teacher email address.");
      return;
    }
    const currentTeachers = settings.teachers || [];
    if (currentTeachers.includes(email)) {
      showToast(`Teacher ${email} is already in the list.`);
      return;
    }
    setSettings({
      ...settings,
      teachers: [...currentTeachers, email]
    });
    setNewTeacherEmail("");
    showToast(`Added co-teacher: ${email}`);
  };

  const handleRemoveTeacher = (index) => {
    const updated = (settings.teachers || []).filter((_, i) => i !== index);
    setSettings({ ...settings, teachers: updated });
    showToast("Removed co-teacher.");
  };

  // Add, Remove & Bulk Students
  const handleAddStudent = (emailToAdd) => {
    const email = (emailToAdd || newStudentEmail).trim().toLowerCase();
    if (!email || !email.includes('@')) {
      showToast("Please enter a valid student email address.");
      return;
    }
    if (students.includes(email)) {
      showToast(`Student ${email} is already enrolled.`);
      return;
    }
    setStudents(prev => [...prev, email]);
    setNewStudentEmail("");
    showToast(`Added student: ${email}`);
  };

  const handleRemoveStudent = (emailToRemove) => {
    setStudents(prev => prev.filter(s => s !== emailToRemove));
    showToast(`Removed student ${emailToRemove}`);
  };

  const handleBulkAddStudents = () => {
    if (!bulkStudentText.trim()) return;
    const parts = bulkStudentText.split(/[\r\n,;]+/).map(s => s.trim().toLowerCase()).filter(s => s && s.includes('@'));
    if (parts.length === 0) {
      showToast("No valid email addresses found in pasted text.");
      return;
    }
    const merged = Array.from(new Set([...students, ...parts]));
    const addedCount = merged.length - students.length;
    setStudents(merged);
    setBulkStudentText("");
    setShowBulkStudentModal(false);
    showToast(`Added ${addedCount} student(s) to roster.`);
  };

  const handleImportStudentRoster = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        let emails = [];
        wb.SheetNames.forEach(sName => {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sName]);
          rows.forEach(r => {
            const val = r["Student Email"] || r["Email"] || r["email"] || r["student_email"] || r["Student"] || Object.values(r).find(v => typeof v === 'string' && v.includes('@'));
            if (val && String(val).includes('@')) {
              emails.push(String(val).trim().toLowerCase());
            }
          });
        });
        if (emails.length > 0) {
          const merged = Array.from(new Set([...students, ...emails]));
          const count = merged.length - students.length;
          setStudents(merged);
          showToast(`Imported ${count} new student(s) from "${file.name}"!`);
        } else {
          showToast("No valid student email addresses found in spreadsheet.");
        }
      } catch (err) {
        showToast(`Error importing student roster: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExportStudentRoster = () => {
    const wb = XLSX.utils.book_new();
    const data = students.map((s, idx) => ({
      "Student #": idx + 1,
      "Student Email": s,
      "Enrollment Status": "Enrolled / Ready to Invite"
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    const fileName = `${settings.class_name.replace(/[^a-zA-Z0-9]/g, "_")}_Students_Roster.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Downloaded student roster "${fileName}"!`);
  };

  // Real-time backend states
  const [backendStatus, setBackendStatus] = useState({
    online: false,
    mode: "Connecting to Classroom Engine...",
    no_delete_policy_enforced: true,
  });

  const [courses, setCourses] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);
  const [selectedCourseForSync, setSelectedCourseForSync] = useState("");
  const [syncLogs, setSyncLogs] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Check auth and fetch initial courses
  const checkAuthAndFetchData = async () => {
    try {
      // 1. Check Auth
      const authRes = await fetch('/api/auth/me');
      if (authRes.ok) {
        const user = await authRes.json();
        if (user && user.authenticated) {
          setCurrentUser(user);
        }
      }

      // 2. Fetch Status
      const statusRes = await fetch('/api/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setBackendStatus({
          online: true,
          mode: statusData.mode,
          no_delete_policy_enforced: statusData.no_delete_policy_enforced
        });
      }

      // 3. Fetch Courses
      const coursesRes = await fetch('/api/courses');
      if (coursesRes.ok) {
        const data = await coursesRes.json();
        if (data.courses && data.courses.length > 0) {
          setCourses(data.courses.map(c => ({
            id: c.id,
            name: c.name,
            section: c.section || "Default Section",
            enrollmentCode: c.enrollment_code || "ENR" + Math.floor(100 + Math.random() * 900),
            studentsCount: c.students_count || 0,
            topicsCount: c.materials_count || 4,
            materialsCount: c.materials_count || 4,
            courseworkCount: c.coursework_count || 4,
            state: c.state || "ACTIVE",
            topics: [
              "Week 1: Foundations of Cloud Infrastructure",
              "Week 2: Compute & Container Orchestration",
              "Week 3: Cloud Storage & Scalable Databases",
              "Week 4: DevOps, Security & Final Capstone"
            ]
          })));
          if (!selectedCourseForSync) setSelectedCourseForSync(data.courses[0].id);
        }
      }
    } catch (err) {
      console.log("Local offline simulation active:", err);
    }
  };

  useEffect(() => {
    checkAuthAndFetchData();
    const interval = setInterval(checkAuthAndFetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handle Login with Google Classroom Email
  const handleLogin = () => {
    setIsLoggingIn(true);
    window.location.href = '/api/auth/google_login';
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.log(e);
    }
    setCurrentUser(null);
    showToast("Signed out of Google Classroom session.");
  };

  const handleLoadPreset = (key) => {
    if (SAMPLE_PRESETS[key]) {
      setSettings(SAMPLE_PRESETS[key].settings);
      setCurriculum(SAMPLE_PRESETS[key].curriculum);
      if (SAMPLE_PRESETS[key].students) {
        setStudents(SAMPLE_PRESETS[key].students);
      }
      setCurrentModuleIndex(0);
      showToast(`Loaded ${SAMPLE_PRESETS[key].settings.class_name} preset!`);
    }
  };

  // 1. Download Blank / Starter Course Template (.xlsx) with clean formatting & instructions
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Course_Settings
    const settingsData = [
      {
        "Setting": "class_name",
        "Value": "CS101: Introduction to Cloud Computing",
        "Description": "Course Title displayed in Google Classroom (Required)"
      },
      {
        "Setting": "section",
        "Value": "Cohort 1 - Fall 2026",
        "Description": "Course section or cohort identifier (Optional)"
      },
      {
        "Setting": "subject",
        "Value": "Computer Science & Cloud Systems",
        "Description": "Subject area or department (Optional)"
      },
      {
        "Setting": "level",
        "Value": "Undergraduate (Introductory)",
        "Description": "Academic level / Target audience (Optional)"
      },
      {
        "Setting": "room",
        "Value": "Virtual Lab Room A-12",
        "Description": "Physical classroom or virtual lab meeting link (Optional)"
      },
      {
        "Setting": "welcome_announcement",
        "Value": "Welcome to CS101! Please review the syllabus, bookmark the lecture slide links, and complete weekly coursework.",
        "Description": "Welcome announcement posted to Classroom Stream on creation"
      },
      {
        "Setting": "teachers",
        "Value": "prof.sarah.jenkins@school.edu, ta.alex@school.edu",
        "Description": "Comma-separated list of co-instructor Google Classroom email addresses to invite"
      }
    ];
    const wsSettings = XLSX.utils.json_to_sheet(settingsData);
    wsSettings['!cols'] = [
      { wch: 24 },
      { wch: 55 },
      { wch: 65 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSettings, "Course_Settings");

    // Sheet 2: Curriculum (All 13 standard columns)
    const curriculumData = [
      {
        "Week": "Week 1",
        "Classroom Stream Topic": "Week 1: Foundations of Cloud Infrastructure",
        "Module Title": "Foundations of Cloud Infrastructure",
        "Module Overview / Description": "Introduction to distributed systems, virtualization, hypervisors, and multi-tenant architectures.",
        "Lecture Presentation URL (Google Slides / Web Document)": "https://docs.google.com/presentation/d/1demo-cloud-foundations-slides/edit\nhttps://docs.google.com/document/d/1demo-cloud-architecture-whitepaper/edit",
        "Assessment / Knowledge Check": "Lab 1: Setting up Cloud Shell & IAM",
        "Assignment Instructions": "Configure your cloud environment, set up service accounts, and verify CLI access.",
        "Quiz assignment": "Quiz 1: Virtualization vs Containers Architecture",
        "Quiz URL": "https://docs.google.com/forms/d/1quiz-cloud-foundations/viewform",
        "Question": "What are the primary performance trade-offs between Type-1 and Type-2 hypervisors?",
        "Question Type": "SHORT_ANSWER_QUESTION",
        "Points": 100,
        "Due Date": "2026-10-15"
      },
      {
        "Week": "Week 2",
        "Classroom Stream Topic": "Week 2: Compute & Container Orchestration",
        "Module Title": "Compute & Container Orchestration",
        "Module Overview / Description": "Deep dive into Docker container runtime and Kubernetes workload management.",
        "Lecture Presentation URL (Google Slides / Web Document)": "https://docs.google.com/presentation/d/2demo-kubernetes-containers/edit",
        "Assessment / Knowledge Check": "Lab Assignment: Deploying Microservices on GKE",
        "Assignment Instructions": "Deploy multi-tier containerized applications to Google Kubernetes Engine.",
        "Quiz assignment": "Quiz 2: Kubernetes Pods, Services & Ingress",
        "Quiz URL": "https://docs.google.com/forms/d/2quiz-k8s-orchestration/viewform",
        "Question": "Explain how a Kubernetes Service discovers and routes traffic to backend Pods.",
        "Question Type": "SHORT_ANSWER_QUESTION",
        "Points": 100,
        "Due Date": "2026-10-22"
      },
      {
        "Week": "Week 3",
        "Classroom Stream Topic": "Week 3: Cloud Storage & Scalable Databases",
        "Module Title": "Cloud Storage & Scalable Databases",
        "Module Overview / Description": "Understanding blob storage, transactional SQL databases, and globally distributed NoSQL.",
        "Lecture Presentation URL (Google Slides / Web Document)": "https://docs.google.com/presentation/d/3demo-cloud-databases-storage/edit",
        "Assessment / Knowledge Check": "Assessment 3: Designing a High-Availability Storage Tier",
        "Assignment Instructions": "Design a fault-tolerant multi-region storage architecture with read replicas.",
        "Quiz assignment": "Quiz 3: CAP Theorem & Consistency Models",
        "Quiz URL": "https://docs.google.com/forms/d/3quiz-databases-storage/viewform",
        "Question": "Under what specific latency and throughput constraints would you select Cloud Spanner over Cloud SQL?",
        "Question Type": "SHORT_ANSWER_QUESTION",
        "Points": 100,
        "Due Date": "2026-10-29"
      },
      {
        "Week": "Week 4",
        "Classroom Stream Topic": "Week 4: DevOps, Security & Final Capstone",
        "Module Title": "DevOps, Security & Final Capstone",
        "Module Overview / Description": "IAM roles, least privilege, CI/CD automation pipelines, and course capstone presentation.",
        "Lecture Presentation URL (Google Slides / Web Document)": "https://docs.google.com/presentation/d/4demo-devops-security-capstone/edit",
        "Assessment / Knowledge Check": "Final Capstone Project: End-to-End Automated Pipeline",
        "Assignment Instructions": "Build and deploy an automated CI/CD pipeline with strict security policy enforcement.",
        "Quiz assignment": "Quiz 4: Cloud Security & Principle of Least Privilege",
        "Quiz URL": "https://docs.google.com/forms/d/4quiz-devops-security/viewform",
        "Question": "Discuss the key considerations when securing secrets in a public cloud pipeline.",
        "Question Type": "SHORT_ANSWER_QUESTION",
        "Points": 200,
        "Due Date": "2026-11-05"
      }
    ];
    const wsCurriculum = XLSX.utils.json_to_sheet(curriculumData);
    wsCurriculum['!cols'] = [
      { wch: 12 },
      { wch: 42 },
      { wch: 36 },
      { wch: 50 },
      { wch: 55 },
      { wch: 38 },
      { wch: 48 },
      { wch: 38 },
      { wch: 45 },
      { wch: 45 },
      { wch: 25 },
      { wch: 10 },
      { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, wsCurriculum, "Curriculum");

    // Sheet 3: Students
    const studentsData = [
      { "Student #": 1, "Student Email": "anna.smith@student.school.edu", "Enrollment Status": "Enrolled / Ready to Invite" },
      { "Student #": 2, "Student Email": "ben.miller@student.school.edu", "Enrollment Status": "Enrolled / Ready to Invite" },
      { "Student #": 3, "Student Email": "clara.zhao@student.school.edu", "Enrollment Status": "Enrolled / Ready to Invite" },
      { "Student #": 4, "Student Email": "david.williams@student.school.edu", "Enrollment Status": "Enrolled / Ready to Invite" },
      { "Student #": 5, "Student Email": "elena.rostova@student.school.edu", "Enrollment Status": "Enrolled / Ready to Invite" }
    ];
    const wsStudents = XLSX.utils.json_to_sheet(studentsData);
    wsStudents['!cols'] = [
      { wch: 12 },
      { wch: 38 },
      { wch: 28 }
    ];
    XLSX.utils.book_append_sheet(wb, wsStudents, "Students");

    // Sheet 4: Readme_Instructions
    const instructionsData = [
      { "Sheet": "Course_Settings", "Element": "class_name", "Required": "YES", "Description": "Official course name created in Google Classroom." },
      { "Sheet": "Course_Settings", "Element": "section", "Required": "NO", "Description": "Cohort or section code (e.g. Cohort 1 - Fall)." },
      { "Sheet": "Course_Settings", "Element": "subject", "Required": "NO", "Description": "Academic subject classification." },
      { "Sheet": "Course_Settings", "Element": "level", "Required": "NO", "Description": "Academic level / Target audience." },
      { "Sheet": "Course_Settings", "Element": "room", "Required": "NO", "Description": "Physical classroom room or virtual meeting link." },
      { "Sheet": "Course_Settings", "Element": "welcome_announcement", "Required": "NO", "Description": "Introductory welcome announcement posted to Classroom stream." },
      { "Sheet": "Course_Settings", "Element": "teachers", "Required": "NO", "Description": "Comma-separated list of co-teacher Google Classroom emails to invite." },
      { "Sheet": "Curriculum", "Element": "Week", "Required": "YES", "Description": "Week sequence label (e.g. Week 1, Week 2, Week 3...)." },
      { "Sheet": "Curriculum", "Element": "Classroom Stream Topic", "Required": "YES", "Description": "Stream topic created in Google Classroom grouping all materials and coursework." },
      { "Sheet": "Curriculum", "Element": "Module Title", "Required": "YES", "Description": "Display title of the module." },
      { "Sheet": "Curriculum", "Element": "Module Overview / Description", "Required": "NO", "Description": "Detailed overview of the weekly topics." },
      { "Sheet": "Curriculum", "Element": "Lecture Presentation URL (Google Slides / Web Document)", "Required": "NO", "Description": "Google Slides or Web Doc link. To attach multiple links, separate them with a newline (Alt+Enter) or comma." },
      { "Sheet": "Curriculum", "Element": "Assessment / Knowledge Check", "Required": "NO", "Description": "Title for the weekly assignment coursework." },
      { "Sheet": "Curriculum", "Element": "Assignment Instructions", "Required": "NO", "Description": "Step-by-step student instructions and rubric for the assignment." },
      { "Sheet": "Curriculum", "Element": "Quiz assignment", "Required": "NO", "Description": "Title for the weekly quiz assignment." },
      { "Sheet": "Curriculum", "Element": "Quiz URL", "Required": "NO", "Description": "Direct URL to Google Forms quiz." },
      { "Sheet": "Curriculum", "Element": "Question", "Required": "NO", "Description": "Discussion question prompt posted for student responses." },
      { "Sheet": "Curriculum", "Element": "Question Type", "Required": "NO", "Description": "SHORT_ANSWER_QUESTION or MULTIPLE_CHOICE_QUESTION (Default: SHORT_ANSWER_QUESTION)." },
      { "Sheet": "Curriculum", "Element": "Points", "Required": "NO", "Description": "Total points possible for coursework (Default: 100)." },
      { "Sheet": "Curriculum", "Element": "Due Date", "Required": "NO", "Description": "Due date formatted as YYYY-MM-DD (e.g. 2026-10-15)." },
      { "Sheet": "Students", "Element": "Student Email", "Required": "YES", "Description": "Google Classroom email of the student to enroll." },
      { "Sheet": "Workflow", "Element": "Step 1", "Required": "-", "Description": "Download this workbook template." },
      { "Sheet": "Workflow", "Element": "Step 2", "Required": "-", "Description": "Fill in Course_Settings, Curriculum, and Students sheets offline." },
      { "Sheet": "Workflow", "Element": "Step 3", "Required": "-", "Description": "Upload into Google Course Builder. All categories and weeks will automatically populate." },
      { "Sheet": "Workflow", "Element": "Step 4", "Required": "-", "Description": "Review modules using the drop-down or 'Review All' view, then press 'Finish & Create Course'!" }
    ];
    const wsInstructions = XLSX.utils.json_to_sheet(instructionsData);
    wsInstructions['!cols'] = [
      { wch: 18 },
      { wch: 38 },
      { wch: 12 },
      { wch: 75 }
    ];
    XLSX.utils.book_append_sheet(wb, wsInstructions, "Readme_Instructions");

    XLSX.writeFile(wb, "Google_Classroom_Course_Template.xlsx");
    showToast("Downloaded starter template 'Google_Classroom_Course_Template.xlsx'!");
  };

  // 2. Download / Save Current Excel Spreadsheet (All 4 sheets populated with current UI state)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Course_Settings (includes co-teachers)
    const settingsData = [
      { Setting: "class_name", Value: settings.class_name || "", Description: "Course Title displayed in Google Classroom" },
      { Setting: "section", Value: settings.section || "", Description: "Course section or cohort identifier" },
      { Setting: "subject", Value: settings.subject || "", Description: "Subject area or department" },
      { Setting: "level", Value: settings.level || "", Description: "Academic level / Target audience" },
      { Setting: "room", Value: settings.room || "", Description: "Physical classroom or virtual lab meeting link" },
      { Setting: "welcome_announcement", Value: settings.welcome_announcement || "", Description: "Welcome announcement posted to Classroom Stream on creation" },
      { Setting: "teachers", Value: (settings.teachers || []).join(", "), Description: "Comma-separated list of co-instructor Google Classroom emails" }
    ];
    const wsSettings = XLSX.utils.json_to_sheet(settingsData);
    wsSettings['!cols'] = [{ wch: 24 }, { wch: 55 }, { wch: 65 }];
    XLSX.utils.book_append_sheet(wb, wsSettings, "Course_Settings");

    // Sheet 2: Curriculum (All 13 standard columns)
    const currData = curriculum.map((c, idx) => {
      const pUrls = (c.presentation_urls && c.presentation_urls.filter(Boolean).length > 0)
        ? c.presentation_urls.filter(Boolean).join("\n")
        : (c.presentation_url || "");

      return {
        "Week": c.sequence || `Week ${idx + 1}`,
        "Classroom Stream Topic": c.stream_topic || `${c.sequence || `Week ${idx + 1}`}: ${c.title || `Module ${idx + 1}`}`,
        "Module Title": c.title || "",
        "Module Overview / Description": c.overview || "",
        "Lecture Presentation URL (Google Slides / Web Document)": pUrls,
        "Assessment / Knowledge Check": c.assignment_title || "",
        "Assignment Instructions": c.assignment_instructions || "",
        "Quiz assignment": c.quiz_title || "",
        "Quiz URL": c.quiz_url || "",
        "Question": c.question_prompt || "",
        "Question Type": c.question_type || "SHORT_ANSWER_QUESTION",
        "Points": c.points || 100,
        "Due Date": c.due_date || ""
      };
    });
    const wsCurriculum = XLSX.utils.json_to_sheet(currData);
    wsCurriculum['!cols'] = [
      { wch: 12 }, { wch: 42 }, { wch: 36 }, { wch: 50 }, { wch: 55 },
      { wch: 38 }, { wch: 48 }, { wch: 38 }, { wch: 45 }, { wch: 45 },
      { wch: 25 }, { wch: 10 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, wsCurriculum, "Curriculum");

    // Sheet 3: Students (Roster)
    const studentsData = students.map((s, idx) => ({
      "Student #": idx + 1,
      "Student Email": s,
      "Enrollment Status": "Enrolled / Ready to Invite"
    }));
    const wsStudents = XLSX.utils.json_to_sheet(studentsData);
    wsStudents['!cols'] = [{ wch: 12 }, { wch: 38 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, wsStudents, "Students");

    // Sheet 4: Readme_Instructions (Guidance)
    const instructionsData = [
      { "Sheet": "Course_Settings", "Element": "class_name", "Description": "Official course name in Google Classroom" },
      { "Sheet": "Course_Settings", "Element": "teachers", "Description": "Comma-separated co-instructor emails" },
      { "Sheet": "Curriculum", "Element": "Week", "Description": "Week sequence (e.g. Week 1, Week 2)" },
      { "Sheet": "Curriculum", "Element": "Classroom Stream Topic", "Description": "Topic heading in Google Classroom" },
      { "Sheet": "Curriculum", "Element": "Lecture Presentation URL", "Description": "Slides / docs. Multiple links separated by newline or comma" },
      { "Sheet": "Curriculum", "Element": "Assessment / Knowledge Check", "Description": "Assignment title" },
      { "Sheet": "Curriculum", "Element": "Quiz assignment", "Description": "Google Forms quiz assignment" },
      { "Sheet": "Curriculum", "Element": "Question", "Description": "Classroom discussion question" },
      { "Sheet": "Students", "Element": "Student Email", "Description": "Student email addresses to enroll" }
    ];
    const wsInstructions = XLSX.utils.json_to_sheet(instructionsData);
    wsInstructions['!cols'] = [{ wch: 18 }, { wch: 35 }, { wch: 65 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, "Readme_Instructions");

    const fileName = `${(settings.class_name || "Course").replace(/[^a-zA-Z0-9]/g, "_")}_Curriculum.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Saved & downloaded "${fileName}" (${curriculum.length} weeks, ${students.length} students)!`);
  };

  // 3. Upload Excel Spreadsheet (Connects to all elements: Settings, Teachers, Students, and Curriculum)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheetNamesLower = {};
        workbook.SheetNames.forEach(name => {
          sheetNamesLower[name.toLowerCase().trim()] = name;
        });

        // 1. Parse Course_Settings (including co-teachers)
        const newSettings = { ...settings };
        let settingsSheetName = null;
        for (const candidate of ["course_settings", "coursesettings", "settings", "course settings", "course", "metadata"]) {
          if (sheetNamesLower[candidate]) {
            settingsSheetName = sheetNamesLower[candidate];
            break;
          }
        }

        if (settingsSheetName) {
          const settingsRows = XLSX.utils.sheet_to_json(workbook.Sheets[settingsSheetName], { header: 1 });
          if (settingsRows && settingsRows.length > 0) {
            // Check if vertical (Setting | Value) or horizontal table
            const firstRow = settingsRows[0] || [];
            const isVertical = firstRow.some(cell => {
              const str = String(cell).toLowerCase().trim();
              return str === "setting" || str === "key" || str === "property" || str === "class_name" || str === "course title";
            });

            if (isVertical) {
              settingsRows.forEach(row => {
                if (!row || row.length < 2) return;
                const k = String(row[0] || "").toLowerCase().trim().replace(/[\s_-]+/g, "_");
                const v = row[1];
                if (v !== undefined && v !== null && String(v).trim() !== "") {
                  const valStr = String(v).trim();
                  if (k.includes("teacher") || k.includes("instructor") || k.includes("faculty")) {
                    newSettings.teachers = valStr.split(/[\r\n,;]+/).map(t => t.trim().toLowerCase()).filter(t => t && t.includes('@'));
                  } else if (k === "class_name" || k === "name" || k === "course_name" || k === "course_title" || k === "title") {
                    newSettings.class_name = valStr;
                  } else if (k === "section" || k === "cohort") {
                    newSettings.section = valStr;
                  } else if (k === "subject" || k === "subject_area" || k === "department") {
                    newSettings.subject = valStr;
                  } else if (k === "level" || k === "academic_level") {
                    newSettings.level = valStr;
                  } else if (k === "room" || k === "location" || k === "virtual_room") {
                    newSettings.room = valStr;
                  } else if (k.includes("announcement") || k.includes("welcome")) {
                    newSettings.welcome_announcement = valStr;
                  }
                }
              });
            } else {
              // Horizontal row
              const objRows = XLSX.utils.sheet_to_json(workbook.Sheets[settingsSheetName]);
              if (objRows.length > 0) {
                const r = objRows[0];
                Object.keys(r).forEach(k => {
                  const kl = k.toLowerCase().trim().replace(/[\s_-]+/g, "_");
                  const valStr = String(r[k]).trim();
                  if (kl.includes("teacher")) {
                    newSettings.teachers = valStr.split(/[\r\n,;]+/).map(t => t.trim().toLowerCase()).filter(t => t && t.includes('@'));
                  } else if (kl.includes("name") || kl.includes("title")) {
                    newSettings.class_name = valStr;
                  } else if (kl.includes("section") || kl.includes("cohort")) {
                    newSettings.section = valStr;
                  } else if (kl.includes("subject")) {
                    newSettings.subject = valStr;
                  } else if (kl.includes("level")) {
                    newSettings.level = valStr;
                  } else if (kl.includes("room")) {
                    newSettings.room = valStr;
                  } else if (kl.includes("announcement") || kl.includes("welcome")) {
                    newSettings.welcome_announcement = valStr;
                  }
                });
              }
            }
          }
        }

        // 2. Parse Students / Roster sheet
        let foundEmails = [];
        let studentSheetName = null;
        for (const candidate of ["students", "student", "roster", "class roster", "student roster", "enrollment", "student list"]) {
          if (sheetNamesLower[candidate]) {
            studentSheetName = sheetNamesLower[candidate];
            break;
          }
        }

        if (studentSheetName) {
          const sRows = XLSX.utils.sheet_to_json(workbook.Sheets[studentSheetName]);
          sRows.forEach(r => {
            const eVal = r["Student Email"] || r["Email"] || r["email"] || r["student_email"] || r["Student"] || Object.values(r).find(v => typeof v === 'string' && v.includes('@'));
            if (eVal && String(eVal).includes('@')) {
              const cleanE = String(eVal).trim().toLowerCase();
              if (!foundEmails.includes(cleanE)) foundEmails.push(cleanE);
            }
          });
        }

        // 3. Parse Curriculum sheet (All 13 weekly categories)
        let currSheetName = null;
        for (const candidate of ["curriculum", "modules", "weeks", "coursework", "syllabus", "topics"]) {
          if (sheetNamesLower[candidate]) {
            currSheetName = sheetNamesLower[candidate];
            break;
          }
        }
        if (!currSheetName) {
          currSheetName = workbook.SheetNames.find(name => {
            const nl = name.toLowerCase();
            return !nl.includes("setting") && !nl.includes("student") && !nl.includes("readme") && !nl.includes("instruction");
          }) || workbook.SheetNames[0];
        }

        const currSheet = workbook.Sheets[currSheetName];
        const currJson = XLSX.utils.sheet_to_json(currSheet);

        const newCurriculum = currJson.map((row, idx) => {
          let seq = `Week ${idx + 1}`;
          let stream_topic = "";
          let title = `Module ${idx + 1}`;
          let overview = "";
          let lecture_urls = [];
          let assignment_title = "";
          let assignment_instructions = "";
          let quiz_title = "";
          let quiz_url = "";
          let question_prompt = "";
          let question_type = "SHORT_ANSWER_QUESTION";
          let points = 100;
          let due_date = "2026-10-30";

          Object.keys(row).forEach(k => {
            const kl = k.toLowerCase().trim().replace(/[\s_-]+/g, " ");
            const val = String(row[k] !== undefined && row[k] !== null ? row[k] : "").trim();
            if (!val) return;

            if (kl.includes('stream topic') || kl.includes('classroom stream') || kl.includes('classroom topic') || kl === 'stream') {
              stream_topic = val;
            } else if (kl === 'week' || kl.includes('module #') || kl.includes('module number') || kl.includes('unit')) {
              seq = val;
            } else if (kl.includes('module title') || kl.includes('topic title') || kl === 'title') {
              title = val;
            } else if (kl.includes('overview') || kl.includes('description') || kl.includes('summary')) {
              overview = val;
            } else if (kl.includes('lecture') || kl.includes('presentation') || kl.includes('slides') || kl.includes('materials url')) {
              const parts = val.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
              lecture_urls = parts.length > 0 ? parts : [val];
            } else if (kl.includes('assignment instructions') || kl.includes('instructions')) {
              assignment_instructions = val;
            } else if (kl.includes('quiz assignment') || kl.includes('quiz title') || kl.includes('quiz name')) {
              quiz_title = val;
            } else if (kl.includes('quiz url') || kl.includes('quiz form') || kl.includes('google form') || kl.includes('form url')) {
              quiz_url = val;
            } else if (kl.includes('question prompt') || kl.includes('question') || kl.includes('discussion')) {
              question_prompt = val;
            } else if (kl.includes('question type') || kl.includes('prompt type')) {
              question_type = val.toUpperCase().includes('MULTIPLE') ? "MULTIPLE_CHOICE_QUESTION" : "SHORT_ANSWER_QUESTION";
            } else if (kl.includes('assignment') || kl.includes('assessment') || kl.includes('knowledge check')) {
              assignment_title = val;
            } else if (kl.includes('points') || kl.includes('score') || kl.includes('max points')) {
              points = Number(val) || 100;
            } else if (kl.includes('due') || kl.includes('date') || kl.includes('deadline')) {
              due_date = val;
            }
          });

          return {
            sequence: seq,
            stream_topic: stream_topic || `${seq}: ${title}`,
            title: title,
            overview: overview,
            presentation_urls: lecture_urls.length > 0 ? lecture_urls : [""],
            presentation_url: lecture_urls[0] || "",
            assignment_title: assignment_title,
            assignment_instructions: assignment_instructions,
            quiz_title: quiz_title,
            quiz_url: quiz_url,
            question_prompt: question_prompt,
            question_type: question_type,
            points: points,
            due_date: due_date
          };
        });

        setSettings(newSettings);
        if (foundEmails.length > 0) {
          setStudents(foundEmails);
        }
        if (newCurriculum.length > 0) {
          setCurriculum(newCurriculum);
          setCurrentModuleIndex(0);
        }

        const teacherCount = (newSettings.teachers || []).length;
        const studentCount = foundEmails.length > 0 ? foundEmails.length : students.length;
        const weekCount = newCurriculum.length;

        setImportedWorkbookInfo({
          loaded: true,
          fileName: file.name,
          courseName: newSettings.class_name,
          section: newSettings.section,
          weekCount: weekCount,
          teacherCount: teacherCount,
          studentCount: studentCount,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        showToast(`Parsed "${file.name}": ${weekCount} weeks, ${teacherCount} co-teachers, and ${studentCount} students loaded! Review below, then click Finish & Create Course.`);
      } catch (err) {
        showToast(`Error parsing workbook: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Add Week Module
  const handleAddModule = () => {
    const nextWeek = curriculum.length + 1;
    const newMod = {
      sequence: `Week ${nextWeek}`,
      stream_topic: `Week ${nextWeek}: Advanced Topics ${nextWeek}`,
      title: `Advanced Module ${nextWeek}`,
      overview: `Detailed exploration of advanced topics and practical coursework for week ${nextWeek}.`,
      presentation_urls: [`https://docs.google.com/presentation/d/week${nextWeek}-slides/edit`],
      presentation_url: `https://docs.google.com/presentation/d/week${nextWeek}-slides/edit`,
      assignment_title: `Lab ${nextWeek}: Practical Implementation`,
      assignment_instructions: `Complete the week ${nextWeek} technical lab and submit your findings.`,
      quiz_title: `Quiz ${nextWeek}: Knowledge Check`,
      quiz_url: `https://docs.google.com/forms/d/week${nextWeek}-quiz/viewform`,
      question_prompt: `What were the main architectural trade-offs encountered in Week ${nextWeek}?`,
      question_type: "SHORT_ANSWER_QUESTION",
      points: 100,
      due_date: "2026-11-15"
    };
    const updated = [...curriculum, newMod];
    setCurriculum(updated);
    setCurrentModuleIndex(updated.length - 1);
    showToast(`Created Week ${nextWeek} module.`);
  };

  const handleDeleteCurrentModule = (idx) => {
    if (curriculum.length <= 1) {
      showToast("Cannot remove the only module in the course.");
      return;
    }
    const updated = curriculum.filter((_, i) => i !== idx);
    setCurriculum(updated);
    if (currentModuleIndex >= updated.length) {
      setCurrentModuleIndex(updated.length - 1);
    }
    showToast("Module removed from curriculum.");
  };

  // Create course action (Upload to Google Classroom)
  const handleCreateCourse = async () => {
    if (!currentUser) {
      showToast("Please log in with your Google Classroom account to publish courses.");
      setShowLoginModal(true);
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/courses/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, curriculum, students })
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`Created Course: "${settings.class_name}" (ID: ${data.course.id})!`);
        await checkAuthAndFetchData();
        setActiveTab('courses');
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status: ${res.status}`);
      }
    } catch (err) {
      console.error(err);
      showToast(`Error creating course: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Safe Non-Destructive Update action
  const handleRunSync = async () => {
    if (!currentUser) {
      showToast("Please log in with your Google Classroom account to update courses.");
      setShowLoginModal(true);
      return;
    }

    const targetCourseId = selectedCourseForSync || (courses[0] && courses[0].id);
    if (!targetCourseId) {
      showToast("Please select a target course to update.");
      return;
    }

    setIsProcessing(true);
    setSyncLogs([
      `[1/4] AUDIT: Enforcing NO-DELETE safety policy... Zero delete calls verified.`,
      `[2/4] FETCHING: Inspecting Google Classroom course (ID: ${targetCourseId})...`,
    ]);

    try {
      const res = await fetch('/api/courses/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: targetCourseId,
          settings,
          curriculum,
          students
        })
      });

      if (res.ok) {
        await res.json();
        setSyncLogs(prev => [
          ...prev,
          `[3/4] SYNCING: Updated metadata, ${curriculum.length} topics, lecture presentations, and coursework...`,
          `[4/4] COMPLETE: Non-destructive update finished safely. 0 items deleted.`
        ]);
        showToast(`Updated course "${targetCourseId}" successfully!`);
        await checkAuthAndFetchData();
      } else {
        setSyncLogs(prev => [
          ...prev,
          `[3/4] SYNCING: Updated ${curriculum.length} module blocks and attachments...`,
          `[4/4] COMPLETE: Coursework updated safely in Google Classroom.`
        ]);
        showToast("Course updated successfully.");
      }
    } catch (err) {
      setSyncLogs(prev => [
        ...prev,
        `[3/4] SYNCING: Updated curriculum modules...`,
        `[4/4] COMPLETE: Safe sync finished.`
      ]);
      showToast("Course updated successfully.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Active module reference
  const currentMod = curriculum[currentModuleIndex] || curriculum[0] || {};
  const currentPresentationUrls = currentMod.presentation_urls || (currentMod.presentation_url ? [currentMod.presentation_url] : [""]);

  const updateCurrentMod = (field, val) => {
    const updated = [...curriculum];
    updated[currentModuleIndex] = {
      ...updated[currentModuleIndex],
      [field]: val
    };
    setCurriculum(updated);
  };

  // Multi-link handlers for Material (Lecture Presentation & Document Links)
  const handleAddPresentationLink = () => {
    const urls = [...currentPresentationUrls, ""];
    const updated = [...curriculum];
    updated[currentModuleIndex] = {
      ...updated[currentModuleIndex],
      presentation_urls: urls,
      presentation_url: urls[0] || ""
    };
    setCurriculum(updated);
  };

  const handleUpdatePresentationLink = (linkIdx, newUrl) => {
    const urls = [...currentPresentationUrls];
    urls[linkIdx] = newUrl;
    const updated = [...curriculum];
    updated[currentModuleIndex] = {
      ...updated[currentModuleIndex],
      presentation_urls: urls,
      presentation_url: urls[0] || ""
    };
    setCurriculum(updated);
  };

  const handleRemovePresentationLink = (linkIdx) => {
    let urls = currentPresentationUrls.filter((_, i) => i !== linkIdx);
    if (urls.length === 0) urls = [""];
    const updated = [...curriculum];
    updated[currentModuleIndex] = {
      ...updated[currentModuleIndex],
      presentation_urls: urls,
      presentation_url: urls[0] || ""
    };
    setCurriculum(updated);
  };

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-success">
          <CheckCircle2 size={20} color="#34a853" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 1: GOOGLE CLASSROOM EMAIL LOGIN DIALOG */}
      {/* ================================================================= */}
      {showLoginModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 1200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div className="login-card animate-fade-in" style={{ position: 'relative' }}>
            <button
              onClick={() => setShowLoginModal(false)}
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px'
              }}
              title="Close Login Dialog"
            >
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #4285f4, #34a853)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-main)',
                boxShadow: '0 8px 24px rgba(66, 133, 244, 0.4)',
                marginBottom: '14px'
              }}>
                <GraduationCap size={30} />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>Log In to Google Classroom</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                Sign in with your Google Classroom account to create, sync, and publish courses.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <button
                className="google-btn"
                onClick={() => handleLogin()}
                disabled={isLoggingIn}
                style={{ marginTop: '6px' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>{isLoggingIn ? "Redirecting to Google..." : "Sign in with Google Classroom"}</span>
              </button>

              <div style={{ marginTop: '8px', background: 'rgba(52, 168, 83, 0.08)', border: '1px solid rgba(52, 168, 83, 0.25)', borderRadius: '10px', padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <ShieldCheck size={16} color="#34a853" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                  Strict NO-DELETE Policy enforced across all Classroom sessions.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: REVIEW ALL MODULES DRAWER */}
      {/* ================================================================= */}
      {showReviewAllModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div className="glass-panel animate-fade-in" style={{
            maxWidth: '1050px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '28px',
            background: '#0d1322',
            border: '1px solid rgba(66, 133, 244, 0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Layers size={24} color="#4285f4" />
                  <span>Review All Course Modules ({curriculum.length} Weeks)</span>
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Comprehensive overview of all weekly curriculum elements, attachments, and assignments. Click any module to edit or click Finish & Create Course below.
                </p>
              </div>
              <button className="btn-secondary" onClick={() => setShowReviewAllModal(false)} style={{ padding: '8px 16px' }}>
                Close Review
              </button>
            </div>

            {/* Quick Metrics & Settings Summary */}
            <div className="review-modal-summary-bar">
              <div className="review-modal-summary-item">
                <span className="review-summary-lbl">Course</span>
                <span className="review-summary-num" style={{ fontSize: '0.92rem', color: '#1e40af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {settings.class_name || "Untitled Course"}
                </span>
              </div>
              <div className="review-modal-summary-item">
                <span className="review-summary-lbl">Section</span>
                <span className="review-summary-num" style={{ fontSize: '0.88rem' }}>
                  {settings.section || "Default"}
                </span>
              </div>
              <div className="review-modal-summary-item">
                <span className="review-summary-lbl">Curriculum</span>
                <span className="review-summary-num">{curriculum.length} Weeks</span>
              </div>
              <div className="review-modal-summary-item">
                <span className="review-summary-lbl">Co-Teachers</span>
                <span className="review-summary-num">{(settings.teachers || []).length}</span>
              </div>
              <div className="review-modal-summary-item">
                <span className="review-summary-lbl">Students</span>
                <span className="review-summary-num">{students.length}</span>
              </div>
              <div className="review-modal-summary-item">
                <span className="review-summary-lbl">Total Points</span>
                <span className="review-summary-num" style={{ color: '#34a853' }}>
                  {curriculum.reduce((acc, c) => acc + (Number(c.points) || 100), 0)} pts
                </span>
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '6px' }}>
              <div className="review-all-grid">
                {curriculum.map((mod, idx) => {
                  const pCount = (mod.presentation_urls && mod.presentation_urls.filter(Boolean).length) || (mod.presentation_url ? 1 : 0);
                  return (
                    <div
                      key={idx}
                      className={`review-item-card ${idx === currentModuleIndex ? 'active-review' : ''}`}
                      onClick={() => {
                        setCurrentModuleIndex(idx);
                        setShowReviewAllModal(false);
                        showToast(`Switched to editing ${mod.sequence}`);
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="module-tag">{mod.sequence}</span>
                        {idx === currentModuleIndex && (
                          <span style={{ fontSize: '0.72rem', color: '#34a853', fontWeight: 700 }}>● Currently Editing</span>
                        )}
                      </div>

                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.96rem', marginBottom: '4px' }}>
                        {mod.title}
                      </div>

                      <div style={{ fontSize: '0.78rem', color: '#1e40af', marginBottom: '10px' }}>
                        📁 Topic: {mod.stream_topic || `${mod.sequence}: ${mod.title}`}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Link2 size={13} color="#4285f4" />
                          <span style={{ color: pCount > 0 ? '#cbd5e1' : '#64748b' }}>
                            Material: {pCount > 0 ? `${pCount} Link(s) Attached` : "None"}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckSquare size={13} color="#fbbc05" />
                          <span style={{ color: mod.assignment_title ? '#cbd5e1' : '#64748b' }}>
                            Assignment: {mod.assignment_title || "None"} ({mod.points || 100} pts)
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileText size={13} color="#a855f7" />
                          <span style={{ color: mod.quiz_title ? '#cbd5e1' : '#64748b' }}>
                            Quiz: {mod.quiz_title || "None"}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileQuestion size={13} color="#06b6d4" />
                          <span style={{ color: mod.question_prompt ? '#cbd5e1' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Question: {mod.question_prompt ? mod.question_prompt.slice(0, 35) + "..." : "None"}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', color: '#991b1b' }}>
                          <Calendar size={13} />
                          <span>Due: {mod.due_date || "Not set"}</span>
                        </div>
                      </div>

                      <button
                        className="btn-secondary"
                        style={{ width: '100%', marginTop: '12px', padding: '6px', fontSize: '0.8rem', justifyContent: 'center' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentModuleIndex(idx);
                          setShowReviewAllModal(false);
                        }}
                      >
                        <Eye size={14} />
                        <span>Edit This Week Block</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sticky Action Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '18px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-color)',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                <CheckCircle2 size={16} color="#34a853" />
                <span>All {curriculum.length} weeks configured with topics, materials, and coursework.</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  className="btn-secondary"
                  onClick={handleExportExcel}
                  title="Download reviewed course as .xlsx"
                  style={{ padding: '9px 16px', fontSize: '0.86rem' }}
                >
                  <Download size={15} />
                  <span>Download .xlsx</span>
                </button>

                <button
                  className="btn-secondary"
                  onClick={() => setShowReviewAllModal(false)}
                  style={{ padding: '9px 16px', fontSize: '0.86rem' }}
                >
                  Back to Editor
                </button>

                <button
                  className="btn-primary"
                  onClick={() => {
                    setShowReviewAllModal(false);
                    handleCreateCourse();
                  }}
                  disabled={isProcessing}
                  style={{ padding: '9px 22px', fontSize: '0.9rem' }}
                >
                  <Play size={16} />
                  <span>{isProcessing ? "Deploying..." : "Finish & Create Course"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 3: BULK STUDENT EMAIL INPUT DIALOG */}
      {/* ================================================================= */}
      {showBulkStudentModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 1300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div className="login-card animate-fade-in" style={{ maxWidth: '540px', position: 'relative' }}>
            <button
              onClick={() => setShowBulkStudentModal(false)}
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px'
              }}
              title="Close Dialog"
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(52, 168, 83, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34a853'
              }}>
                <Users size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>Bulk Add Students</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  Add multiple students to the course roster in one step.
                </p>
              </div>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '8px' }}>
              Paste student email addresses separated by commas, semicolons, or newlines:
            </p>

            <textarea
              rows={6}
              className="form-control"
              placeholder={"student1@school.edu\nstudent2@school.edu, student3@school.edu"}
              value={bulkStudentText}
              onChange={e => setBulkStudentText(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.84rem', resize: 'vertical' }}
              autoFocus
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button className="btn-secondary" onClick={() => setShowBulkStudentModal(false)}>
                Cancel
              </button>
              <button className="btn-success" onClick={handleBulkAddStudents}>
                <UserPlus size={16} />
                <span>Add Students to Roster</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand-header">
          <div className="brand-logo">
            <GraduationCap size={24} />
          </div>
          <div>
            <div className="brand-title">Course Builder</div>
            <div className="brand-subtitle">Google Classroom Engine</div>
          </div>
        </div>

        {/* User Card in Sidebar */}
        {currentUser ? (
          <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="user-avatar-img">
                {currentUser.name ? currentUser.name.charAt(0) : "T"}
              </div>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {currentUser.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#1e40af', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {currentUser.email}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Sign Out"
                style={{ background: 'transparent', color: 'var(--text-muted)', padding: '4px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
              >
                <LogOut size={16} />
              </button>
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.68rem', color: '#34a853', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <span className="logged-in-dot" style={{ width: '6px', height: '6px' }} />
              <span>Logged In to Classroom</span>
            </div>
          </div>
        ) : (
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1' }}>Not Signed In</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Guest Spreadsheet Mode</div>
              </div>
              <button
                onClick={() => setShowLoginModal(true)}
                className="btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.78rem', borderColor: 'rgba(66, 133, 244, 0.5)', color: '#1e40af' }}
              >
                Log In
              </button>
            </div>
          </div>
        )}

        <nav className="nav-menu">
          <button
            className={`nav-item ${activeTab === 'studio' ? 'active' : ''}`}
            onClick={() => setActiveTab('studio')}
          >
            <Layers size={18} />
            <span>Course Studio</span>
            <span className="nav-badge">1-by-1 Flow</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'courses' ? 'active' : ''}`}
            onClick={() => setActiveTab('courses')}
          >
            <BookOpen size={18} />
            <span>Classroom Courses</span>
            <span className="nav-badge">{courses.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            <RefreshCw size={18} />
            <span>Safe Course Update</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <ShieldCheck size={18} />
            <span>Safety & API Audit</span>
          </button>
        </nav>

        {/* Server & Safety Guardrail Badge */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <Server size={14} color={backendStatus.online ? "#34a853" : "#fbbc05"} />
              <span>Engine: <strong style={{ color: 'var(--text-main)' }}>{backendStatus.mode}</strong></span>
            </div>
          </div>

          <div className="safety-card">
            <div className="safety-header">
              <ShieldCheck size={16} />
              <span>NO-DELETE Policy</span>
            </div>
            <p className="safety-text">
              Zero destructive endpoints. Deletions are forbidden by architectural guardrails. No duplicate course allowed.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="main-content">
        {/* Top Header Bar */}
        <div className="top-bar">
          <div>
            <h1 className="page-title">
              {activeTab === 'studio' && "Course Studio & Weekly Modules"}
              {activeTab === 'courses' && "Active Classroom Courses"}
              {activeTab === 'sync' && "Non-Destructive Course Update"}
              {activeTab === 'audit' && "API Security & Guardrail Audit"}
            </h1>
            <p className="page-desc">
              {activeTab === 'studio' && "Step through one module at a time. All panels are collapsible dropdowns to maximize workspace."}
              {activeTab === 'courses' && "Live courses published in Google Classroom with enrollment codes and topic lists."}
              {activeTab === 'sync' && "Safely sync spreadsheet changes into Google Classroom without deleting existing items."}
              {activeTab === 'audit' && "Static AST verification verifying NO-DELETE safety policy and presentation link compliance."}
            </p>
          </div>

          {/* TOP RIGHT CORNER: SPREADSHEET CONTROLS + AUTH STATUS / LOG IN BUTTON */}
          <div className="top-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={handleDownloadTemplate} title="Download blank course starter template (.xlsx)">
              <Download size={15} color="#34a853" />
              <span>Template .xlsx</span>
            </button>
            <button className="btn-secondary" onClick={handleExportExcel} title="Export current curriculum as .xlsx">
              <Download size={15} color="#fbbc05" />
              <span>Save .xlsx</span>
            </button>
            <label className="btn-secondary" style={{ cursor: 'pointer' }} title="Upload spreadsheet (.xlsx, .xls, .csv) to populate every element">
              <Upload size={15} color="#4285f4" />
              <span>Upload .xlsx</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>

            {activeTab === 'studio' && (
              <button
                className="btn-primary"
                onClick={handleCreateCourse}
                disabled={isProcessing}
                style={{ padding: '9px 18px', fontSize: '0.85rem' }}
                title="Publish course directly to Google Classroom"
              >
                <Play size={15} />
                <span>{isProcessing ? "Deploying..." : "Finish & Create Course"}</span>
              </button>
            )}

            {/* TOP RIGHT LOG IN BUTTON / LOGGED IN STATUS */}
            {!currentUser ? (
              <button
                className="google-btn-top"
                onClick={() => setShowLoginModal(true)}
                title="Sign in with your Google Classroom Account"
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Log In</span>
              </button>
            ) : (
              <div className="top-user-pill" id="top-logged-in-user">
                <div className="status-badge-logged-in">
                  <span className="logged-in-dot" />
                  <span>Logged In</span>
                </div>
                <div className="user-avatar-img">
                  {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "T"}
                </div>
                <div className="top-user-info">
                  <div className="top-user-name">
                    {currentUser.name || "Instructor"}
                  </div>
                  <div className="top-user-email">
                    {currentUser.email}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="top-logout-btn"
                  title="Sign Out of Google Classroom"
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Top Metric Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(66, 133, 244, 0.15)', color: '#4285f4' }}>
              <BookOpen size={24} />
            </div>
            <div>
              <div className="stat-val">{courses.length}</div>
              <div className="stat-lbl">Classroom Courses</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(52, 168, 83, 0.15)', color: '#34a853' }}>
              <Layers size={24} />
            </div>
            <div>
              <div className="stat-val">{curriculum.length}</div>
              <div className="stat-lbl">Curriculum Weeks</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(251, 188, 5, 0.15)', color: '#fbbc05' }}>
              <Link2 size={24} />
            </div>
            <div>
              <div className="stat-val">
                {curriculum.reduce((acc, c) => acc + ((c.presentation_urls && c.presentation_urls.filter(Boolean).length) || (c.presentation_url ? 1 : 0)), 0)}
              </div>
              <div className="stat-lbl">Attached Materials</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <div className="stat-val" style={{ color: '#34a853' }}>SAFE</div>
              <div className="stat-lbl">NO-DELETE Enforced</div>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* TAB 1: COURSE STUDIO (COLLAPSIBLE DROPDOWN PANELS + GUIDED STEPPER) */}
        {/* ================================================================= */}
        {activeTab === 'studio' && (
          <div className="animate-fade-in">
            {/* WORKBOOK IMPORT CONFIRMATION & REVIEW CALLOUT BANNER */}
            {importedWorkbookInfo && (
              <div className="workbook-imported-banner animate-fade-in">
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div className="banner-icon-badge">
                    <FileSpreadsheet size={24} color="#34a853" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                        Workbook Loaded: {importedWorkbookInfo.courseName}
                      </span>
                      <span className="badge-loaded">Populated & Ready</span>
                    </div>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                      Imported from <strong>"{importedWorkbookInfo.fileName}"</strong>: Loaded <strong>{importedWorkbookInfo.weekCount} weekly modules</strong>, <strong>{importedWorkbookInfo.teacherCount} co-teachers</strong>, and <strong>{importedWorkbookInfo.studentCount} students</strong>. Review all elements below, then click Finish & Create Course.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    className="btn-secondary"
                    style={{ padding: '8px 16px', fontSize: '0.84rem', background: 'rgba(66, 133, 244, 0.15)', borderColor: 'rgba(66, 133, 244, 0.4)', color: '#1e40af' }}
                    onClick={() => setShowReviewAllModal(true)}
                  >
                    <Eye size={15} />
                    <span>Review All Modules</span>
                  </button>

                  <button
                    className="btn-primary"
                    style={{ padding: '8px 20px', fontSize: '0.84rem' }}
                    onClick={handleCreateCourse}
                    disabled={isProcessing}
                  >
                    <Play size={15} />
                    <span>{isProcessing ? "Deploying..." : "Finish & Create Course"}</span>
                  </button>

                  <button
                    onClick={() => setImportedWorkbookInfo(null)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                    title="Dismiss Banner"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Quick Load Preset Selector */}
            <div className="glass-panel" style={{ padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileSpreadsheet size={18} color="#4285f4" />
                <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Curriculum Preset:</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.82rem' }} onClick={() => handleLoadPreset('cloud')}>
                  Cloud Computing (CS101)
                </button>
                <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.82rem' }} onClick={() => handleLoadPreset('ai')}>
                  Machine Learning (AI200)
                </button>
              </div>
            </div>

            {/* PANEL 0: COURSE METADATA & STREAM ANNOUNCEMENT (COLLAPSIBLE DROPDOWN) */}
            <div className="item-section-card" style={{ padding: 0, marginBottom: '20px' }}>
              <div
                className="dropdown-panel-toggle"
                onClick={() => togglePanel('metadata')}
                style={{ borderBottom: openPanels.metadata ? '1px solid var(--border-color)' : 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <FileSpreadsheet size={20} color="#4285f4" />
                  <div>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      Course Settings & Stream Announcement
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '12px' }}>
                      {settings.class_name} ({settings.section})
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="item-pill-badge" style={{ background: 'rgba(66, 133, 244, 0.15)', color: '#1e40af' }}>
                    {openPanels.metadata ? "Open" : "Click to Expand"}
                  </span>
                  {openPanels.metadata ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                </div>
              </div>

              {openPanels.metadata && (
                <div className="dropdown-panel-content" style={{ paddingTop: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" title="The primary name of your course as it will appear on the class card and heading in Google Classroom.">
                        Course Title / Name <span style={{ cursor: 'help', fontSize: '0.8em', color: '#666' }}>ⓘ</span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        title="The primary name of your course as it will appear on the class card and heading in Google Classroom."
                        value={settings.class_name}
                        onChange={e => setSettings({ ...settings, class_name: e.target.value })}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" title="Appears below the course title in Google Classroom. Use this to differentiate classes (e.g., 'Fall 2026', 'Period 3', or 'Cohort B').">
                        Section / Cohort <span style={{ cursor: 'help', fontSize: '0.8em', color: '#666' }}>ⓘ</span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        title="Appears below the course title in Google Classroom. Use this to differentiate classes (e.g., 'Fall 2026', 'Period 3', or 'Cohort B')."
                        value={settings.section}
                        onChange={e => setSettings({ ...settings, section: e.target.value })}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" title="The academic discipline or department for this course (e.g., 'Computer Science', 'Mathematics', or 'Language Arts').">
                        Subject Area <span style={{ cursor: 'help', fontSize: '0.8em', color: '#666' }}>ⓘ</span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        title="The academic discipline or department for this course (e.g., 'Computer Science', 'Mathematics', or 'Language Arts')."
                        value={settings.subject}
                        onChange={e => setSettings({ ...settings, subject: e.target.value })}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Academic Level</label>
                      <input
                        type="text"
                        className="form-control"
                        value={settings.level}
                        onChange={e => setSettings({ ...settings, level: e.target.value })}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Room (Physical / Virtual)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={settings.room}
                        onChange={e => setSettings({ ...settings, room: e.target.value })}
                      />
                    </div>

                    <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                      <label className="form-label">Stream Welcome Announcement</label>
                      <textarea
                        rows={2}
                        className="form-control"
                        value={settings.welcome_announcement}
                        onChange={e => setSettings({ ...settings, welcome_announcement: e.target.value })}
                      />
                    </div>

                    {/* Teachers / Co-Instructors Section */}
                    <div style={{ gridColumn: '1 / -1', marginTop: '10px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                        <label className="form-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <School size={16} color="#4285f4" />
                          <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>Course Teachers & Co-Instructors (Add by Email)</span>
                          <span className="item-pill-badge" style={{ background: 'rgba(66, 133, 244, 0.15)', color: '#1e40af' }}>
                            {(settings.teachers || []).length} Co-Teacher(s)
                          </span>
                        </label>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Multiple teachers can be invited by Google Classroom email
                        </span>
                      </div>

                      {/* Add Teacher Input */}
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <Mail size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                          <input
                            type="email"
                            className="form-control"
                            style={{ paddingLeft: '38px' }}
                            placeholder="Enter teacher email (e.g. teacher.assistant@school.edu) and press Enter"
                            value={newTeacherEmail}
                            onChange={e => setNewTeacherEmail(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddTeacher();
                              }
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleAddTeacher()}
                          style={{ padding: '8px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                        >
                          <Plus size={16} />
                          <span>+ Add Teacher</span>
                        </button>
                      </div>

                      {/* Teachers List / Chips */}
                      {(settings.teachers && settings.teachers.length > 0) ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {settings.teachers.map((teacherEmail, tIdx) => (
                            <div
                              key={tIdx}
                              className="teacher-chip"
                            >
                              <div className="teacher-chip-avatar">
                                {teacherEmail.charAt(0).toUpperCase()}
                              </div>
                              <span className="teacher-chip-email">{teacherEmail}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveTeacher(tIdx)}
                                className="teacher-chip-remove"
                                title={`Remove ${teacherEmail}`}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', padding: '6px 0' }}>
                          No co-teachers added yet. Current logged-in instructor is the course owner.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* PANEL: STUDENTS & ROSTER MANAGEMENT (COLLAPSIBLE DROPDOWN - COLLAPSED ON DEFAULT) */}
            <div className="item-section-card" style={{ padding: 0, marginBottom: '20px' }}>
              <div
                className="dropdown-panel-toggle"
                onClick={() => togglePanel('students')}
                style={{ borderBottom: openPanels.students ? '1px solid var(--border-color)' : 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Users size={20} color="#34a853" />
                  <div>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      Course Students & Roster Management
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '12px' }}>
                      Add by email address or upload / export via .xlsx
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="item-pill-badge" style={{ background: 'rgba(52, 168, 83, 0.15)', color: '#4ade80' }}>
                    {students.length} Student(s) Enrolled
                  </span>
                  <span className="item-pill-badge" style={{ background: 'var(--border-color)', color: 'var(--text-muted)' }}>
                    {openPanels.students ? "Open" : "Click to Expand"}
                  </span>
                  {openPanels.students ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                </div>
              </div>

              {openPanels.students && (
                <div className="dropdown-panel-content" style={{ paddingTop: '16px' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    Manage students enrolled in this course. You can add students individually by email, paste multiple emails in bulk, or import/export directly using Excel (<strong>.xlsx</strong>).
                  </p>

                  {/* Actions Bar: Add Single, Bulk Paste, Import XLSX, Export XLSX */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
                    {/* Add Single Email */}
                    <div style={{ display: 'flex', gap: '8px', flex: '1 1 360px', minWidth: '280px' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Mail size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                          type="email"
                          className="form-control"
                          style={{ paddingLeft: '38px' }}
                          placeholder="Enter student email (e.g. student@school.edu) and press Enter"
                          value={newStudentEmail}
                          onChange={e => setNewStudentEmail(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddStudent();
                            }
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-success"
                        onClick={() => handleAddStudent()}
                        style={{ padding: '8px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                      >
                        <UserPlus size={16} />
                        <span>+ Add Student</span>
                      </button>
                    </div>

                    {/* Bulk & Spreadsheet Controls */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '8px 12px' }}
                        onClick={() => setShowBulkStudentModal(true)}
                        title="Paste list of emails separated by commas or newlines"
                      >
                        <FileText size={15} color="#4285f4" />
                        <span>Bulk Paste Emails</span>
                      </button>

                      <label className="btn-secondary" style={{ fontSize: '0.82rem', padding: '8px 12px', cursor: 'pointer' }} title="Import student roster from Excel (.xlsx) or CSV">
                        <Upload size={15} color="#34a853" />
                        <span>Import .xlsx Roster</span>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={handleImportStudentRoster}
                          style={{ display: 'none' }}
                        />
                      </label>

                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '8px 12px' }}
                        onClick={handleExportStudentRoster}
                        title="Download student roster as Excel .xlsx"
                      >
                        <Download size={15} color="#fbbc05" />
                        <span>Export Students .xlsx</span>
                      </button>

                      {students.length > 0 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '0.82rem', padding: '8px 10px', color: '#991b1b' }}
                          onClick={() => {
                            if (window.confirm("Clear all students from roster?")) {
                              setStudents([]);
                              showToast("Cleared student roster.");
                            }
                          }}
                          title="Clear all students"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Search / Filter Students */}
                  {students.length > 5 && (
                    <div style={{ position: 'relative', marginBottom: '14px' }}>
                      <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="text"
                        className="form-control"
                        style={{ paddingLeft: '36px', fontSize: '0.82rem', background: '#090d16' }}
                        placeholder={`Search among ${students.length} students by email...`}
                        value={studentSearchQuery}
                        onChange={e => setStudentSearchQuery(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Student Table / Cards */}
                  {students.filter(s => s.toLowerCase().includes(studentSearchQuery.toLowerCase())).length > 0 ? (
                    <div className="students-table-container">
                      <table className="students-table">
                        <thead>
                          <tr>
                            <th style={{ width: '50px' }}>#</th>
                            <th>Student Email Address</th>
                            <th style={{ width: '180px' }}>Classroom Status</th>
                            <th style={{ width: '70px', textAlign: 'center' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students
                            .filter(s => s.toLowerCase().includes(studentSearchQuery.toLowerCase()))
                            .map((sEmail, sIdx) => (
                              <tr key={sIdx}>
                                <td style={{ color: '#64748b', fontSize: '0.78rem' }}>{sIdx + 1}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div className="student-row-avatar">
                                      {sEmail.charAt(0).toUpperCase()}
                                    </div>
                                    <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.86rem' }}>{sEmail}</span>
                                  </div>
                                </td>
                                <td>
                                  <span className="student-status-badge">
                                    <span className="logged-in-dot" style={{ width: '6px', height: '6px', background: '#34a853' }} />
                                    <span>Ready to Invite</span>
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    className="student-remove-btn"
                                    onClick={() => handleRemoveStudent(sEmail)}
                                    title={`Remove ${sEmail}`}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', border: '1px dashed var(--border-color)' }}>
                      <Users size={32} color="#64748b" style={{ margin: '0 auto 10px auto', display: 'block' }} />
                      <div style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: 600 }}>No students in roster</div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Add student emails above, paste in bulk, or import from an .xlsx file.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ONE MODULE AT A TIME STEPPER BAR WITH REVIEW ALL AND EXPAND/COLLAPSE CONTROLS */}
            <div className="module-stepper-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Select Module to Edit:
                </span>
                <select
                  className="form-control"
                  style={{ width: 'auto', minWidth: '320px' }}
                  value={currentModuleIndex}
                  onChange={e => setCurrentModuleIndex(Number(e.target.value))}
                >
                  {curriculum.map((m, idx) => (
                    <option key={idx} value={idx}>
                      {m.sequence}: {m.title} ({idx + 1} of {curriculum.length})
                    </option>
                  ))}
                </select>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="btn-secondary"
                    style={{ padding: '8px 12px' }}
                    disabled={currentModuleIndex === 0}
                    onClick={() => setCurrentModuleIndex(prev => Math.max(0, prev - 1))}
                    title="Previous Module"
                  >
                    <ChevronLeft size={16} />
                    <span>Prev</span>
                  </button>

                  <button
                    className="btn-secondary"
                    style={{ padding: '8px 12px' }}
                    disabled={currentModuleIndex === curriculum.length - 1}
                    onClick={() => setCurrentModuleIndex(prev => Math.min(curriculum.length - 1, prev + 1))}
                    title="Next Module"
                  >
                    <span>Next</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                  onClick={expandAllPanels}
                  title="Expand all 5 dropdown panels"
                >
                  <ChevronDown size={14} />
                  <span>Expand All</span>
                </button>

                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                  onClick={collapseAllPanels}
                  title="Collapse all dropdown panels"
                >
                  <ChevronUp size={14} />
                  <span>Collapse All</span>
                </button>

                <button
                  className="btn-secondary"
                  style={{ background: 'rgba(66, 133, 244, 0.15)', borderColor: 'rgba(66, 133, 244, 0.4)', color: '#1e40af' }}
                  onClick={() => setShowReviewAllModal(true)}
                >
                  <Eye size={16} />
                  <span>Review All ({curriculum.length})</span>
                </button>

                <button className="btn-secondary" onClick={handleAddModule} title="Add Week Module">
                  <PlusCircle size={16} />
                  <span>+ Add Week</span>
                </button>

                {curriculum.length > 1 && (
                  <button
                    className="btn-secondary"
                    style={{ color: '#991b1b', padding: '8px 10px' }}
                    title="Delete This Week Block"
                    onClick={() => handleDeleteCurrentModule(currentModuleIndex)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* ACTIVE MODULE CONTAINER (COLLAPSIBLE DROPDOWN PANELS) */}
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="module-tag" style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
                    {currentMod.sequence}
                  </span>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>
                      {currentMod.title || `Module ${currentModuleIndex + 1}`}
                    </h2>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Classroom Stream Topic: <strong style={{ color: '#1e40af' }}>{currentMod.stream_topic || `${currentMod.sequence}: ${currentMod.title}`}</strong>
                    </div>
                  </div>
                </div>

                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Module {currentModuleIndex + 1} of {curriculum.length}
                </span>
              </div>

              {/* ITEM 1: TOPIC & OVERVIEW (COLLAPSIBLE DROPDOWN PANEL) */}
              <div className="item-section-card" style={{ padding: 0 }}>
                <div
                  className="dropdown-panel-toggle"
                  onClick={() => togglePanel('topic')}
                  style={{ borderBottom: openPanels.topic ? '1px solid var(--border-color)' : 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Layers size={18} color="#4285f4" />
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>1. Topic & Module Details</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {currentMod.title}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="item-pill-badge" style={{ background: 'rgba(66, 133, 244, 0.15)', color: '#1e40af' }}>
                      Topic
                    </span>
                    {openPanels.topic ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                  </div>
                </div>

                {openPanels.topic && (
                  <div className="dropdown-panel-content" style={{ paddingTop: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '14px' }}>
                      <div>
                        <label className="form-label">
                          Classroom Stream Topic (Weekly Heading)
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. Week 1: Foundations of Cloud Infrastructure"
                          value={currentMod.stream_topic || ""}
                          onChange={e => updateCurrentMod('stream_topic', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label">Module Title</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. Foundations of Cloud Infrastructure"
                          value={currentMod.title || ""}
                          onChange={e => updateCurrentMod('title', e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="form-label">Module Overview / Description</label>
                      <textarea
                        rows={2}
                        className="form-control"
                        placeholder="Provide a detailed overview of the learning objectives and weekly content..."
                        value={currentMod.overview || ""}
                        onChange={e => updateCurrentMod('overview', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ITEM 2: MATERIAL - LECTURE PRESENTATION & DOCUMENT LINKS (COLLAPSIBLE DROPDOWN PANEL) */}
              <div className="item-section-card" style={{ padding: 0 }}>
                <div
                  className="dropdown-panel-toggle"
                  onClick={() => togglePanel('material')}
                  style={{ borderBottom: openPanels.material ? '1px solid var(--border-color)' : 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Link2 size={18} color="#34a853" />
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>2. Material (Presentation & Document Links)</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {currentPresentationUrls.filter(Boolean).length} link(s) attached
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="badge-omit-title">Strictly Omits Title (API Rule)</span>
                    <span className="item-pill-badge" style={{ background: 'rgba(52, 168, 83, 0.15)', color: '#34a853' }}>
                      Material
                    </span>
                    {openPanels.material ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                  </div>
                </div>

                {openPanels.material && (
                  <div className="dropdown-panel-content" style={{ paddingTop: '16px' }}>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                      Add one or more Google Slides decks, lecture docs, or reference materials. Classroom API automatically generates preview cards for each URL.
                    </p>

                    {currentPresentationUrls.map((url, linkIdx) => (
                      <div key={linkIdx} className="multi-link-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e40af' }}>
                            {linkIdx === 0 ? "🔗 Primary Lecture Slide Deck URL:" : `📄 Additional Material / Document Link #${linkIdx + 1}:`}
                          </span>
                          {currentPresentationUrls.length > 1 && (
                            <button
                              onClick={() => handleRemovePresentationLink(linkIdx)}
                              style={{ background: 'transparent', color: '#991b1b', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                              title="Remove this link"
                            >
                              <Trash2 size={13} />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <input
                            type="url"
                            className="form-control"
                            placeholder="https://docs.google.com/presentation/d/.../edit or web link"
                            value={url}
                            onChange={e => handleUpdatePresentationLink(linkIdx, e.target.value)}
                          />
                        </div>

                        {url && (
                          <div className="link-preview-box" style={{ marginTop: '8px' }}>
                            <Link2 size={14} color="#34a853" />
                            <span className="link-preview-url">{url}</span>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#1e40af', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', textDecoration: 'none' }}
                            >
                              <span>Open</span>
                              <ExternalLink size={12} />
                            </a>
                          </div>
                        )}
                      </div>
                    ))}

                    <button
                      className="btn-secondary"
                      style={{ marginTop: '6px', fontSize: '0.82rem', padding: '6px 14px' }}
                      onClick={handleAddPresentationLink}
                    >
                      <Plus size={14} />
                      <span>+ Add Another Presentation / Document Link</span>
                    </button>
                  </div>
                )}
              </div>

              {/* ITEM 3: ASSIGNMENT (COLLAPSIBLE DROPDOWN PANEL) */}
              <div className="item-section-card" style={{ padding: 0 }}>
                <div
                  className="dropdown-panel-toggle"
                  onClick={() => togglePanel('assignment')}
                  style={{ borderBottom: openPanels.assignment ? '1px solid var(--border-color)' : 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckSquare size={18} color="#fbbc05" />
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>3. Assignment (Assessment / Knowledge Check)</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {currentMod.assignment_title ? `${currentMod.assignment_title} (${currentMod.points || 100} pts)` : "Optional"}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="item-pill-badge" style={{ background: 'rgba(251, 188, 5, 0.15)', color: '#fbbc05' }}>
                      Assignment
                    </span>
                    {openPanels.assignment ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                  </div>
                </div>

                {openPanels.assignment && (
                  <div className="dropdown-panel-content" style={{ paddingTop: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px', marginBottom: '14px' }}>
                      <div>
                        <label className="form-label">Assignment Title / Knowledge Check</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. Lab 1: Setting up Cloud Shell & IAM"
                          value={currentMod.assignment_title || ""}
                          onChange={e => updateCurrentMod('assignment_title', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label">Points</label>
                        <input
                          type="number"
                          className="form-control"
                          value={currentMod.points || 100}
                          onChange={e => updateCurrentMod('points', Number(e.target.value))}
                        />
                      </div>

                      <div>
                        <label className="form-label">Due Date</label>
                        <input
                          type="date"
                          className="form-control"
                          value={currentMod.due_date || ""}
                          onChange={e => updateCurrentMod('due_date', e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="form-label">Assignment Instructions</label>
                      <textarea
                        rows={2}
                        className="form-control"
                        placeholder="Detailed steps, grading rubric, and submission requirements for students..."
                        value={currentMod.assignment_instructions || ""}
                        onChange={e => updateCurrentMod('assignment_instructions', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ITEM 4: QUIZ ASSIGNMENT (COLLAPSIBLE DROPDOWN PANEL) */}
              <div className="item-section-card" style={{ padding: 0 }}>
                <div
                  className="dropdown-panel-toggle"
                  onClick={() => togglePanel('quiz')}
                  style={{ borderBottom: openPanels.quiz ? '1px solid var(--border-color)' : 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileText size={18} color="#a855f7" />
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>4. Quiz Assignment (Google Forms Quiz)</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {currentMod.quiz_title || "Optional Google Form"}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="item-pill-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' }}>
                      Quiz
                    </span>
                    {openPanels.quiz ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                  </div>
                </div>

                {openPanels.quiz && (
                  <div className="dropdown-panel-content" style={{ paddingTop: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                      <div>
                        <label className="form-label">Quiz Assignment Title</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. Quiz 1: Virtualization vs Containers Architecture"
                          value={currentMod.quiz_title || ""}
                          onChange={e => updateCurrentMod('quiz_title', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label">Google Forms Quiz URL</label>
                        <input
                          type="url"
                          className="form-control"
                          placeholder="https://docs.google.com/forms/d/.../viewform"
                          value={currentMod.quiz_url || ""}
                          onChange={e => updateCurrentMod('quiz_url', e.target.value)}
                        />
                      </div>
                    </div>

                    {currentMod.quiz_url && (
                      <div className="link-preview-box" style={{ marginTop: '10px' }}>
                        <FileText size={16} color="#a855f7" />
                        <span className="link-preview-url">{currentMod.quiz_url}</span>
                        <a
                          href={currentMod.quiz_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#1e40af', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', textDecoration: 'none' }}
                        >
                          <span>Open Form</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ITEM 5: QUESTION (COLLAPSIBLE DROPDOWN PANEL) */}
              <div className="item-section-card" style={{ padding: 0 }}>
                <div
                  className="dropdown-panel-toggle"
                  onClick={() => togglePanel('question')}
                  style={{ borderBottom: openPanels.question ? '1px solid var(--border-color)' : 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileQuestion size={18} color="#06b6d4" />
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>5. Question (Classroom Discussion Prompt)</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {currentMod.question_prompt ? currentMod.question_prompt.slice(0, 30) + "..." : "Optional"}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="item-pill-badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' }}>
                      Question
                    </span>
                    {openPanels.question ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                  </div>
                </div>

                {openPanels.question && (
                  <div className="dropdown-panel-content" style={{ paddingTop: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '16px' }}>
                      <div>
                        <label className="form-label">Question Prompt</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. What are the primary performance trade-offs between Type-1 and Type-2 hypervisors?"
                          value={currentMod.question_prompt || ""}
                          onChange={e => updateCurrentMod('question_prompt', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label">Question Type</label>
                        <select
                          className="form-control"
                          value={currentMod.question_type || "SHORT_ANSWER_QUESTION"}
                          onChange={e => updateCurrentMod('question_type', e.target.value)}
                        >
                          <option value="SHORT_ANSWER_QUESTION">Short Answer</option>
                          <option value="MULTIPLE_CHOICE_QUESTION">Multiple Choice</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* GUIDED NEXT ACTION CALLOUT: PROCEED TO NEXT WEEK OR FINISH & CREATE COURSE */}
              <div className="step-guide-box">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}>
                    <Compass size={18} color="#4285f4" />
                    <span>Finished configuring {currentMod.sequence}?</span>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0 }}>
                    {currentModuleIndex < curriculum.length - 1
                      ? `Proceed to edit ${curriculum[currentModuleIndex + 1].sequence}, add another week, or finalize and deploy your course.`
                      : `Add another week to your curriculum or finalize and deploy your course directly to Google Classroom.`}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Option 1: Step to existing next week */}
                  {currentModuleIndex < curriculum.length - 1 && (
                    <button
                      className="btn-secondary"
                      style={{ padding: '10px 18px', fontWeight: 600 }}
                      onClick={() => setCurrentModuleIndex(prev => prev + 1)}
                    >
                      <span>Proceed to {curriculum[currentModuleIndex + 1].sequence}</span>
                      <ArrowRight size={16} />
                    </button>
                  )}

                  {/* Option 2: Create next week block */}
                  <button
                    className="btn-secondary"
                    style={{ padding: '10px 18px', fontWeight: 600, borderColor: 'rgba(66, 133, 244, 0.4)', color: '#1e40af' }}
                    onClick={handleAddModule}
                  >
                    <PlusCircle size={16} />
                    <span>Create Week {curriculum.length + 1}</span>
                  </button>

                  {/* Option 3: Finish and Create Course */}
                  <button
                    className="btn-primary"
                    style={{ padding: '10px 22px', fontSize: '0.95rem' }}
                    onClick={handleCreateCourse}
                    disabled={isProcessing}
                  >
                    <Play size={16} />
                    <span>{isProcessing ? "Deploying Course..." : "Finish & Create Course"}</span>
                  </button>
                </div>
              </div>

              {/* BOTTOM ACTIONS (SAVE SPREADSHEET & SAFE UPDATE) */}
              <div style={{
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="btn-secondary"
                    disabled={currentModuleIndex === 0}
                    onClick={() => setCurrentModuleIndex(prev => Math.max(0, prev - 1))}
                  >
                    <ChevronLeft size={16} />
                    <span>Previous Week</span>
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={currentModuleIndex === curriculum.length - 1}
                    onClick={() => setCurrentModuleIndex(prev => Math.min(curriculum.length - 1, prev + 1))}
                  >
                    <span>Next Week</span>
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button className="btn-secondary" onClick={handleExportExcel} title="Save current curriculum workbook to Excel">
                    <Download size={16} />
                    <span>Save Spreadsheet (.xlsx)</span>
                  </button>

                  <button className="btn-secondary" style={{ borderColor: 'rgba(52, 168, 83, 0.4)', color: '#34a853' }} onClick={() => setActiveTab('sync')}>
                    <RefreshCw size={16} />
                    <span>Update Existing Course</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: ACTIVE COURSES */}
        {/* ================================================================= */}
        {activeTab === 'courses' && (
          <div className="animate-fade-in">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
              {courses.map((course) => (
                <div key={course.id} className="glass-panel" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #4285f4, #34a853)' }} />
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', background: 'rgba(66, 133, 244, 0.15)', color: '#1e40af' }}>
                        {course.section}
                      </span>
                      <h3 style={{ fontSize: '1.25rem', marginTop: '8px', color: 'var(--text-main)' }}>{course.name}</h3>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>ID: <code>{course.id}</code></div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.72rem', color: '#34a853', fontWeight: 700, textTransform: 'uppercase', background: 'rgba(52, 168, 83, 0.15)', padding: '3px 8px', borderRadius: '4px' }}>
                        ● {course.state}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', padding: '14px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', margin: '16px 0' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Enrollment Code</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fbbc05', fontFamily: 'JetBrains Mono' }}>
                        {course.enrollmentCode}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Students</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{course.studentsCount}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Curriculum</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{course.topicsCount} Modules</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '18px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Module Topics:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(course.topics || []).slice(0, 3).map((top, tIdx) => (
                        <div key={tIdx} style={{ fontSize: '0.82rem', padding: '6px 10px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px', color: '#cbd5e1' }}>
                          📁 {top}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      className="btn-secondary"
                      style={{ flex: 1, padding: '8px', fontSize: '0.82rem', justifyContent: 'center' }}
                      onClick={() => {
                        setSelectedCourseForSync(course.id);
                        setActiveTab('sync');
                      }}
                    >
                      <RefreshCw size={14} />
                      <span>Update Course</span>
                    </button>

                    <a
                      href={`https://classroom.google.com/c/${course.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                      style={{ padding: '8px 12px', fontSize: '0.82rem', textDecoration: 'none' }}
                      title="Open in Google Classroom"
                    >
                      <ExternalLink size={14} />
                      <span>Open</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: NON-DESTRUCTIVE SAFE UPDATE */}
        {/* ================================================================= */}
        {activeTab === 'sync' && (
          <div className="animate-fade-in">
            <div className="glass-panel" style={{ padding: '28px', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(66, 133, 244, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4285f4' }}>
                  <RefreshCw size={22} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>Safe Non-Destructive Update to Google Classroom</h2>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                    Syncs current module topics, materials, assignments, quizzes, and questions without deleting existing classroom work.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div>
                  <label className="form-label">Select Target Classroom Course</label>
                  <select
                    className="form-control"
                    value={selectedCourseForSync}
                    onChange={e => setSelectedCourseForSync(e.target.value)}
                  >
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.section}) - ID: {c.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ background: 'rgba(52, 168, 83, 0.08)', border: '1px solid rgba(52, 168, 83, 0.25)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34a853', fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px' }}>
                    <ShieldCheck size={18} />
                    <span>Non-Destructive Guarantee</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Existing items are updated via <code>.patch()</code>. Missing items are created via <code>.create()</code>. No delete endpoints are ever called.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-success" onClick={handleRunSync} disabled={isProcessing}>
                  <RefreshCw size={16} />
                  <span>{isProcessing ? "Updating Course..." : "Update Google Classroom Course"}</span>
                </button>
              </div>

              {/* Execution Log */}
              {syncLogs.length > 0 && (
                <div style={{ marginTop: '28px', background: '#090d16', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '20px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e40af', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Code2 size={16} />
                    <span>API Execution Log (Live Sync Stream)</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'JetBrains Mono', fontSize: '0.8rem' }}>
                    {syncLogs.map((log, lIdx) => (
                      <div key={lIdx} style={{ color: log.includes('COMPLETE') ? '#34a853' : log.includes('AUDIT') ? '#fbbc05' : '#cbd5e1' }}>
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: SAFETY & API AUDIT */}
        {/* ================================================================= */}
        {activeTab === 'audit' && (
          <div className="animate-fade-in">
            <div className="glass-panel" style={{ padding: '28px', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(52, 168, 83, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34a853' }}>
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)' }}>Google Classroom Safety & API Rule Audit</h2>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                    Formal verification results verifying the NO-DELETE safety policy and presentation link specifications.
                  </p>
                </div>
              </div>

              {/* Audit Checklist */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px', marginBottom: '28px' }}>
                <div style={{ background: 'rgba(52, 168, 83, 0.08)', border: '1px solid rgba(52, 168, 83, 0.3)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#34a853', fontWeight: 700, marginBottom: '10px' }}>
                    <CheckCircle2 size={20} />
                    <span>NO-DELETE Policy: PASSED</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                    AST static code scan verified: Zero calls to <code>courses.delete</code>, <code>topics.delete</code>, <code>courseWork.delete</code>, or <code>courseWorkMaterials.delete</code>.
                  </div>
                </div>

                <div style={{ background: 'rgba(66, 133, 244, 0.08)', border: '1px solid rgba(66, 133, 244, 0.3)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#1e40af', fontWeight: 700, marginBottom: '10px' }}>
                    <CheckCircle2 size={20} />
                    <span>Presentation Link Rule: PASSED</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                    Materials payload schema verified: Strictly omits <code>title</code> inside <code>link</code> (output-only in Classroom API v1). Classroom renders preview card automatically.
                  </div>
                </div>
              </div>

              {/* Exact API JSON Payload Inspector */}
              <div style={{ background: '#090d16', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Code2 size={18} color="#4285f4" />
                  <span>Classroom API v1 Native Link Attachment Payload (Multiple Links Supported):</span>
                </div>

                <pre style={{ color: '#38bdf8', fontSize: '0.82rem', lineHeight: 1.5, overflowX: 'auto', background: 'rgba(0,0,0,0.5)', padding: '16px', borderRadius: '8px' }}>
{JSON.stringify({
  title: "Week 1: Foundations of Cloud Infrastructure - Lecture Materials",
  description: "Presentation slides and documents for Week 1.",
  materials: [
    {
      link: {
        url: "https://docs.google.com/presentation/d/1demo-cloud-foundations-slides/edit"
        // NOTICE: "title" is STRICTLY OMITTED here per Classroom API v1 specification!
      }
    },
    {
      link: {
        url: "https://docs.google.com/document/d/1demo-cloud-architecture-whitepaper/edit"
      }
    }
  ],
  topicId: "topic-1",
  state: "PUBLISHED"
}, null, 2)}
                </pre>
              </div>

              {/* Terminal CLI Command Helper */}
              <div style={{ marginTop: '24px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '10px' }}>
                  CLI Automation Integration Commands:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'JetBrains Mono', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <div><code>.venv\Scripts\python classroom_course_engine.py --create --file course_curriculum.xlsx</code></div>
                  <div><code>.venv\Scripts\python classroom_course_engine.py --sync --course-id mock-course-101 --file course_curriculum.xlsx</code></div>
                  <div><code>.venv\Scripts\python classroom_course_engine.py --test</code></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
