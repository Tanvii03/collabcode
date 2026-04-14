import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SharedEditor from '../components/SharedEditor';
import HostSidebar from '../components/HostSidebar';
import VideoPanel from '../components/VideoPanel';
import { useState } from 'react';

export default function EditorPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') || 'peer';
  const { user } = useAuth();
  const [showVideo, setShowVideo] = useState(false);

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div style={styles.topbar}>
        <span style={styles.roomBadge}>Room: {roomId}</span>
        <span style={styles.roleBadge(role)}>
          {role === 'host' ? 'Host' : 'Peer'}
        </span>
        <button onClick={() => setShowVideo(v => !v)} style={styles.vidBtn}>
          {showVideo ? 'Hide Video' : 'Video Call'}
        </button>
      </div>

      {/* Main content */}
      <div style={styles.main}>
        <div style={styles.editorWrap}>
          <SharedEditor roomId={roomId} role={role}
            currentUser={{ id: user.id, name: user.name }} />
        </div>
        {role === 'host' && <HostSidebar roomId={roomId} />}
      </div>

      {showVideo && (
        <VideoPanel roomId={roomId} userId={user.id} />
      )}
    </div>
  );
}

const styles = {
  page:{display:'flex',flexDirection:'column',height:'100vh',
    background:'#1e1e2e',color:'#fff'},
  topbar:{display:'flex',alignItems:'center',gap:12,padding:'8px 16px',
    background:'#13131f',borderBottom:'1px solid #2a2a3a',height:48},
  roomBadge:{background:'#2a2a3a',padding:'4px 10px',borderRadius:6,
    fontSize:12,color:'#94a3b8'},
  roleBadge: r => ({background: r==='host'?'#6366F1':'#10B981',
    padding:'4px 10px',borderRadius:6,fontSize:12,color:'#fff',fontWeight:500}),
  vidBtn:{marginLeft:'auto',padding:'6px 14px',background:'#3f3f5a',
    border:'none',borderRadius:6,color:'#fff',cursor:'pointer',fontSize:13},
  main:{display:'flex',flex:1,overflow:'hidden'},
  editorWrap:{flex:1,overflow:'hidden'},
};