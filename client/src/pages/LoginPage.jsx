import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/auth/login`, form
      );
      login(res.data.user, res.data.token);
      navigate('/lobby');
    } catch (err) {
      setError(err.response?.data?.msg || 'Login failed');
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>CollabCode</h1>
        <p style={styles.sub}>Sign in to your account</p>
        {error && <p style={styles.error}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <input style={styles.input} type="email" placeholder="Email"
            value={form.email}
            onChange={e => setForm({...form, email: e.target.value})} />
          <input style={styles.input} type="password" placeholder="Password"
            value={form.password}
            onChange={e => setForm({...form, password: e.target.value})} />
          <button style={styles.btn} type="submit">Login</button>
        </form>
        <p style={{textAlign:'center',marginTop:12,fontSize:13}}>
          No account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page:{minHeight:'100vh',display:'flex',alignItems:'center',
    justifyContent:'center',background:'#0f0f1a'},
  card:{background:'#1a1a2e',padding:32,borderRadius:16,width:340,
    border:'1px solid #2a2a3a'},
  title:{color:'#fff',fontSize:24,fontWeight:700,textAlign:'center',marginBottom:4},
  sub:{color:'#94a3b8',fontSize:13,textAlign:'center',marginBottom:20},
  input:{width:'100%',padding:'10px 12px',background:'#2a2a3a',border:'1px solid #3f3f5a',
    borderRadius:8,color:'#fff',fontSize:14,marginBottom:12,boxSizing:'border-box'},
  btn:{width:'100%',padding:12,background:'#6366F1',border:'none',borderRadius:8,
    color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer'},
  error:{color:'#f87171',fontSize:13,marginBottom:8,textAlign:'center'},
};