// client/src/pages/EditorPage.jsx
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useCallback } from 'react'
import { socket } from '../socket'
import SharedEditor from '../components/SharedEditor'
import HostSidebar from '../components/HostSidebar'
import VideoPanel from '../components/VideoPanel'

export default function EditorPage() {
  const { roomId } = useParams()
  const [searchParams] = useSearchParams()
  const role = searchParams.get('role') || 'peer'
  const { user } = useAuth()
  const navigate = useNavigate()

  const [showVideo, setShowVideo] = useState(false)
  // List of pending peer requests: [{ peerId, peerName, peerUserId }]
  const [pendingRequests, setPendingRequests] = useState([])

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId)
      .then(() => alert(`Room code "${roomId}" copied! Share it with peers.`))
      .catch(() => alert(`Room code: ${roomId}`))
  }

  const handleLeaveRoom = () => {
    const confirmed = window.confirm('Are you sure you want to leave this room?')
    if (confirmed) {
      socket.emit('leave-room', { roomId })
      navigate('/lobby')
    }
  }

  // Called by SharedEditor when a peer requests to join
  const handlePeerRequest = useCallback((data) => {
    setPendingRequests(prev => {
      // Don't add duplicates
      if (prev.find(r => r.peerId === data.peerId)) return prev
      return [...prev, data]
    })
  }, [])

  const acceptPeer = (peerId) => {
    socket.emit('accept-peer', { roomId, peerSocketId: peerId })
    setPendingRequests(prev => prev.filter(r => r.peerId !== peerId))
  }

  const rejectPeer = (peerId) => {
    socket.emit('reject-peer', { roomId, peerSocketId: peerId })
    setPendingRequests(prev => prev.filter(r => r.peerId !== peerId))
  }

  return (
    <div style={styles.page}>

      {/* ── Top bar ── */}
      <div style={styles.topbar}>
        <span style={styles.logo}>{'</>'}</span>

        <button onClick={copyRoomId} style={styles.roomBadge} title="Click to copy">
           🔒{roomId}
        </button>

        <span style={role === 'host' ? styles.hostBadge : styles.peerBadge}>
          {role === 'host' ? 'Host' : '👤 Peer'}
        </span>

        <span style={styles.userName}>{user?.name}</span>

        <div style={styles.topRight}>
          <button
            onClick={() => setShowVideo(v => !v)}
            style={styles.vidBtn}
          >
            {showVideo ? 'Hide Video' : '📹 Video Call'}
          </button>
          <button onClick={handleLeaveRoom} style={styles.leaveBtn}>
            Leave Room
          </button>
        </div>
      </div>

      {/* ── Pending peer requests (host only) ── */}
      {role === 'host' && pendingRequests.length > 0 && (
        <div style={styles.requestsBanner}>
          <span style={styles.requestsTitle}>
            Waiting to join ({pendingRequests.length}):
          </span>
          {pendingRequests.map(req => (
            <div key={req.peerId} style={styles.requestCard}>
              <span style={styles.requestName}>👤 {req.peerName}</span>
              <button
                onClick={() => acceptPeer(req.peerId)}
                style={styles.acceptBtn}
              >
                Accept
              </button>
              <button
                onClick={() => rejectPeer(req.peerId)}
                style={styles.rejectBtn}
              >
                Reject
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Main content area ── */}
      <div style={styles.main}>
        <div style={styles.editorWrap}>
          <SharedEditor
            roomId={roomId}
            role={role}
            currentUser={{ id: user?.id, name: user?.name }}
            onPeerRequest={role === 'host' ? handlePeerRequest : undefined}
          />
        </div>

        {role === 'host' && (
          <HostSidebar roomId={roomId} userId={user?.id} />
        )}
      </div>

      {/* ── Video panel (floating) ── */}
      {showVideo && (
        <VideoPanel
          roomId={roomId}
          userId={user?.id}
          role={role}
        />
      )}
    </div>
  )
}

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#1e1e2e',
    color: '#fff',
    fontFamily: 'sans-serif',
    overflow: 'hidden',
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 16px',
    background: '#13131f',
    borderBottom: '1px solid #2a2a3a',
    height: 48,
    flexShrink: 0,
  },
  logo: {
    color: '#6366F1',
    fontWeight: 700,
    fontSize: 16,
    marginRight: 4,
  },
  roomBadge: {
    background: '#2a2a3a',
    border: '1px solid #3f3f5a',
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 12,
    color: '#94a3b8',
    cursor: 'pointer',
    fontFamily: 'monospace',
    letterSpacing: '0.05em',
  },
  hostBadge: {
    background: '#312e81',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    color: '#a5b4fc',
    fontWeight: 500,
  },
  peerBadge: {
    background: '#064e3b',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    color: '#6ee7b7',
    fontWeight: 500,
  },
  userName: {
    color: '#64748b',
    fontSize: 13,
  },
  topRight: {
    marginLeft: 'auto',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  vidBtn: {
    padding: '6px 14px',
    background: '#2a2a3a',
    border: '1px solid #3f3f5a',
    borderRadius: 8,
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: 13,
  },
  leaveBtn: {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid #7f1d1d',
    borderRadius: 8,
    color: '#fca5a5',
    cursor: 'pointer',
    fontSize: 13,
  },
  // Pending requests banner
  requestsBanner: {
    background: '#1c1400',
    borderBottom: '1px solid #854d0e',
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  requestsTitle: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: 600,
  },
  requestCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#292000',
    border: '1px solid #854d0e',
    borderRadius: 8,
    padding: '6px 10px',
  },
  requestName: {
    color: '#fde68a',
    fontSize: 13,
  },
  acceptBtn: {
    padding: '4px 12px',
    background: '#14532d',
    border: '1px solid #166534',
    borderRadius: 6,
    color: '#86efac',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
  },
  rejectBtn: {
    padding: '4px 12px',
    background: '#450a0a',
    border: '1px solid #7f1d1d',
    borderRadius: 6,
    color: '#fca5a5',
    fontSize: 12,
    cursor: 'pointer',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  editorWrap: {
    flex: 1,
    overflow: 'hidden',
  },
}
