import { useEffect, useState } from 'react';

type ConnectionStatus = 'connecting' | 'connected' | 'error';

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    let active = true;

    async function checkHealth() {
      try {
        const response = await fetch('/health');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (active) {
          if (data && data.status === 'ok') {
            setStatus('connected');
          } else {
            setStatus('error');
          }
        }
      } catch (err) {
        if (active) {
          console.error('Failed to fetch health check:', err);
          setStatus('error');
        }
      }
    }

    checkHealth();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
      <h1>Local AI Video Orchestration Platform</h1>
      <div style={{ marginTop: '2rem', padding: '1rem', borderRadius: '4px', display: 'inline-block' }}>
        {status === 'connecting' && (
          <p style={{ color: '#856404', backgroundColor: '#fff3cd', padding: '0.5rem 1rem', border: '1px solid #ffeeba', borderRadius: '4px' }}>
            Connecting to backend...
          </p>
        )}
        {status === 'connected' && (
          <p style={{ color: '#155724', backgroundColor: '#d4edda', padding: '0.5rem 1rem', border: '1px solid #c3e6cb', borderRadius: '4px' }}>
            Connected successfully
          </p>
        )}
        {status === 'error' && (
          <p style={{ color: '#721c24', backgroundColor: '#f8d7da', padding: '0.5rem 1rem', border: '1px solid #f5c6cb', borderRadius: '4px' }}>
            Error: Cannot connect to backend
          </p>
        )}
      </div>
    </div>
  );
}
