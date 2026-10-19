import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Building,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Lock,
  Tag,
  Loader2,
  Calendar,
  Layers,
  GraduationCap,
  Bot,
  Copy,
  Check,
  Sparkles,
  BookOpen,
  Code2
} from 'lucide-react';

export default function RegistrationModal({ 
  isOpen, 
  onClose, 
  onCustomerCreated,
  currentUser,
  isSuperAdmin = false,
  initialView = 'form'
}) {
  const superAdmin = Boolean(isSuperAdmin);
  const [activeView, setActiveView] = useState(initialView || 'form');

  useEffect(() => {
    if (isOpen && initialView) {
      setActiveView(initialView);
    }
  }, [isOpen, initialView]);
  const [accountType, setAccountType] = useState('individual'); // 'individual' or 'organization'
  const [formData, setFormData] = useState({
    name: '',
    businessName: '',
    email: '',
    phone: '',
    role: 'student', // 'student', 'instructor', 'school_admin'
    dateOfBirth: '',
    educationLevel: "Bachelor's Degree",
    institutionName: '',
    fieldOfStudy: '',
    educationNotes: '',
    taxId: '',
    address: {
      line1: '',
      line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'AU'
    },
    saveCard: false,
    cardNumber: '',
    cardExpMonth: '',
    cardExpYear: '',
    cardCvc: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successResult, setSuccessResult] = useState(null);
  const [agentJsonInput, setAgentJsonInput] = useState('');
  const [copiedMcp, setCopiedMcp] = useState(false);
  const [agentNotice, setAgentNotice] = useState(null);

  if (!isOpen) return null;

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      address: {
        ...prev.address,
        [field]: value
      }
    }));
  };

  const handleLoadSampleAgentJson = () => {
    const sample = {
      account_type: "individual",
      name: "Maya Lin",
      email: "maya.lin@architecture.edu",
      phone: "+61 411 222 333",
      role: "student",
      date_of_birth: "2001-08-22",
      education_history: {
        level: "Bachelor's Degree",
        institution: "University of Sydney",
        field_of_study: "Architectural Computation & AI",
        notes: "Dean's Honours List 2024"
      },
      address: {
        line1: "45 King Street",
        city: "Sydney",
        state: "NSW",
        postal_code: "2000",
        country: "AU"
      }
    };
    setAgentJsonInput(JSON.stringify(sample, null, 2));
    setAgentNotice("Sample student registration JSON loaded.");
  };

  const handleApplyAgentJson = (andSubmit = false) => {
    try {
      if (!agentJsonInput.trim()) {
        throw new Error("Please enter or paste an AI agent JSON payload first.");
      }
      const parsed = JSON.parse(agentJsonInput);
      const accType = parsed.account_type || parsed.accountType || 'individual';
      setAccountType(accType);

      const edu = parsed.education_history || parsed.educationHistory || {};
      const eduLevel = (typeof edu === 'object' ? edu.level : parsed.educationLevel) || "Bachelor's Degree";
      const eduInst = (typeof edu === 'object' ? edu.institution : parsed.institutionName) || "";
      const eduField = (typeof edu === 'object' ? edu.field_of_study || edu.field : parsed.fieldOfStudy) || "";
      const eduNotes = (typeof edu === 'object' ? edu.notes : parsed.educationNotes) || "";

      const addr = parsed.address || {};

      const updatedForm = {
        ...formData,
        name: parsed.name || formData.name,
        businessName: parsed.business_name || parsed.businessName || formData.businessName,
        email: parsed.email || formData.email,
        phone: parsed.phone || formData.phone,
        role: parsed.role || formData.role,
        dateOfBirth: parsed.date_of_birth || parsed.dateOfBirth || formData.dateOfBirth,
        educationLevel: eduLevel,
        institutionName: eduInst,
        fieldOfStudy: eduField,
        educationNotes: eduNotes,
        address: {
          line1: addr.line1 || formData.address.line1,
          line2: addr.line2 || formData.address.line2,
          city: addr.city || formData.address.city,
          state: addr.state || formData.address.state,
          postal_code: addr.postal_code || addr.postalCode || formData.address.postal_code,
          country: addr.country || formData.address.country || 'AU'
        }
      };

      setFormData(updatedForm);
      setError(null);
      setAgentNotice("Agent data successfully mapped to student profile!");
      setActiveView('form');
    } catch (err) {
      setError(`Invalid Agent JSON: ${err.message}`);
    }
  };

  const mcpToolDefinition = {
    name: "register_student_member",
    description: "Registers a new student member into the LMS system with Date of Birth, Education History, and billing address, generating their Client ID (Stripe Customer ID).",
    inputSchema: {
      type: "object",
      properties: {
        account_type: { type: "string", enum: ["individual", "organization"] },
        name: { type: "string", description: "Full legal name" },
        email: { type: "string", format: "email" },
        phone: { type: "string" },
        date_of_birth: { type: "string", format: "date", description: "YYYY-MM-DD format (student record only)" },
        education_history: {
          type: "object",
          description: "Student education background",
          properties: {
            level: { type: "string" },
            institution: { type: "string" },
            field_of_study: { type: "string" },
            notes: { type: "string" }
          }
        },
        role: { type: "string", enum: ["student", "instructor", "school_admin"] },
        address: {
          type: "object",
          required: ["line1", "city", "postal_code"],
          properties: {
            line1: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            postal_code: { type: "string" },
            country: { type: "string", default: "AU" }
          }
        }
      },
      required: ["name", "email", "address"]
    }
  };

  const handleCopyMcp = () => {
    navigator.clipboard.writeText(JSON.stringify(mcpToolDefinition, null, 2));
    setCopiedMcp(true);
    setTimeout(() => setCopiedMcp(false), 3000);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1. Validate required fields
      if (!formData.email) throw new Error("Email address is required.");
      if (accountType === 'individual' && !formData.name) throw new Error("Full name is required.");
      if (accountType === 'organization' && !formData.businessName) throw new Error("Organization / School name is required.");
      if (!formData.address.line1 || !formData.address.city || !formData.address.postal_code) {
        throw new Error("Please complete the billing address (Street, City, Postcode).");
      }

      // 2. Call backend /api/stripe/create-customer
      const res = await fetch('/api/stripe/create-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountType,
          name: formData.name,
          businessName: formData.businessName,
          email: formData.email,
          phone: formData.phone,
          dateOfBirth: formData.dateOfBirth,
          educationHistory: {
            level: formData.educationLevel,
            institution: formData.institutionName,
            field_of_study: formData.fieldOfStudy,
            notes: formData.educationNotes
          },
          role: formData.role,
          taxId: formData.taxId,
          address: formData.address,
          saveCard: formData.saveCard
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create customer in Stripe");
      }

      setSuccessResult(data);
      if (onCustomerCreated) {
        onCustomerCreated(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(5, 7, 15, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: '#131722',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(66, 133, 244, 0.15)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
            }}>
              <CreditCard size={20} color="#fff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>
                LMS Customer Registration
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                {superAdmin ? (
                  <>Stripe Customer Setup &bull; Auto-sync to Firebase with <span style={{ color: '#a78bfa', fontWeight: 600 }}>tag: '#gcoursebuilder'</span></>
                ) : (
                  <>Member Billing Profile & Course Enrollment</>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px' }}>
          {successResult ? (
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(52, 168, 83, 0.15)',
                border: '2px solid #34a853',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <CheckCircle2 size={36} color="#34a853" />
              </div>

              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
                Customer Registered Successfully!
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', maxWidth: '440px', margin: '0 auto 20px' }}>
                {superAdmin ? (
                  <>Created in Stripe and stored in Firebase Database with cross-site <span style={{ color: '#38bdf8', fontWeight: 600 }}>'#gcoursebuilder'</span> indexing.</>
                ) : (
                  <>Your account has been registered. Keep your Client ID for billing reference.</>
                )}
              </p>

              {/* Record Summary Box */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'left',
                marginBottom: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontSize: '0.85rem'
              }}>
                {/* Client ID (Stripe Customer ID) - Visible to all */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8' }}>Client ID:</span>
                  <span style={{ fontFamily: 'monospace', color: '#60a5fa', fontWeight: 600, fontSize: '0.92rem' }}>
                    {successResult.customer?.id}
                  </span>
                </div>

                {/* Student Enrollment Profile (Academic Record - excluded from Stripe) */}
                {successResult.user?.date_of_birth && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#94a3b8' }}>Date of Birth:</span>
                    <span style={{ color: '#f8fafc', fontWeight: 500 }}>
                      {successResult.user.date_of_birth}
                    </span>
                  </div>
                )}
                {successResult.user?.education_history && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Education History:</span>
                    <span style={{ color: '#f8fafc', textAlign: 'right', maxWidth: '340px' }}>
                      {typeof successResult.user.education_history === 'object'
                        ? `${successResult.user.education_history.level || ''}${successResult.user.education_history.field_of_study ? ` in ${successResult.user.education_history.field_of_study}` : ''}${successResult.user.education_history.institution ? ` (${successResult.user.education_history.institution})` : ''}`
                        : successResult.user.education_history}
                    </span>
                  </div>
                )}

                {/* Internal fields: only visible to superadmin */}
                {superAdmin && (
                  <>
                    <div style={{ margin: '4px 0', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a78bfa', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <ShieldCheck size={13} />
                      <span>Superadmin System Details</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Invoice Prefix:</span>
                      <span style={{ color: '#f8fafc', fontWeight: 600 }}>
                        {successResult.customer?.invoice_prefix || 'LMS'} (Draft Policy)
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Payment Terms:</span>
                      <span style={{ color: '#f8fafc' }}>30 Days</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#94a3b8' }}>Database Tag:</span>
                      <span style={{
                        background: 'rgba(139, 92, 246, 0.2)',
                        color: '#c084fc',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}>
                        tag: '#gcoursebuilder'
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Firebase User ID:</span>
                      <span style={{ fontFamily: 'monospace', color: '#34d399' }}>
                        {successResult.user?.uid}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={onClose}
                className="btn-primary"
                style={{
                  padding: '10px 24px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                Close & Return to Studio
              </button>
            </div>
          ) : (
            <div>
              {/* Registration Mode Tabs: Human Form vs AI Agent & MCP Protocol */}
              <div style={{
                display: 'flex',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '4px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: '20px'
              }}>
                <button
                  type="button"
                  onClick={() => setActiveView('form')}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeView === 'form' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                    color: activeView === 'form' ? '#f8fafc' : '#94a3b8',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <User size={15} color={activeView === 'form' ? '#818cf8' : '#94a3b8'} />
                  <span>Student Enrollment Form</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveView('agent')}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeView === 'agent' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    color: activeView === 'agent' ? '#38bdf8' : '#94a3b8',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Bot size={15} color={activeView === 'agent' ? '#38bdf8' : '#94a3b8'} />
                  <span>AI Agent & MCP Console</span>
                  <span style={{ fontSize: '0.65rem', background: '#38bdf8', color: '#090d16', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                    AUTO-FILL
                  </span>
                </button>
              </div>

              {agentNotice && (
                <div style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#38bdf8',
                  fontSize: '0.8rem',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Sparkles size={14} />
                  <span>{agentNotice}</span>
                </div>
              )}

              {/* AI AGENT & MCP MODE VIEW */}
              {activeView === 'agent' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Agnostic Agent Conversational Protocol */}
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#38bdf8', fontWeight: 600, fontSize: '0.88rem' }}>
                      <Bot size={18} />
                      <span>Agnostic Agentic Onboarding Flow</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
                      When an AI agent (Gemini, Claude, GPT, etc.) conducts registration, it interviews the student using this sequential question protocol, parses the answers, and populates the registration form:
                    </p>

                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.76rem' }}>
                      <div style={{ padding: '6px 10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px', borderLeft: '3px solid #6366f1' }}>
                        <strong>Q1 (Identity):</strong> "What is your full legal name and email address?"
                      </div>
                      <div style={{ padding: '6px 10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px', borderLeft: '3px solid #818cf8' }}>
                        <strong>Q2 (Date of Birth):</strong> "What is your date of birth? (Please provide in YYYY-MM-DD format for academic records)"
                      </div>
                      <div style={{ padding: '6px 10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px', borderLeft: '3px solid #a78bfa' }}>
                        <strong>Q3 (Education History):</strong> "What is your highest education qualification, institution name, and field of study?"
                      </div>
                      <div style={{ padding: '6px 10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px', borderLeft: '3px solid #38bdf8' }}>
                        <strong>Q4 (Billing Location):</strong> "What is your billing / residential address (Street, City, State, Postcode, Country)?"
                      </div>
                    </div>
                  </div>

                  {/* Agent JSON Importer / Auto-Fill */}
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', fontWeight: 600, color: '#f8fafc' }}>
                        <Sparkles size={15} color="#38bdf8" />
                        <span>Paste AI Agent Response / JSON Output</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleLoadSampleAgentJson}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          borderRadius: '6px',
                          color: '#38bdf8',
                          padding: '4px 10px',
                          fontSize: '0.74rem',
                          cursor: 'pointer'
                        }}
                      >
                        Load Sample Student JSON
                      </button>
                    </div>

                    <textarea
                      value={agentJsonInput}
                      onChange={(e) => setAgentJsonInput(e.target.value)}
                      placeholder='{\n  "name": "Maya Lin",\n  "email": "maya.lin@architecture.edu",\n  "date_of_birth": "2001-08-22",\n  "education_history": {\n    "level": "Bachelor Degree",\n    "institution": "University of Sydney",\n    "field_of_study": "Architectural AI"\n  },\n  "address": {\n    "line1": "45 King St",\n    "city": "Sydney",\n    "postal_code": "2000"\n  }\n}'
                      rows={8}
                      style={{
                        width: '100%',
                        fontFamily: 'monospace',
                        fontSize: '0.78rem',
                        padding: '12px',
                        background: '#090d16',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: '#38bdf8',
                        lineHeight: 1.4,
                        resize: 'vertical'
                      }}
                    />

                    <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleApplyAgentJson(false)}
                        className="btn-primary"
                        style={{
                          flex: 1,
                          padding: '9px 16px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                          border: 'none',
                          color: '#090d16',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <Sparkles size={15} />
                        <span>Auto-Fill Form with Agent Data</span>
                      </button>
                    </div>
                  </div>

                  {/* MCP Tool Specification Box */}
                  <div style={{
                    background: '#090d16',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600 }}>
                        <Code2 size={16} color="#a78bfa" />
                        <span>MCP Tool Schema: <code>register_student_member</code></span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyMcp}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          color: copiedMcp ? '#34a853' : '#cbd5e1',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {copiedMcp ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedMcp ? "Copied MCP Tool!" : "Copy MCP Tool Schema"}</span>
                      </button>
                    </div>
                    <pre style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8', background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '6px', overflowX: 'auto', maxHeight: '160px' }}>
                      {JSON.stringify(mcpToolDefinition, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Account Type Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '8px' }}>
                  Customer Account Type
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setAccountType('individual')}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: accountType === 'individual' ? '2px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: accountType === 'individual' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      color: accountType === 'individual' ? '#f8fafc' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.85rem'
                    }}
                  >
                    <User size={18} color={accountType === 'individual' ? '#818cf8' : '#94a3b8'} />
                    <span>Individual (Student/Teacher)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccountType('organization')}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: accountType === 'organization' ? '2px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: accountType === 'organization' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      color: accountType === 'organization' ? '#f8fafc' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.85rem'
                    }}
                  >
                    <Building size={18} color={accountType === 'organization' ? '#818cf8' : '#94a3b8'} />
                    <span>Organization (School/Company)</span>
                  </button>
                </div>
              </div>

              {/* Identity & Contact Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {accountType === 'organization' ? (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                        Organization / School Name *
                      </label>
                      <input
                        type="text"
                        value={formData.businessName}
                        onChange={(e) => handleChange('businessName', e.target.value)}
                        placeholder="e.g. Victorian Academy of AI"
                        required
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          background: 'rgba(0, 0, 0, 0.3)',
                          color: '#fff',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                        Contact Representative Name
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="e.g. Dr. Sarah Jenkins"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          background: 'rgba(0, 0, 0, 0.3)',
                          color: '#fff',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder="e.g. Alex Morgan"
                      required
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="email@example.com"
                    required
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      background: 'rgba(0, 0, 0, 0.3)',
                      color: '#fff',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    placeholder="+61 400 000 000"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      background: 'rgba(0, 0, 0, 0.3)',
                      color: '#fff',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                    LMS User Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => handleChange('role', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      background: '#1a1f2c',
                      color: '#fff',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="student">Student / Learner</option>
                    <option value="instructor">Instructor / Teacher</option>
                    <option value="school_admin">School Administrator</option>
                  </select>
                </div>

                {accountType === 'organization' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                      Tax ID / ABN (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.taxId}
                      onChange={(e) => handleChange('taxId', e.target.value)}
                      placeholder="e.g. ABN 51 824 753 556"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Student Academic Profile (Date of Birth & Education History) */}
              <div style={{
                background: 'rgba(99, 102, 241, 0.04)',
                border: '1px solid rgba(99, 102, 241, 0.22)',
                borderRadius: '12px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <GraduationCap size={18} color="#818cf8" />
                    <div>
                      <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#f8fafc' }}>
                        Student Enrollment & Academic Profile
                      </span>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Archived in student database &bull; Excluded from payment gateway / Stripe
                      </div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.68rem',
                    color: '#38bdf8',
                    background: 'rgba(56, 189, 248, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 600
                  }}>
                    LMS Academic Registry
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Date of Birth */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '6px' }}>
                      <Calendar size={13} color="#a78bfa" />
                      <span>Date of Birth *</span>
                    </label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>

                  {/* Highest Education Level */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '6px' }}>
                      <BookOpen size={13} color="#a78bfa" />
                      <span>Highest Education Level</span>
                    </label>
                    <select
                      value={formData.educationLevel}
                      onChange={(e) => handleChange('educationLevel', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        background: '#1a1f2c',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="High School">High School / Secondary</option>
                      <option value="Bachelor's Degree">Bachelor's Degree (Undergraduate)</option>
                      <option value="Master's Degree">Master's Degree (Postgraduate)</option>
                      <option value="Doctorate / PhD">Doctorate / PhD</option>
                      <option value="Vocational / Diploma">Vocational / Diploma / TAFE</option>
                      <option value="Professional Certificate">Professional Certificate</option>
                      <option value="Other">Other Education</option>
                    </select>
                  </div>

                  {/* Institution Name */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                      Institution / University / School Name
                    </label>
                    <input
                      type="text"
                      value={formData.institutionName}
                      onChange={(e) => handleChange('institutionName', e.target.value)}
                      placeholder="e.g. University of Melbourne"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>

                  {/* Field of Study */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                      Field of Study / Major / Subject
                    </label>
                    <input
                      type="text"
                      value={formData.fieldOfStudy}
                      onChange={(e) => handleChange('fieldOfStudy', e.target.value)}
                      placeholder="e.g. Computer Science, AI, Business"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>

                  {/* Academic Notes / Year */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>
                      Academic Credentials, Year Completed or Notes
                    </label>
                    <input
                      type="text"
                      value={formData.educationNotes}
                      onChange={(e) => handleChange('educationNotes', e.target.value)}
                      placeholder="e.g. Graduated 2024, Honours in Applied Machine Learning"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Billing Address Section */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '12px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <MapPin size={16} color="#60a5fa" />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0' }}>
                    Billing Address
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input
                    type="text"
                    value={formData.address.line1}
                    onChange={(e) => handleAddressChange('line1', e.target.value)}
                    placeholder="Street Address (Line 1) *"
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      background: 'rgba(0, 0, 0, 0.3)',
                      color: '#fff',
                      fontSize: '0.82rem'
                    }}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px' }}>
                    <input
                      type="text"
                      value={formData.address.city}
                      onChange={(e) => handleAddressChange('city', e.target.value)}
                      placeholder="City / Suburb *"
                      required
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#fff',
                        fontSize: '0.82rem'
                      }}
                    />
                    <input
                      type="text"
                      value={formData.address.state}
                      onChange={(e) => handleAddressChange('state', e.target.value)}
                      placeholder="State (e.g. VIC)"
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#fff',
                        fontSize: '0.82rem'
                      }}
                    />
                    <input
                      type="text"
                      value={formData.address.postal_code}
                      onChange={(e) => handleAddressChange('postal_code', e.target.value)}
                      placeholder="Postcode *"
                      required
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#fff',
                        fontSize: '0.82rem'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Card Storage Toggle & Inputs */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '12px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CreditCard size={16} color="#c084fc" />
                    <div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0' }}>
                        Store Credit/Debit Card on File
                      </span>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Optional: Authorize off-session card saving for course enrollments
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.saveCard}
                    onChange={(e) => handleChange('saveCard', e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#6366f1' }}
                  />
                </div>

                {formData.saveCard && (
                  <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#38bdf8', marginBottom: '8px' }}>
                      <Lock size={12} />
                      <span>Secured with Stripe Elements PCI-DSS compliance</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px' }}>
                      <input
                        type="text"
                        placeholder="Card Number (•••• •••• •••• ••••)"
                        value={formData.cardNumber}
                        onChange={(e) => handleChange('cardNumber', e.target.value)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          background: 'rgba(0, 0, 0, 0.3)',
                          color: '#fff',
                          fontSize: '0.82rem'
                        }}
                      />
                      <input
                        type="text"
                        placeholder="MM/YY"
                        value={formData.cardExpMonth}
                        onChange={(e) => handleChange('cardExpMonth', e.target.value)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          background: 'rgba(0, 0, 0, 0.3)',
                          color: '#fff',
                          fontSize: '0.82rem'
                        }}
                      />
                      <input
                        type="password"
                        placeholder="CVC"
                        maxLength={4}
                        value={formData.cardCvc}
                        onChange={(e) => handleChange('cardCvc', e.target.value)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          background: 'rgba(0, 0, 0, 0.3)',
                          color: '#fff',
                          fontSize: '0.82rem'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Policy & Tagging Banner (Only visible to superadmin) */}
              {superAdmin && (
                <div style={{
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '0.76rem',
                  color: '#cbd5e1'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#818cf8', fontWeight: 600 }}>
                    <ShieldCheck size={14} />
                    <span>Configured Invoice & Cross-Site Policy (Superadmin Only):</span>
                  </div>
                  <div>
                    &bull; <strong>Draft Invoices:</strong> All invoices are created as <em>Draft</em> for admin review before any card charging.
                  </div>
                  <div>
                    &bull; <strong>Database Tag:</strong> Record stamped with <code>tag: '#gcoursebuilder'</code> for Firebase synchronization across Google Course Builder.
                  </div>
                  <div>
                    &bull; <strong>Invoice Prefix & Terms:</strong> Unique <code>LMS-</code> prefix with 30-day payment terms.
                  </div>
                </div>
              )}

              {error && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  color: '#f87171',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '9px 22px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.85rem',
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
                  }}
                >
                  {loading && <Loader2 size={16} className="spin" />}
                  <span>{loading ? 'Registering with Stripe...' : 'Complete Registration'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  </div>
</div>
  );
}
