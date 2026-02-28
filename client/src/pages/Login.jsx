import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (isRegister) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Check your email for a confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // App.jsx will handle redirect via onAuthStateChange
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a5276 0%, #2e86c1 100%)',
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: '2.5rem',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎾</div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1a5276', fontWeight: 700 }}>
            Tennis Scheduler
          </h1>
          <p style={{ margin: '0.5rem 0 0', color: '#718096', fontSize: '0.95rem' }}>
            {isRegister ? 'Create your captain account' : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500, color: '#2d3748', fontSize: '0.9rem' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.65rem 0.875rem',
                border: '1.5px solid #e2e8f0',
                borderRadius: 8,
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s'
              }}
              placeholder="captain@example.com"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500, color: '#2d3748', fontSize: '0.9rem' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '0.65rem 0.875rem',
                border: '1.5px solid #e2e8f0',
                borderRadius: 8,
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              background: '#fff5f5',
              border: '1px solid #fc8181',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              color: '#c53030',
              fontSize: '0.875rem',
              marginBottom: '1rem'
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              background: '#f0fff4',
              border: '1px solid #68d391',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              color: '#276749',
              fontSize: '0.875rem',
              marginBottom: '1rem'
            }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: loading ? '#90cdf4' : '#2e86c1',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s'
            }}
          >
            {loading ? 'Please wait…' : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            onClick={() => { setIsRegister(r => !r); setError(''); setMessage(''); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#2e86c1',
              cursor: 'pointer',
              fontSize: '0.9rem',
              textDecoration: 'underline'
            }}
          >
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
