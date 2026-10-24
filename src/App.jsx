import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Users,
  UserPlus,
  Search,
  GraduationCap,
  BookOpen,
  PlusCircle,
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
  Play,
  LogOut,
  Mail,
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
  KeyRound,
  Coins,
  X
} from 'lucide-react';
import RegistrationModal from './components/RegistrationModal';
import ClassroomEnvironment from './components/ClassroomEnvironment';
import DeployProgress from './components/DeployProgress';
import Toast, { toastType } from './components/Toast';
import QuizQuestionsEditor from './components/QuizQuestionsEditor';
import RolePermissionsManager from './components/RolePermissionsManager';
import TokensPanel from './components/TokensPanel';
import { PermissionGuard, PermissionNotice, PermissionProvider, useRbacSession } from './rbac/PermissionContext';
import { DEFAULT_ROLE, ROLE_BY_KEY, SUPERADMIN_ROLE } from './rbac/permissions';
import {
  BLANK_SETTINGS, NOTEBOOK_HOSTS_TEXT, TEMPLATE_EXAMPLE, blankModule, buildCourseWorkbook, buildDeployedWorkbook,
  importCourseWorkbook, isIsoDue, isNotebookUrl, isSheetLink, nonEmptyChoices, quizQuestionProblems, quizTotalPoints,
  splitDue, withBrowserOffset,
} from './lib/courseWorkbook';

const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const youtubeId = (url) => (String(url || '').match(YOUTUBE_ID) || [])[1] || null;

// Everything attached to a topic's lecture-materials post: notebook, links and videos.
const topicAttachmentCount = (mod) =>
  ((mod.presentation_urls && mod.presentation_urls.filter(Boolean).length) || (mod.presentation_url ? 1 : 0))
  + (mod.youtube_urls || []).filter(Boolean).length
  + (mod.notebook_enabled && mod.notebook_url ? 1 : 0);
import { 
  signInWithGoogle, 
  logOutUser, 
  subscribeToAuth, 
  subscribeToUserProfile, 
  getAllUsersFromFirebase,
  checkRedirectAuthResult,
  signInWithGoogleIdToken
} from './services/firebaseAuthService';
import { auth, isFirebaseConfigured } from './firebase';

// Course points as the server reads them: blank means the default, 0 means ungraded.
const pointsOr = (value, fallback) => (value === '' || value == null || Number.isNaN(Number(value)) ? fallback : Number(value));
// Every graded post a week creates, with the server's defaults (assignment 100, quiz 50 or the
// total of its questions, question 20).
const weekPoints = (mod) => (mod.assignment_title ? pointsOr(mod.points, 100) : 0)
  + ((mod.quiz_questions || []).length ? quizTotalPoints(mod) : (mod.quiz_title || mod.quiz_url ? pointsOr(mod.quiz_points, 50) : 0))
  + (mod.question_prompt ? pointsOr(mod.question_points, 20) : 0);

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

// Made-up teacher and student addresses used by the samples above
const SAMPLE_EMAILS = new Set(
  Object.values(SAMPLE_PRESETS)
    .flatMap(p => [...((p.settings && p.settings.teachers) || []), ...(p.students || [])])
    .map(e => String(e).toLowerCase())
);

