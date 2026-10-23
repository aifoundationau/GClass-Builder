import React from 'react';
import { AlertTriangle, RefreshCw, Download, RotateCcw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary caught an error]:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleExportDraft = () => {
    try {
      const draft = {
        settings: JSON.parse(localStorage.getItem("gcb_draft_settings") || "{}"),
        curriculum: JSON.parse(localStorage.getItem("gcb_draft_curriculum") || "[]"),
        students: JSON.parse(localStorage.getItem("gcb_draft_students") || "[]"),
        exportedAt: new Date().toISOString(),
        tag: "#gcoursebuilder"
      };
      const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GCourseBuilder_Recovered_Draft_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Could not export draft: " + e.message);
    }
  };

  handleResetState = () => {
    if (window.confirm("This will reset any cached draft data and reload the app. Continue?")) {
      try {
        localStorage.removeItem("gcb_draft_settings");
        localStorage.removeItem("gcb_draft_curriculum");
        localStorage.removeItem("gcb_draft_students");
        localStorage.removeItem("gcb_draft_workbook_info");
        localStorage.removeItem("gcb_draft_module_idx");
      } catch (e) {}
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          padding: '24px',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}>
          <div style={{
            maxWidth: '640px',
            width: '100%',
            background: 'rgba(30, 41, 59, 0.85)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(12px)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                padding: '12px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle size={28} color="#ef4444" />
              </div>
              <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                  An unexpected error occurred
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                  #gcoursebuilder protected your course draft from being lost.
                </p>
              </div>
            </div>

            <div style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(51, 65, 85, 0.5)',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '20px',
              fontSize: '0.82rem',
              color: '#fca5a5',
              fontFamily: 'monospace',
              maxHeight: '140px',
              overflowY: 'auto'
            }}>
              {this.state.error?.toString() || 'Unknown runtime error'}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={this.handleReload}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={16} />
                <span>Reload Page</span>
              </button>

              <button
                onClick={this.handleExportDraft}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(51, 65, 85, 0.6)',
                  color: '#f8fafc',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '0.88rem',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <Download size={16} />
                <span>Recover Draft JSON</span>
              </button>

              <button
                onClick={this.handleResetState}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '0.88rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  marginLeft: 'auto'
                }}
              >
                <RotateCcw size={16} />
                <span>Reset Cache</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
