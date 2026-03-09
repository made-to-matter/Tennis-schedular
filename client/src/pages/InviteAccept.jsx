import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { invites as invitesApi } from '../api';

const PENDING_KEY = 'pending_invite_token';

export default function InviteAccept() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [authWorking, setAuthWorking] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMsg, setAuthMsg] = useState('');

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  // Store token so it survives email-confirmation redirect
  useEffect(() => {
    localStorage.setItem(PENDING_KEY, token);
  }, [token]);

  // Load invite preview (public endpoint — no auth needed)
  useEffect(() => {
    fetch(`/api/invites/preview/${token}`)
      .then(r => r.json())
      .then(data => { setPreview(data); setLoadingPreview(false); })
      .catch(() => { setPreview({ valid: false }); setLoadingPreview(false); });
  }, [token]);

  // Auto-accept when session arrives (sign-in or post-email-confirmation)
  const didAutoAccept = useRef(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
      if (session && !didAutoAccept.current) {
        didAutoAccept.current = true;
        const pendingToken = localStorage.getItem(PENDING_KEY);
        if (pendingToken) {
          invitesApi.accept(pendingToken)
            .then(() => { localStorage.removeItem(PENDING_KEY); navigate('/teams'); })
            .catch(err => {
              // Already accepted or some error — still navigate to teams
              localStorage.removeItem(PENDING_KEY);
              navigate('/teams');
            });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthWorking(true); setAuthError(''); setAuthMsg('');
    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // If session returned immediately (email confirmation disabled), onAuthStateChange handles it.
        // If confirmation required, show message.
        if (!data.session) {
          setAuthMsg('Check your email to confirm your account — the invite will be accepted automatically when you return.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange fires → auto-accept
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthWorking(false);
    }
  };

  const handleAccept = async () => {
    setAccepting(true); setAcceptError('');
    try {
      await invitesApi.accept(token);
      localStorage.removeItem(PENDING_KEY);
      navigate('/teams');
    } catch (err) {
      setAcceptError(err?.response?.data?.error || err.message);
      setAccepting(false);
    }
  };

  if (loadingPreview || authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a5276 0%, #2e86c1 100%)' }}>
        <div style={{ color: 'white', fontSize: '1rem' }}>Loading…</div>
      </div>
    );
  }

  if (!preview?.valid) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a5276 0%, #2e86c1 100%)', padding: '1rem' }}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎾</div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#1a5276' }}>Invalid Invite</h1>
            <p style={{ color: '#718096', marginTop: 8 }}>This invite link is invalid or has expired.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a5276 0%, #2e86c1 100%)', padding: '1rem' }}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎾</div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#1a5276', fontWeight: 700 }}>Co-Captain Invite</h1>
          <p style={{ margin: '8px 0 0', color: '#4a5568' }}>
            You've been invited to co-captain <strong>{preview.teamName}</strong>
          </p>
        </div>

        {preview.alreadyAccepted && (
          <div style={infoBox}>This invite has already been accepted.</div>
        )}

        {!session ? (
          <>
            <p style={{ color: '#718096', fontSize: '0.9rem', marginBottom: 16, textAlign: 'center' }}>
              Sign in or create an account to accept this invite.
            </p>
            <form onSubmit={handleAuth}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} placeholder="you@example.com" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} style={inputStyle} placeholder="••••••••" />
              </div>
              {authError && <div style={errorBox}>{authError}</div>}
              {authMsg && <div style={successBox}>{authMsg}</div>}
              <button type="submit" disabled={authWorking} style={primaryBtnStyle}>
                {authWorking ? 'Please wait…' : (isRegister ? 'Create Account & Accept' : 'Sign In & Accept')}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button onClick={() => { setIsRegister(r => !r); setAuthError(''); setAuthMsg(''); }} style={linkBtnStyle}>
                {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: '#4a5568', textAlign: 'center', marginBottom: 20 }}>
              Signed in as <strong>{session.user.email}</strong>
            </p>
            {acceptError && <div style={errorBox}>{acceptError}</div>}
            <button onClick={handleAccept} disabled={accepting || preview.alreadyAccepted} style={primaryBtnStyle}>
              {accepting ? 'Accepting…' : `Accept & Join ${preview.teamName}`}
            </button>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button onClick={() => supabase.auth.signOut()} style={linkBtnStyle}>Sign out</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const cardStyle = {
  background: 'white', borderRadius: 16, padding: '2.5rem',
  width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};
const labelStyle = { display: 'block', marginBottom: 4, fontWeight: 500, color: '#2d3748', fontSize: '0.9rem' };
const inputStyle = {
  width: '100%', padding: '0.65rem 0.875rem', border: '1.5px solid #e2e8f0',
  borderRadius: 8, fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
};
const primaryBtnStyle = {
  width: '100%', padding: '0.75rem', background: '#2e86c1', color: 'white',
  border: 'none', borderRadius: 8, fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
};
const linkBtnStyle = {
  background: 'none', border: 'none', color: '#2e86c1', cursor: 'pointer',
  fontSize: '0.9rem', textDecoration: 'underline',
};
const errorBox = {
  background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 8,
  padding: '0.75rem 1rem', color: '#c53030', fontSize: '0.875rem', marginBottom: 12,
};
const successBox = {
  background: '#f0fff4', border: '1px solid #68d391', borderRadius: 8,
  padding: '0.75rem 1rem', color: '#276749', fontSize: '0.875rem', marginBottom: 12,
};
const infoBox = {
  background: '#ebf8ff', border: '1px solid #90cdf4', borderRadius: 8,
  padding: '0.75rem 1rem', color: '#2c5282', fontSize: '0.875rem', marginBottom: 16,
};
