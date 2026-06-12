import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="dialog-overlay">
          <div className="glass-card dialog-card" style={{ width: 460, border: '1px solid var(--accent-danger)' }}>
            <h2 style={{ marginBottom: 12 }}>程序界面遇到错误</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
              已拦截崩溃，避免白屏。请刷新界面或重新打开程序。
            </p>
            <pre style={{ textAlign: 'left', maxHeight: 160, overflow: 'auto', fontSize: 12, color: 'var(--accent-danger)' }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => location.reload()}>
              重新加载
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