export default function App() {
  // Two sign-ins. classroomUser is the server's Google sign-in (/api/auth/me): the server keeps the
  // teacher's Classroom token and every Classroom call uses it, so it decides who is logged in.
  // firebaseProfile is the optional Firebase LMS profile (classification, superadmin); it only adds
  // those fields, and only when it is the same Google account.
  const [classroomUser, setClassroomUser] = useState(null);
  const [firebaseProfile, setFirebaseProfile] = useState(null);
  const sameAccount = Boolean(classroomUser && firebaseProfile
    && String(classroomUser.email || '').toLowerCase() === String(firebaseProfile.email || '').toLowerCase());
  const currentUser = classroomUser ? { ...(sameAccount ? firebaseProfile : {}), ...classroomUser } : null;

  const connectFirebaseRef = useRef(null);

  // Role-based permissions (src/rbac) of that same Firebase account: the owner is Superadmin, everyone
  // else has the role the Superadmin assigned to their email, else supporter. Signed in to Classroom
  // while Firebase is syncing or mismatched: the supporter's baseline.
  const rbac = useRbacSession({
    uid: sameAccount ? firebaseProfile.uid : null,
    classroomUser,
    onConnectFirebase: () => connectFirebaseRef.current?.(),
  });
  // The Superadmin is the owner's Google account, recognised from the Firebase sign-in
  const isSuperAdmin = Boolean(currentUser?.isSuperAdmin) || rbac.role === SUPERADMIN_ROLE;
  // Role Permissions needs Firebase: the Superadmin changes it, and roles.manage can look
  const canOpenRoles = isFirebaseConfigured && sameAccount && (rbac.can('roles.manage') || isSuperAdmin);
  // Signed-out users keep the button: creating a course asks them to log in first.
  // Only block creation if the account is signed in and an active role is loaded without course creation permission.
  const createBlocked = Boolean(currentUser) && !rbac.can('courses.create');

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registrationModalView, setRegistrationModalView] = useState('form');
  const [lmsMembers, setLmsMembers] = useState([]);
  const [loadingLmsMembers, setLoadingLmsMembers] = useState(false);

  // Fetch all registered members from Firebase Database
  const fetchLmsMembers = async () => {
    setLoadingLmsMembers(true);
    try {
      const users = await getAllUsersFromFirebase();
      if (users && users.length > 0) {
        setLmsMembers(users);
      }
    } catch (err) {
      console.error("Failed to fetch LMS users:", err);
    } finally {
      setLoadingLmsMembers(false);
    }
  };

  // Back from Stripe's token checkout (?tokens=...): open Tokens, which confirms the payment
  const [activeTab, setActiveTab] = useState(() =>
    new URLSearchParams(window.location.search).has('tokens') ? 'tokens' : 'studio');
  // Leave Role Permissions on sign-out, or when the role no longer opens it
  useEffect(() => {
    if (activeTab === 'roles' && !canOpenRoles) setActiveTab('studio');
  }, [activeTab, canOpenRoles]);
  // Tokens stays mounted once opened: its script binds to the panel's elements once
  const [tokensOpened, setTokensOpened] = useState(false);
  useEffect(() => {
    if (activeTab === 'tokens') setTokensOpened(true);
  }, [activeTab]);

  // Persist course drafts to localStorage to prevent data loss on browser refresh or sign-in reload
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("gcb_draft_settings");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return SAMPLE_PRESETS.cloud.settings;
  });
  const [curriculum, setCurriculum] = useState(() => {
    try {
      const saved = localStorage.getItem("gcb_draft_curriculum");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return SAMPLE_PRESETS.cloud.curriculum;
  });
  const [students, setStudents] = useState(() => {
    try {
      const saved = localStorage.getItem("gcb_draft_students");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return SAMPLE_PRESETS.cloud.students || [];
  });

  useEffect(() => {
    try {
      localStorage.setItem("gcb_draft_settings", JSON.stringify(settings));
    } catch (e) {}
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem("gcb_draft_curriculum", JSON.stringify(curriculum));
    } catch (e) {}
  }, [curriculum]);

  useEffect(() => {
    try {
      localStorage.setItem("gcb_draft_students", JSON.stringify(students));
    } catch (e) {}
  }, [students]);

  // Teacher & Student input controls
  const [newTeacherEmail, setNewTeacherEmail] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [bulkStudentText, setBulkStudentText] = useState("");
  const [showBulkStudentModal, setShowBulkStudentModal] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  
  // Single-module editor navigation state
  const [currentModuleIndex, setCurrentModuleIndex] = useState(() => {
    try {
      const saved = localStorage.getItem("gcb_draft_module_idx");
      if (saved !== null) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    } catch (e) {}
    return 0;
  });

  useEffect(() => {
    try {
      localStorage.setItem("gcb_draft_module_idx", String(currentModuleIndex));
    } catch (e) {}
  }, [currentModuleIndex]);

  const [showReviewAllModal, setShowReviewAllModal] = useState(false);
  const [importedWorkbookInfo, setImportedWorkbookInfo] = useState(() => {
    try {
      const saved = localStorage.getItem("gcb_draft_workbook_info");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  });

  useEffect(() => {
    try {
      if (importedWorkbookInfo) {
        localStorage.setItem("gcb_draft_workbook_info", JSON.stringify(importedWorkbookInfo));
      } else {
        localStorage.removeItem("gcb_draft_workbook_info");
      }
    } catch (e) {}
  }, [importedWorkbookInfo]);

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
    e.target.value = '';
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
    const safeName = (settings.class_name || "Course").trim().replace(/[^a-zA-Z0-9]/g, "_") || "Course";
    const fileName = `${safeName}_Students_Roster.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Downloaded student roster "${fileName}"!`);
  };

  const [courses, setCourses] = useState([]);
  const [toast, setToast] = useState(null);
  const toastIdRef = React.useRef(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deployProgress, setDeployProgress] = useState(null);

  // showToast(text) or showToast(text, 'error' | 'success' | 'info'). Without a type it is worked
  // out from the wording. Each message gets its own id, so its timer is its own (see Toast.jsx).
  const showToast = (msg, type) => {
    if (!msg) return;
    const text = String(msg);
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, text, type: toastType(text, type) });
  };
  const closeToast = useCallback(() => setToast(null), []);

  // Classroom access comes from the server's Google sign-in, which stores the teacher's token.
  const connectClassroom = () => { window.location.href = '/api/auth/google_login'; };

  // Who is signed in to Classroom (cheap: the server reads its own session file)
  // One Google sign-in for both: after the Classroom sign-in, /api/auth/me hands over its Google ID
  // token for a while, and that signs the same account in to Firebase (roles, tokens), so there is no
  // second Google window. Each token is tried once; Sync Firebase is the fallback.
  const triedIdTokens = useRef(new Set());
  const connectFirebaseFromSignIn = async (email, idToken) => {
    if (!isFirebaseConfigured || !idToken || triedIdTokens.current.has(idToken)) return;
    triedIdTokens.current.add(idToken);
    await auth.authStateReady();
    if (String(auth.currentUser?.email || '').toLowerCase() === String(email || '').toLowerCase()) return;
    try {
      await signInWithGoogleIdToken(idToken);
    } catch (err) {
      console.warn("[Firebase Auth] Could not sign in to Firebase with the Google sign-in:", err.code || err.message);
    }
  };

  const refreshSession = async () => {
    try {
      const authRes = await fetch('/api/auth/me');
      const data = authRes.ok ? await authRes.json() : null;
      if (data && data.authenticated) {
        const { firebase_id_token: idToken, ...user } = data;
        setClassroomUser(prev => (JSON.stringify(prev) === JSON.stringify(user) ? prev : user));
        localStorage.setItem("gcb_user_session", JSON.stringify(user));
        connectFirebaseFromSignIn(user.email, idToken);
        return user;
      }
      setClassroomUser(null);
      localStorage.removeItem("gcb_user_session");
    } catch (err) {
      console.log("Session check:", err);
    }
    return null;
  };

  // The teacher's Classroom courses, for the course count. One list call; not polled, because every
  // read is a Google API call. Vercel has no /api/classroom routes, so it falls back to /api/courses.
  const refreshCourses = async () => {
    try {
      let res = await fetch('/api/classroom/courses');
      if (res.status === 404) res = await fetch('/api/courses');
      const data = res.ok ? await res.json() : {};
      setCourses(res.ok ? (data.courses || []) : []);
    } catch (err) {
      console.log("Course list:", err);
    }
  };

  const classroomEmail = classroomUser ? classroomUser.email : null;
  useEffect(() => {
    if (classroomEmail) refreshCourses();
    else setCourses([]);
  }, [classroomEmail]);

  useEffect(() => {
    // 1. Returning from a Firebase redirect sign-in: finish by connecting Classroom
    checkRedirectAuthResult().then(async profile => {
      if (profile) {
        setFirebaseProfile(profile);
        if (!(await refreshSession())) connectClassroom();
      }
    });

    // 2. Subscribe to Firebase real-time auth state
    const unsubscribeAuth = subscribeToAuth((profile) => setFirebaseProfile(profile || null));

    // 3. Check URL parameters for OAuth status notifications
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_success")) {
      showToast("Signed in with Google! Your course draft has been preserved.");
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get("login_error")) {
      const err = params.get("login_error");
      showToast(`Google Sign-in: ${err}`, 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    refreshSession();
    const interval = setInterval(refreshSession, 15000);

    return () => {
      unsubscribeAuth();
      clearInterval(interval);
    };
  }, []);

  // Real-time synchronization of user profile & role changes
  const firebaseUid = firebaseProfile ? firebaseProfile.uid : null;
  useEffect(() => {
    if (!firebaseUid) return;
    const unsub = subscribeToUserProfile(firebaseUid, (updatedData) => {
      if (updatedData) {
        setFirebaseProfile(prev => (prev ? { ...prev, ...updatedData } : prev));
      }
    });
    return () => unsub();
  }, [firebaseUid]);

  // Sign-in: one Google window, for Classroom access. The same account is then signed in to
  // Firebase from that sign-in (refreshSession), so its role applies straight away.
  const handleLogin = () => {
    setIsLoggingIn(true);
    connectClassroom();
  };

  // Sync Firebase: Firebase's own Google window, for when the Classroom sign-in could not sign in to
  // Firebase (an older session, or a Firebase problem). A Firebase problem never blocks Classroom.
  const handleConnectFirebase = async () => {
    if (!isFirebaseConfigured) return;
    try {
      const userProfile = await signInWithGoogle();
      if (!userProfile) return; // Firebase redirect sign-in: finished when it returns
      setFirebaseProfile(userProfile);
      showToast(`Connected Firebase account: ${userProfile.email}`);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        console.warn("[Firebase Google Auth] Sync Firebase failed:", err);
        showToast(`Could not connect Firebase: ${err.message}`, 'error');
      }
    }
  };
  connectFirebaseRef.current = handleConnectFirebase;

  const handleLogout = async () => {
    try {
      await logOutUser();
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } catch (e) {
      console.log(e);
    }
    localStorage.removeItem("gcb_user_session");
    localStorage.removeItem("gcb_active_user");
    setClassroomUser(null);
    setFirebaseProfile(null);
    showToast("Signed out of Google session.");
  };

  // The Course Builder workbook. Template, Save .xlsx and Upload share one definition
  // (src/lib/courseWorkbook.js), so every field is written to a column and read back from it.

  // 1. Download the starter template: an example course that fills every field once
  const handleDownloadTemplate = () => {
    XLSX.writeFile(buildCourseWorkbook(TEMPLATE_EXAMPLE), "Google_Classroom_Course_Template.xlsx");
    showToast("Downloaded 'Google_Classroom_Course_Template.xlsx'. Replace the example course with yours, then upload it.");
  };

  // 2. Save the form as a workbook that uploads back unchanged
  const handleExportExcel = () => {
    const fileName = `${(settings.class_name || "Course").replace(/[^a-zA-Z0-9]/g, "_")}_Curriculum.xlsx`;
    XLSX.writeFile(buildCourseWorkbook({ settings, curriculum, students }), fileName);
    showToast(`Saved "${fileName}" (${curriculum.length} weeks, ${students.length} students).`);
  };

  // A course read from a workbook replaces everything in the form. Used by Upload .xlsx and by
  // the AI panels, which hand template workbooks straight here instead of to the AI.
  const applyImportedCourse = (course, fileName) => {
    setSettings(course.settings);
    setStudents(course.students);
    setCurriculum(course.curriculum);
    setCurrentModuleIndex(0);
    setActiveTab('studio');
    setImportedWorkbookInfo({
      loaded: true,
      fileName,
      courseName: course.settings.class_name,
      section: course.settings.section,
      weekCount: course.curriculum.length,
      teacherCount: course.settings.teachers.length,
      studentCount: course.students.length,
      warnings: course.warnings,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    showToast(course.warnings.length > 0
      ? `Loaded "${fileName}", with ${course.warnings.length} thing(s) to check. They are listed above the weeks.`
      : `Loaded "${fileName}": ${course.curriculum.length} weeks and ${course.settings.teachers.length} co-teachers. Review, then press Finish & Create Course.`);
  };

  // 3. Upload a workbook. It is the whole course, so it replaces everything in the form.
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const course = importCourseWorkbook(new Uint8Array(evt.target.result));
        if (course.curriculum.length === 0) {
          showToast(`Nothing was loaded from "${file.name}": ${course.warnings.join(' ')}`, 'error');
          return;
        }
        applyImportedCourse(course, file.name);
      } catch (err) {
        showToast(`Could not read "${file.name}": ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Add Week Module (avoids duplicate week numbers if middle weeks were deleted)
  const handleAddModule = () => {
    const existingWeeks = curriculum.map(m => {
      if (m.week_number && Number(m.week_number) > 0) return Number(m.week_number);
      const match = String(m.sequence || '').match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    }).filter(n => n > 0);
    const nextWeek = (existingWeeks.length > 0 ? Math.max(...existingWeeks) : curriculum.length) + 1;
    // An empty week. Made-up links, a fixed due date or filler coursework here would be
    // published to Classroom as real posts if the teacher did not notice them.
    const newMod = { ...blankModule(nextWeek), title: `Module ${nextWeek}` };
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

  // Clearing: the whole form, or one section. Nothing is cleared until the teacher confirms.
  const [clearRequest, setClearRequest] = useState(null); // { title, body, onConfirm, done }

  const clearWholeForm = () => {
    setSettings({ ...BLANK_SETTINGS, teachers: [] });
    setCurriculum([blankModule(1)]);
    setStudents([]);
    setCurrentModuleIndex(0);
    setImportedWorkbookInfo(null);
    setNewTeacherEmail("");
    setNewStudentEmail("");
    setBulkStudentText("");
    setStudentSearchQuery("");
    try {
      localStorage.removeItem("gcb_draft_settings");
      localStorage.removeItem("gcb_draft_curriculum");
      localStorage.removeItem("gcb_draft_students");
      localStorage.removeItem("gcb_draft_workbook_info");
      localStorage.removeItem("gcb_draft_module_idx");
    } catch (e) {}
  };

  const requestClearForm = () => setClearRequest({
    title: "Clear the whole form?",
    body: `This removes everything for ${settings.class_name || "this course"}: course settings, ${(settings.teachers || []).length} co-teacher(s), ${students.length} student(s), and all ${curriculum.length} week(s) with their links, notebooks, videos and coursework.`,
    onConfirm: clearWholeForm,
    done: "Form cleared. Start a new course from Week 1.",
  });

  // Fields each week section owns. Clearing a week section resets only the week being edited.
  const WEEK_SECTION_FIELDS = {
    topic: { label: "Topic & Module Details", fields: { stream_topic: "", title: "", overview: "" } },
    material: { label: "Material (links, notebook & YouTube)", fields: { presentation_urls: [""], presentation_url: "", youtube_urls: [""], notebook_enabled: false, notebook_url: "" } },
    assignment: { label: "Assignment", fields: { assignment_title: "", assignment_instructions: "", rubric_url: "", points: 100, due_date: "" },
      note: " The due date is shared with this week's quiz and question, so it is cleared for them too." },
    quiz: { label: "Quiz Assignment", fields: { quiz_title: "", quiz_url: "", quiz_points: "", quiz_questions: [] } },
    question: { label: "Question", fields: { question_prompt: "", question_type: "SHORT_ANSWER_QUESTION", question_choices: [], question_points: "" } },
  };

  const requestSectionClear = (section) => {
    if (section === 'metadata') {
      setClearRequest({
        title: "Clear Course Settings?",
        body: `This empties the course name, section, subject, level, room, welcome announcement and ${(settings.teachers || []).length} co-teacher(s). Weeks and students stay.`,
        onConfirm: () => { setSettings({ ...BLANK_SETTINGS, teachers: [] }); setNewTeacherEmail(""); },
        done: "Course settings cleared.",
      });
    } else if (section === 'students') {
      setClearRequest({
        title: "Clear the student roster?",
        body: `This removes all ${students.length} student(s) from the form. Weeks and course settings stay.`,
        onConfirm: () => { setStudents([]); setNewStudentEmail(""); setBulkStudentText(""); setStudentSearchQuery(""); },
        done: "Student roster cleared.",
      });
    } else {
      const { label, fields, note = "" } = WEEK_SECTION_FIELDS[section];
      const week = currentMod.sequence || `Week ${currentModuleIndex + 1}`;
      const index = currentModuleIndex;
      setClearRequest({
        title: `Clear ${label} for ${week}?`,
        body: `This empties the ${label} section of ${week} only. Other weeks and sections stay.${note}`,
        onConfirm: () => setCurriculum(prev => prev.map((m, i) => i === index ? { ...m, ...fields } : m)),
        done: `${label} cleared for ${week}.`,
      });
    }
  };

  const confirmClear = () => {
    clearRequest.onConfirm();
    showToast(clearRequest.done);
    setClearRequest(null);
  };

  // Small Clear button for a panel header. It must not also toggle the panel open or closed.
  const sectionClearButton = (section) => (
    <button
      type="button"
      className="btn-secondary"
      onClick={e => { e.stopPropagation(); requestSectionClear(section); }}
      disabled={isProcessing}
      title="Clear this section"
      style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#ea4335' }}
    >
      <Trash2 size={13} />
      <span>Clear</span>
    </button>
  );

  // Create course action (Upload to Google Classroom)
  const handleCreateCourse = async () => {
    if (!currentUser) {
      showToast("Please log in with your Google Classroom account to publish courses.", 'error');
      setShowLoginModal(true);
      return;
    }

    if (createBlocked) {
      showToast(rbac.explain('courses.create'));
      return;
    }

    if (!(settings.class_name || "").trim()) {
      showToast("Give the course a name (Course Settings) before creating it.", 'error');
      setOpenPanels(prev => ({ ...prev, metadata: true }));
      return;
    }

    // The built-in samples use made-up addresses. Co-teachers are invited when they cannot be
    // added, and inviting made-up people wastes the teacher's Google invitation limit (and mails
    // a real domain), so refuse until they are removed. Students are never added automatically.
    const sampleTeachers = (settings.teachers || [])
      .map(e => String(typeof e === 'string' ? e : (e && e.email) || '').toLowerCase())
      .filter(e => SAMPLE_EMAILS.has(e));
    if (sampleTeachers.length > 0) {
      showToast(`Remove the ${sampleTeachers.length} sample co-teacher(s) first (e.g. ${sampleTeachers[0]}). They are made-up addresses, and inviting them uses up your Google invitation limit. Use Clear on Course Settings.`, 'error');
      return;
    }

    const seenSequences = new Set();
    for (const mod of curriculum) {
      const seq = String(mod.sequence || '').trim().toLowerCase();
      if (seenSequences.has(seq)) {
        showToast(`Duplicate week name "${mod.sequence || 'Week'}": each week module must have a distinct Week name so quizzes and coursework remain properly separated.`);
        return;
      }
      seenSequences.add(seq);
    }

    const badNotebook = curriculum.find(m => m.notebook_enabled && m.notebook_url && !isNotebookUrl(m.notebook_url));
    if (badNotebook) {
      showToast(`${badNotebook.sequence || 'A topic'}: the notebook link must start with ${NOTEBOOK_HOSTS_TEXT}.`);
      return;
    }

    const badDue = curriculum.find(m => !isIsoDue(m.due_date));
    if (badDue) {
      showToast(`${badDue.sequence || 'A week'}: due date "${badDue.due_date}" is not ISO 8601. Use YYYY-MM-DD, or YYYY-MM-DDTHH:MM for a time.`);
      return;
    }

    const badChoices = curriculum.find(m => m.question_prompt && m.question_type === 'MULTIPLE_CHOICE_QUESTION' && nonEmptyChoices(m).length < 2);
    if (badChoices) {
      showToast(`${badChoices.sequence || 'A week'}: the multiple-choice question needs at least 2 choices (Question panel).`);
      return;
    }

    for (const mod of curriculum) {
      const index = (mod.quiz_questions || []).findIndex(q => quizQuestionProblems(q).length > 0);
      if (index >= 0) {
        showToast(`${mod.sequence || 'A week'}, quiz question ${index + 1}: ${quizQuestionProblems(mod.quiz_questions[index]).join('; ')} (Quiz panel).`, 'error');
        return;
      }
    }

    const badRubric = curriculum.find(m => m.rubric_url && !isSheetLink(m.rubric_url));
    if (badRubric) {
      showToast(`${badRubric.sequence || 'A week'}: the rubric link must be the full link of a Google Sheet (Assignment panel).`);
      return;
    }

    setIsProcessing(true);
    // Keep a copy of exactly what is sent: the completion workbook is built from it.
    const deployed = JSON.parse(JSON.stringify({ settings, curriculum, students }));
    setDeployProgress({ status: 'starting', log: [], courseName: settings.class_name, deployed });
    try {
      const res = await fetch('/api/courses/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Due dates carry the browser's offset, so a UTC server does not shift them.
        body: JSON.stringify({
          settings,
          curriculum: curriculum.map(m => ({ ...m, due_date: withBrowserOffset(m.due_date) })),
          students,
        })
      });
      const started = await res.json().catch(() => ({}));
      if (!res.ok || !started.jobId) {
        if (res.status === 404) {
          throw new Error('Course creation engine is not available on this server. The course creator requires the fullstack Python backend (run "npm run dev" locally or connect your Cloud Run container).');
        }
        throw new Error(started.error || `Server responded with status: ${res.status}`);
      }

      // Poll the background job. The server answers instantly; the build itself can take minutes.
      let misses = 0;
      while (true) {
        await new Promise(r => setTimeout(r, 1500));
        let job;
        try {
          const poll = await fetch(`/api/courses/create/status?job=${encodeURIComponent(started.jobId)}`);
          job = await poll.json();
          if (!poll.ok) throw new Error(job.error || `status ${poll.status}`);
          misses = 0;
        } catch (pollErr) {
          if (++misses >= 5) throw new Error(`Lost contact with the server while deploying (${pollErr.message}). Check Google Classroom before trying again, as the course may already exist.`);
          continue;
        }
        setDeployProgress(p => ({ ...p, status: job.status, log: job.log || [], error: job.error, result: job.result }));
        if (job.status === 'error') throw new Error(job.error);
        if (job.status === 'done') {
          const failed = job.result.failedSteps || [];
          showToast(`Created "${deployed.settings.class_name}". Class code: ${job.result.enrollmentCode || 'see Classroom'}.${failed.length ? ` ${failed.length} step(s) need attention: see the deployment log.` : ''}`, failed.length ? 'error' : 'success');
          try {
            localStorage.removeItem("gcb_draft_settings");
            localStorage.removeItem("gcb_draft_curriculum");
            localStorage.removeItem("gcb_draft_students");
            localStorage.removeItem("gcb_draft_workbook_info");
            localStorage.removeItem("gcb_draft_module_idx");
          } catch (e) {}
          break;
        }
      }
      setActiveTab('courses');
      // Refresh the course count without blocking the button.
      refreshCourses();
    } catch (err) {
      console.error(err);
      setDeployProgress(p => p ? { ...p, status: 'error', error: err.message } : p);
      showToast(`Error creating course: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // The completion workbook: the course as sent, plus the class code, every post and the log
  const handleDownloadDeployedWorkbook = () => {
    if (!deployProgress || !deployProgress.result || !deployProgress.deployed) return;
    const fileName = `${(deployProgress.deployed.settings.class_name || "Course").replace(/[^a-zA-Z0-9]/g, "_")}_Classroom_Course.xlsx`;
    XLSX.writeFile(buildDeployedWorkbook(deployProgress.deployed, deployProgress.result), fileName);
    showToast(`Downloaded "${fileName}".`);
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

  // YouTube videos for the current topic (attached as native Classroom video materials)
  const currentYoutubeUrls = (currentMod.youtube_urls && currentMod.youtube_urls.length > 0) ? currentMod.youtube_urls : [""];
  const handleAddYoutubeUrl = () => updateCurrentMod('youtube_urls', [...currentYoutubeUrls, ""]);
  const handleUpdateYoutubeUrl = (idx, url) => updateCurrentMod('youtube_urls', currentYoutubeUrls.map((u, i) => i === idx ? url : u));
  const handleRemoveYoutubeUrl = (idx) => {
    const urls = currentYoutubeUrls.filter((_, i) => i !== idx);
    updateCurrentMod('youtube_urls', urls.length > 0 ? urls : [""]);
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

  // PermissionGuard and usePermission below read the RBAC session through the provider
  const page = (
    <div className="app-container">
      <DeployProgress
        progress={deployProgress}
        onClose={() => setDeployProgress(null)}
        onDownloadWorkbook={handleDownloadDeployedWorkbook}
      />

      {/* Toast Notification (top of the screen, clear of the deployment panel) */}
      <Toast toast={toast} onClose={closeToast} />

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

              <div style={{ marginTop: '8px', background: 'rgba(66, 133, 244, 0.08)', border: '1px solid rgba(66, 133, 244, 0.25)', borderRadius: '10px', padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <ShieldCheck size={18} color="#4285f4" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Authenticates directly through Google OAuth 2.0. Strict NO-DELETE Policy enforced across all Classroom sessions.
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
                  {curriculum.reduce((acc, c) => acc + weekPoints(c), 0)} pts
                </span>
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '6px' }}>
              <div className="review-all-grid">
                {curriculum.map((mod, idx) => {
                  const pCount = topicAttachmentCount(mod);
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
                          <span style={{ color: pCount > 0 ? 'var(--text-main)' : '#64748b' }}>
                            Material: {pCount > 0 ? `${pCount} Item(s) Attached` : "None"}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckSquare size={13} color="#fbbc05" />
                          <span style={{ color: mod.assignment_title ? 'var(--text-main)' : '#64748b' }}>
                            Assignment: {mod.assignment_title ? `${mod.assignment_title} (${pointsOr(mod.points, 100)} pts)` : "None"}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileText size={13} color="#a855f7" />
                          <span style={{ color: mod.quiz_title ? 'var(--text-main)' : '#64748b' }}>
                            Quiz: {mod.quiz_title || "None"}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileQuestion size={13} color="#06b6d4" />
                          <span style={{ color: mod.question_prompt ? 'var(--text-main)' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Question: {mod.question_prompt ? (mod.question_prompt.length > 35 ? mod.question_prompt.slice(0, 35) + "..." : mod.question_prompt) : "None"}
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
                <span>
                  {curriculum.filter(m => m.topic_title || m.title || m.assignment_title || m.quiz_title || m.question_prompt || topicAttachmentCount(m) > 0).length === curriculum.length
                    ? `All ${curriculum.length} week(s) configured in curriculum.`
                    : `${curriculum.filter(m => m.topic_title || m.title || m.assignment_title || m.quiz_title || m.question_prompt || topicAttachmentCount(m) > 0).length} of ${curriculum.length} week(s) configured with coursework.`}
                </span>
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
                  disabled={isProcessing || createBlocked}
                  title={createBlocked ? rbac.explain('courses.create') : undefined}
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
      {clearRequest && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-form-title"
          onKeyDown={e => { if (e.key === 'Escape') setClearRequest(null); }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)', zIndex: 1300,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
          }}
        >
          <div className="login-card animate-fade-in" style={{ maxWidth: '460px', position: 'relative' }}>
            <h2 id="clear-form-title" style={{ fontSize: '1.15rem', marginBottom: '10px' }}>{clearRequest.title}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>
              {clearRequest.body}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '18px' }}>
              Courses already deployed to Google Classroom are not affected. To keep a copy of this form, use Save .xlsx first.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={handleExportExcel}>
                <Download size={15} color="#fbbc05" />
                <span>Save .xlsx first</span>
              </button>
              <button className="btn-secondary" autoFocus onClick={() => setClearRequest(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={confirmClear}
                style={{ background: '#ea4335', borderColor: '#ea4335' }}
              >
                <Trash2 size={15} />
                <span>Yes, clear</span>
              </button>
            </div>
          </div>
        </div>
      )}

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

            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
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
            <div className="brand-title">GCourse Builder</div>
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
            <div style={{ marginTop: '8px', fontSize: '0.68rem', color: '#34a853', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="logged-in-dot" style={{ width: '6px', height: '6px' }} />
                <span>Logged In to Classroom</span>
              </div>
              {isSuperAdmin && (
                <span style={{
                  background: 'rgba(99, 102, 241, 0.25)',
                  color: '#a78bfa',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.65rem',
                  fontWeight: 700
                }}>
                  SUPERADMIN
                </span>
              )}
            </div>
          </div>
        ) : null}

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

          {canOpenRoles && (
            <button
              className={`nav-item ${activeTab === 'roles' ? 'active' : ''}`}
              onClick={() => setActiveTab('roles')}
            >
              <KeyRound size={18} />
              <span>Role Permissions</span>
              <span className="nav-badge">RBAC</span>
            </button>
          )}

          <button
            className={`nav-item ${activeTab === 'tokens' ? 'active' : ''}`}
            onClick={() => setActiveTab('tokens')}
          >
            <Coins size={18} />
            <span>Tokens</span>
          </button>

        </nav>

        {/* Server & Safety Guardrail Badge */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
              {activeTab === 'courses' && "Classroom Courses"}
              {activeTab === 'roles' && "Role Permissions"}
              {activeTab === 'tokens' && "Tokens"}
            </h1>
            <p className="page-desc">
              {activeTab === 'studio' && "Step through one module at a time. All panels are collapsible dropdowns to maximize workspace."}
              {activeTab === 'courses' && "Edit your Google Classroom courses after they are created: course details, topics, classwork and announcements."}
              {activeTab === 'roles' && "Choose what each role may do. Saved to Firestore and enforced by its security rules."}
              {activeTab === 'tokens' && "Buy tokens and see your balance. Your tokens work in all our apps."}
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
                className="btn-secondary"
                onClick={requestClearForm}
                disabled={isProcessing}
                title="Clear the form to start a new course"
              >
                <Trash2 size={15} color="#ea4335" />
                <span>Clear</span>
              </button>
            )}

            {activeTab === 'studio' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.74rem',
                  color: 'var(--text-muted)',
                  padding: '4px 8px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: '6px'
                }}
                title="Your course draft is automatically saved to local browser storage"
              >
                <CheckCircle2 size={13} color="#34a853" />
                <span>Draft Auto-saved</span>
              </span>
            )}

            {activeTab === 'studio' && (
              <button
                className="btn-primary"
                onClick={handleCreateCourse}
                disabled={isProcessing || createBlocked}
                style={{ padding: '9px 18px', fontSize: '0.85rem' }}
                title={createBlocked ? rbac.explain('courses.create') : "Publish course directly to Google Classroom"}
              >
                <Play size={15} />
                <span>{isProcessing ? "Deploying..." : "Finish & Create Course"}</span>
              </button>
            )}

            {/* TOP RIGHT LOG IN BUTTON / LOGGED IN STATUS */}
            {!currentUser && activeTab !== 'studio' ? null : !currentUser ? (
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
                  <div className="top-user-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{currentUser.name || currentUser.displayName || "User"}</span>
                    <span style={{
                      background: isSuperAdmin ? 'rgba(99, 102, 241, 0.25)' : 'rgba(52, 168, 83, 0.15)',
                      color: isSuperAdmin ? '#a78bfa' : '#4ade80',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      textTransform: 'uppercase'
                    }}>
                      {isSuperAdmin ? "SUPERADMIN" : (ROLE_BY_KEY[rbac.role] || ROLE_BY_KEY[DEFAULT_ROLE]).label}
                    </span>
                  </div>
                  <div className="top-user-email" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span>{currentUser.email}</span>
                    {isFirebaseConfigured && !sameAccount && (
                      <button
                        type="button"
                        onClick={handleConnectFirebase}
                        className="btn-sync-pill"
                        title={firebaseProfile
                          ? `Classroom is ${classroomUser?.email}, but Firebase is ${firebaseProfile?.email}. Click to switch Firebase account.`
                          : "Connect Firebase profile to sync roles and permissions without signing out."}
                        style={{
                          background: firebaseProfile ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          border: firebaseProfile ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(59, 130, 246, 0.35)',
                          color: firebaseProfile ? '#fca5a5' : '#93c5fd',
                          borderRadius: '4px',
                          padding: '1px 6px',
                          fontSize: '0.62rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {firebaseProfile ? "Account Mismatch" : "Sync Firebase"}
                      </button>
                    )}
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
                {curriculum.reduce((acc, c) => acc + topicAttachmentCount(c), 0)}
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
                    {(importedWorkbookInfo.warnings || []).length > 0 && (
                      <div role="alert" style={{ marginTop: '8px', fontSize: '0.82rem', color: '#b45309' }}>
                        <strong>Check before deploying:</strong>
                        <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                          {importedWorkbookInfo.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}
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
                    disabled={isProcessing || createBlocked}
                    title={createBlocked ? rbac.explain('courses.create') : undefined}
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

            {/* PANEL 0: COURSE METADATA & STREAM ANNOUNCEMENT (COLLAPSIBLE DROPDOWN) */}
            <div className="item-section-card" style={{ padding: 0, marginBottom: '20px' }}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={Boolean(openPanels.metadata)}
                className="dropdown-panel-toggle"
                onClick={() => togglePanel('metadata')}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel('metadata'); } }}
                style={{ borderBottom: openPanels.metadata ? '1px solid var(--border-color)' : 'none', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <FileSpreadsheet size={20} color="#4285f4" />
                  <div>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      Course Settings & Stream Announcement
                    </span>
                    {(settings.class_name || settings.section) && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '12px' }}>
                        {settings.class_name || ''}{settings.section ? ` (${settings.section})` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="item-pill-badge" style={{ background: 'rgba(66, 133, 244, 0.15)', color: '#1e40af' }}>
                    {openPanels.metadata ? "Open" : "Click to Expand"}
                  </span>
                  {sectionClearButton('metadata')}
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
                role="button"
                tabIndex={0}
                aria-expanded={Boolean(openPanels.students)}
                className="dropdown-panel-toggle"
                onClick={() => togglePanel('students')}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel('students'); } }}
                style={{ borderBottom: openPanels.students ? '1px solid var(--border-color)' : 'none', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Users size={20} color="#34a853" />
                  <div>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      Course Students & Roster Management
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '12px' }}>
                      Your class list, used to email students the class code. Students are not added to Classroom automatically
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="item-pill-badge" style={{ background: 'rgba(52, 168, 83, 0.15)', color: '#4ade80' }}>
                    {students.length} on class list
                  </span>
                  <span className="item-pill-badge" style={{ background: 'var(--border-color)', color: 'var(--text-muted)' }}>
                    {openPanels.students ? "Open" : "Click to Expand"}
                  </span>
                  {sectionClearButton('students')}
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
                          onClick={() => requestSectionClear('students')}
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
                        style={{ paddingLeft: '36px', fontSize: '0.82rem', }}
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
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 600 }}>No students in roster</div>
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
                  role="button"
                  tabIndex={0}
                  aria-expanded={Boolean(openPanels.topic)}
                  className="dropdown-panel-toggle"
                  onClick={() => togglePanel('topic')}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel('topic'); } }}
                  style={{ borderBottom: openPanels.topic ? '1px solid var(--border-color)' : 'none', cursor: 'pointer' }}
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
                    {sectionClearButton('topic')}
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
                  role="button"
                  tabIndex={0}
                  aria-expanded={Boolean(openPanels.material)}
                  className="dropdown-panel-toggle"
                  onClick={() => togglePanel('material')}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel('material'); } }}
                  style={{ borderBottom: openPanels.material ? '1px solid var(--border-color)' : 'none', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Link2 size={18} color="#34a853" />
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>2. Material (Links, Notebook & YouTube)</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {topicAttachmentCount(currentMod)} item(s) attached
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="badge-omit-title">Strictly Omits Title (API Rule)</span>
                    <span className="item-pill-badge" style={{ background: 'rgba(52, 168, 83, 0.15)', color: '#34a853' }}>
                      Material
                    </span>
                    {sectionClearButton('material')}
                    {openPanels.material ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                  </div>
                </div>

                {openPanels.material && (
                  <div className="dropdown-panel-content" style={{ paddingTop: '16px' }}>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                      Everything here is attached to this topic's lecture-materials post in Classroom: a notebook, Google Slides decks and documents, and YouTube videos.
                    </p>

                    {/* Notebook (asked per topic) */}
                    <div className="multi-link-card">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!currentMod.notebook_enabled}
                          onChange={e => updateCurrentMod('notebook_enabled', e.target.checked)}
                        />
                        <span>Attach a Gemini / NotebookLM notebook to this topic?</span>
                      </label>
                      {currentMod.notebook_enabled && (
                        <div style={{ marginTop: '8px' }}>
                          <input
                            type="url"
                            className="form-control"
                            aria-label="Notebook URL"
                            placeholder="https://notebooklm.google.com/notebook/..."
                            value={currentMod.notebook_url || ""}
                            onChange={e => updateCurrentMod('notebook_url', e.target.value)}
                          />
                          {currentMod.notebook_url && !isNotebookUrl(currentMod.notebook_url) && (
                            <p role="alert" style={{ color: '#ea4335', fontSize: '0.78rem', marginTop: '6px' }}>
                              Use a notebook link that starts with {NOTEBOOK_HOSTS_TEXT}.
                            </p>
                          )}
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Share the notebook with your students first, or the link will not open for them.
                          </p>
                        </div>
                      )}
                    </div>

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

                    {/* YouTube videos */}
                    <div style={{ marginTop: '18px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      ▶ YouTube Videos
                    </div>
                    {currentYoutubeUrls.map((url, vIdx) => {
                      const vid = youtubeId(url);
                      return (
                        <div key={vIdx} className="multi-link-card">
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                              type="url"
                              className="form-control"
                              aria-label={`YouTube video ${vIdx + 1}`}
                              placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                              value={url}
                              onChange={e => handleUpdateYoutubeUrl(vIdx, e.target.value)}
                            />
                            {currentYoutubeUrls.length > 1 && (
                              <button
                                onClick={() => handleRemoveYoutubeUrl(vIdx)}
                                style={{ background: 'transparent', color: '#991b1b', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                                title="Remove this video"
                              >
                                <Trash2 size={13} />
                                <span>Remove</span>
                              </button>
                            )}
                          </div>
                          {url && (vid ? (
                            <div className="link-preview-box" style={{ marginTop: '8px' }}>
                              <img src={`https://i.ytimg.com/vi/${vid}/default.jpg`} alt="" width={48} height={36} style={{ borderRadius: 4, objectFit: 'cover' }} />
                              <span className="link-preview-url">Video ID {vid}: attached as a YouTube video</span>
                            </div>
                          ) : (
                            <p role="alert" style={{ color: '#ea4335', fontSize: '0.78rem', marginTop: '6px' }}>
                              This is not a YouTube video link. It will be attached as a plain link instead.
                            </p>
                          ))}
                        </div>
                      );
                    })}
                    <button
                      className="btn-secondary"
                      style={{ marginTop: '6px', fontSize: '0.82rem', padding: '6px 14px' }}
                      onClick={handleAddYoutubeUrl}
                    >
                      <Plus size={14} />
                      <span>+ Add YouTube Video</span>
                    </button>
                  </div>
                )}
              </div>

              {/* ITEM 3: ASSIGNMENT (COLLAPSIBLE DROPDOWN PANEL) */}
              <div className="item-section-card" style={{ padding: 0 }}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={Boolean(openPanels.assignment)}
                  className="dropdown-panel-toggle"
                  onClick={() => togglePanel('assignment')}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel('assignment'); } }}
                  style={{ borderBottom: openPanels.assignment ? '1px solid var(--border-color)' : 'none', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckSquare size={18} color="#fbbc05" />
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>3. Assignment (Assessment / Knowledge Check)</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {currentMod.assignment_title ? `${currentMod.assignment_title} (${pointsOr(currentMod.points, 100)} pts)` : "Optional"}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="item-pill-badge" style={{ background: 'rgba(251, 188, 5, 0.15)', color: '#fbbc05' }}>
                      Assignment
                    </span>
                    {sectionClearButton('assignment')}
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
                          min="0"
                          step="1"
                          className="form-control"
                          placeholder="100"
                          value={currentMod.points ?? 100}
                          onChange={e => updateCurrentMod('points', e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                        />
                      </div>

                      <div>
                        <label className="form-label">Due Date</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="date"
                            className="form-control"
                            aria-label="Due date"
                            value={splitDue(currentMod.due_date).date}
                            onChange={e => {
                              const { time } = splitDue(currentMod.due_date);
                              updateCurrentMod('due_date', e.target.value ? e.target.value + (time ? `T${time}` : '') : '');
                            }}
                          />
                          <input
                            type="time"
                            className="form-control"
                            aria-label="Due time (optional)"
                            title="Optional. Blank means 23:59."
                            value={splitDue(currentMod.due_date).time}
                            disabled={!splitDue(currentMod.due_date).date}
                            onChange={e => {
                              const { date } = splitDue(currentMod.due_date);
                              updateCurrentMod('due_date', date + (e.target.value ? `T${e.target.value}` : ''));
                            }}
                          />
                        </div>
                        {currentMod.due_date && !isIsoDue(currentMod.due_date) ? (
                          <p role="alert" style={{ color: '#ea4335', fontSize: '0.78rem', marginTop: '6px' }}>
                            "{currentMod.due_date}" is not an ISO 8601 date. Pick a date above, or use YYYY-MM-DD in the spreadsheet.
                          </p>
                        ) : (
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Applies to this week's assignment, quiz and question. Blank time means 23:59, in your browser's time zone.
                          </p>
                        )}
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

                    <div style={{ marginTop: '12px' }}>
                      <label className="form-label">Rubric (Google Sheet link)</label>
                      <input
                        type="url"
                        className="form-control"
                        placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                        value={currentMod.rubric_url || ""}
                        onChange={e => updateCurrentMod('rubric_url', e.target.value)}
                      />
                      {currentMod.rubric_url && !isSheetLink(currentMod.rubric_url) ? (
                        <p role="alert" style={{ color: '#ea4335', fontSize: '0.78rem', marginTop: '6px' }}>
                          Use the full link of a Google Sheet, e.g. https://docs.google.com/spreadsheets/d/.../edit.
                        </p>
                      ) : (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                          A sheet in Classroom's rubric format (as for Rubric &gt; Import from Sheets). It becomes the assignment's rubric; if Classroom refuses it, the link goes in the assignment description.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ITEM 4: QUIZ ASSIGNMENT (COLLAPSIBLE DROPDOWN PANEL) */}
              <div className="item-section-card" style={{ padding: 0 }}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={Boolean(openPanels.quiz)}
                  className="dropdown-panel-toggle"
                  onClick={() => togglePanel('quiz')}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel('quiz'); } }}
                  style={{ borderBottom: openPanels.quiz ? '1px solid var(--border-color)' : 'none', cursor: 'pointer' }}
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
                    {sectionClearButton('quiz')}
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
                        <label className="form-label">Existing Google Form (optional)</label>
                        <input
                          type="url"
                          className="form-control"
                          aria-label="Existing Google Form (optional)"
                          placeholder="https://docs.google.com/forms/d/.../viewform"
                          value={currentMod.quiz_url || ""}
                          disabled={(currentMod.quiz_questions || []).length > 0}
                          title={(currentMod.quiz_questions || []).length > 0 ? "Not used: the quiz is made from the questions below" : ""}
                          onChange={e => updateCurrentMod('quiz_url', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label">Quiz Points</label>
                        {(currentMod.quiz_questions || []).length > 0 ? (
                          <input
                            type="text"
                            className="form-control"
                            readOnly
                            aria-label="Quiz points, the total of the questions"
                            value={`${quizTotalPoints(currentMod)} (total of the questions)`}
                          />
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="form-control"
                            placeholder="50"
                            title="Blank means 50. 0 means ungraded."
                            value={currentMod.quiz_points ?? ""}
                            onChange={e => updateCurrentMod('quiz_points', e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                          />
                        )}
                      </div>
                    </div>

                    <QuizQuestionsEditor
                      questions={currentMod.quiz_questions || []}
                      onChange={questions => updateCurrentMod('quiz_questions', questions)}
                    />
                    {(currentMod.quiz_questions || []).length > 0 && currentMod.quiz_url && (
                      <p role="alert" style={{ color: '#b45309', fontSize: '0.78rem', marginTop: '8px' }}>
                        This week has questions, so a new Google Form is made from them and the existing form link is not used.
                      </p>
                    )}

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
                  role="button"
                  tabIndex={0}
                  aria-expanded={Boolean(openPanels.question)}
                  className="dropdown-panel-toggle"
                  onClick={() => togglePanel('question')}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel('question'); } }}
                  style={{ borderBottom: openPanels.question ? '1px solid var(--border-color)' : 'none', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileQuestion size={18} color="#06b6d4" />
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>5. Question (Classroom Discussion Prompt)</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {currentMod.question_prompt ? (currentMod.question_prompt.length > 30 ? currentMod.question_prompt.slice(0, 30) + "..." : currentMod.question_prompt) : "Optional"}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="item-pill-badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' }}>
                      Question
                    </span>
                    {sectionClearButton('question')}
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

                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '16px', marginTop: '14px' }}>
                      {currentMod.question_type === 'MULTIPLE_CHOICE_QUESTION' ? (
                        <div>
                          <label className="form-label">Choices (one per line)</label>
                          <textarea
                            rows={4}
                            className="form-control"
                            placeholder={"Type-1 runs directly on hardware\nType-2 runs on a host operating system"}
                            value={(currentMod.question_choices || []).join('\n')}
                            onChange={e => updateCurrentMod('question_choices', e.target.value.split('\n'))}
                          />
                          {currentMod.question_prompt && nonEmptyChoices(currentMod).length < 2 && (
                            <p role="alert" style={{ color: '#ea4335', fontSize: '0.78rem', marginTop: '6px' }}>
                              A multiple-choice question needs at least 2 choices.
                            </p>
                          )}
                        </div>
                      ) : <div />}

                      <div>
                        <label className="form-label">Question Points</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="form-control"
                          placeholder="20"
                          title="Blank means 20. 0 means ungraded."
                          value={currentMod.question_points ?? ""}
                          onChange={e => updateCurrentMod('question_points', e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                        />
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
                    disabled={isProcessing || createBlocked}
                    title={createBlocked ? rbac.explain('courses.create') : undefined}
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
            <PermissionGuard permission="classroom.manage" fallback={<PermissionNotice permission="classroom.manage" />}>
              <ClassroomEnvironment user={currentUser} onImportCourse={applyImportedCourse} />
            </PermissionGuard>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: ROLE PERMISSIONS (SUPERADMIN RBAC) */}
        {/* ================================================================= */}
        {activeTab === 'roles' && canOpenRoles && (
          <RolePermissionsManager showToast={showToast} />
        )}

        {/* ================================================================= */}
        {/* TAB 4: TOKENS (BUY TOKENS; TOKEN ACCOUNTS FOR SUPERADMINS) */}
        {/* ================================================================= */}
        {tokensOpened && <TokensPanel hidden={activeTab !== 'tokens'} />}

        {/* Stripe Registration Modal */}
        <RegistrationModal
          isOpen={showRegistrationModal}
          initialView={registrationModalView}
          onClose={() => setShowRegistrationModal(false)}
          currentUser={currentUser}
          isSuperAdmin={isSuperAdmin}
          onCustomerCreated={() => {
            fetchLmsMembers();
          }}
        />

      </main>
    </div>
  );

  return <PermissionProvider session={rbac}>{page}</PermissionProvider>;
}
