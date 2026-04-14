import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LobbyPage() {
  const [roomInput, setRoomInput] = useState('');
  const [role, setRole] = useState('host');
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const createRoom = async () => {
    const res = await axios.post(
      `${import.meta.env.VITE_SERVER_URL}/api/rooms/create`,
      { userId: user.id },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    navigate(`/room/${res.data.roomId}?role=host`);
  };

  const joinRoom = () => {
    if (!roomInput.trim()) return;
    navigate(`/room/${roomInput.trim()}?role=${role}`);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h2 style={{color:'#fff'}}>Welcome, {user.name}</h2>
          <button onClick={logout} style={styles.logoutBtn}>Logout</button>
        </div>

        <button onClick={createRoom} style={styles.createBtn}>
          + Create New Room (Host)
        </button>

        <div style={styles.divider}>or join existing room</div>

        <div style={styles.roleRow}>
          {['host','peer'].map(r => (
            <button key={r} onClick={() => setRole(r)}
              style={{...styles.roleBtn,
                background: role===r ? '#6366F1' : '#2a2a3a',
                borderColor: role===r ? '#6366F1' : '#3f3f5a'}}>
              {r === 'host' ? 'Host' : 'Peer'}
            </button>
          ))}
        </div>
        <input style={styles.input} placeholder="Enter Room Code"
          value={roomInput} onChange={e => setRoomInput(e.target.value)} />
        <button onClick={joinRoom} style={styles.joinBtn}>Join Room</button>
      </div>
    </div>
  );
}

const styles = {
  page:{minHeight:'100vh',display:'flex',alignItems:'center',
    justifyContent:'center',background:'#0f0f1a'},
  card:{background:'#1a1a2e',padding:32,borderRadius:16,width:380,
    border:'1px solid #2a2a3a'},
  header:{display:'flex',justifyContent:'space-between',
    alignItems:'center',marginBottom:24},
  createBtn:{width:'100%',padding:14,background:'#10B981',border:'none',
    borderRadius:8,color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer',marginBottom:16},
  divider:{textAlign:'center',color:'#4b5563',fontSize:12,marginBottom:16},
  roleRow:{display:'flex',gap:8,marginBottom:12},
  roleBtn:{flex:1,padding:10,border:'2px solid',borderRadius:8,
    color:'#fff',fontSize:13,cursor:'pointer'},
  input:{width:'100%',padding:'10px 12px',background:'#2a2a3a',
    border:'1px solid #3f3f5a',borderRadius:8,color:'#fff',
    fontSize:14,marginBottom:12,boxSizing:'border-box'},
  joinBtn:{width:'100%',padding:12,background:'#6366F1',border:'none',
    borderRadius:8,color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer'},
  logoutBtn:{padding:'6px 12px',background:'transparent',
    border:'1px solid #4b5563',borderRadius:6,color:'#94a3b8',cursor:'pointer'},
};