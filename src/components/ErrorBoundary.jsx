import React from 'react';
import { RefreshCw, AlertTriangle, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '520px',
            width: '100%',
            background: 'var(--card-bg, #ffffff)',
            border: '1px solid var(--line, #e2e8f0)',
            borderRadius: '16px',
            padding: '32px 24px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#fee2e2',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto'
            }}>
              <AlertTriangle size={28} />
            </div>

            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink, #0f172a)' }}>
              เกิดข้อผิดพลาดในการแสดงผลชั่วคราว
            </h2>

            <p style={{ fontSize: '0.9rem', color: 'var(--ink-2, #64748b)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              ระบบป้องกันจอขาวทำงาน: ข้อมูลการสแกนในระบบยังคงปลอดภัย 100% สามารถกดปุ่มด้านล่างเพื่อกลับมาสแกนต่อได้ทันที
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: 'var(--start, #22c55e)',
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)'
                }}
              >
                <RefreshCw size={16} /> สแกนต่อทันที
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: 'var(--bg-soft, #f1f5f9)',
                  color: 'var(--ink, #0f172a)',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  border: '1px solid var(--line, #cbd5e1)',
                  cursor: 'pointer'
                }}
              >
                รีเฟรชหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
