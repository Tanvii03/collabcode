// client/src/components/VideoPanel.jsx
import { useEffect, useRef, useState } from 'react'
import { socket } from '../socket'

export default function VideoPanel({ roomId, userId, role }) {
  const myVideoRef = useRef(null)
  const peerVideoRef = useRef(null)
  const peerConnectionRef = useRef(null)
  const myStreamRef = useRef(null)
  const remotePeerSocketId = useRef(null)

  const [callStatus, setCallStatus] = useState('idle') // idle | waiting | connected
  const [myVideoOn, setMyVideoOn] = useState(true)
  const [myAudioOn, setMyAudioOn] = useState(true)
  const [error, setError] = useState('')

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  }

  useEffect(() => {
    // Get camera + mic
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        myStreamRef.current = stream
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = stream
        }
      })
      .catch(err => {
        setError('Camera/mic access denied. Please allow permissions.')
        console.error('Media error:', err)
      })

    // ── Listen for WebRTC events ──────────────────────────────────────────────

    // Someone sent us an offer (they want to call us)
    socket.on('webrtc-offer', async ({ offer, fromSocketId }) => {
      try {
        remotePeerSocketId.current = fromSocketId
        const pc = createPeerConnection(fromSocketId)
        peerConnectionRef.current = pc
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('webrtc-answer', {
          answer,
          targetSocketId: fromSocketId,
        })
        setCallStatus('connected')
      } catch (err) {
        console.error('Error handling offer:', err)
      }
    })

    // Our call was answered
    socket.on('webrtc-answer', async ({ answer, fromSocketId }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          )
          setCallStatus('connected')
        }
      } catch (err) {
        console.error('Error handling answer:', err)
      }
    })

    // ICE candidate received
    socket.on('webrtc-ice-candidate', async ({ candidate }) => {
      try {
        if (peerConnectionRef.current && candidate) {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          )
        }
      } catch (err) {
        console.error('ICE candidate error:', err)
      }
    })

    // When a new peer joins the room, host auto-initiates the call
    socket.on('user-joined', ({ socketId }) => {
      if (role === 'host' && socketId) {
        remotePeerSocketId.current = socketId
        // Small delay to ensure peer is fully set up
        setTimeout(() => startCall(socketId), 1000)
      }
    })

    return () => {
      socket.off('webrtc-offer')
      socket.off('webrtc-answer')
      socket.off('webrtc-ice-candidate')
      socket.off('user-joined')

      // Stop all media tracks
      if (myStreamRef.current) {
        myStreamRef.current.getTracks().forEach(t => t.stop())
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
      }
    }
  }, [roomId, role])

  function createPeerConnection(targetSocketId) {
    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Add our local tracks to the connection
    if (myStreamRef.current) {
      myStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, myStreamRef.current)
      })
    }

    // When we find a network path, send it to the peer
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('webrtc-ice-candidate', {
          roomId,
          candidate,
          targetSocketId,
        })
      }
    }

    // When we receive the peer's video/audio stream
    pc.ontrack = ({ streams }) => {
      if (peerVideoRef.current && streams[0]) {
        peerVideoRef.current.srcObject = streams[0]
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallStatus('connected')
      if (pc.connectionState === 'disconnected') setCallStatus('idle')
      if (pc.connectionState === 'failed') setCallStatus('idle')
    }

    return pc
  }

  const startCall = async (targetSocketId) => {
    try {
      setCallStatus('waiting')
      const target = targetSocketId || remotePeerSocketId.current

      const pc = createPeerConnection(target)
      peerConnectionRef.current = pc

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      socket.emit('webrtc-offer', {
        roomId,
        offer,
        targetSocketId: target,
      })
    } catch (err) {
      console.error('Start call error:', err)
      setCallStatus('idle')
    }
  }

  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    if (peerVideoRef.current) peerVideoRef.current.srcObject = null
    setCallStatus('idle')
  }

  const toggleVideo = () => {
    if (myStreamRef.current) {
      const videoTrack = myStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setMyVideoOn(videoTrack.enabled)
      }
    }
  }

  const toggleAudio = () => {
    if (myStreamRef.current) {
      const audioTrack = myStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setMyAudioOn(audioTrack.enabled)
      }
    }
  }

  return (
    <div style={styles.panel}>
      {error && <div style={styles.error}>{error}</div>}

      {/* Peer video (big) */}
      <div style={styles.videoWrap}>
        <video
          ref={peerVideoRef}
          autoPlay
          playsInline
          style={styles.peerVideo}
        />
        {callStatus !== 'connected' && (
          <div style={styles.videoPlaceholder}>
            {callStatus === 'waiting' ? 'Calling...' : 'No video'}
          </div>
        )}
        <span style={styles.videoLabel}>
          {callStatus === 'connected' ? 'Peer' : 'Waiting for peer'}
        </span>
      </div>

      {/* My video (small) */}
      <div style={{ ...styles.videoWrap, marginTop: 6 }}>
        <video
          ref={myVideoRef}
          autoPlay
          muted
          playsInline
          style={{
            ...styles.myVideo,
            filter: myVideoOn ? 'none' : 'brightness(0)',
          }}
        />
        <span style={styles.videoLabel}>You</span>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <button
          onClick={toggleVideo}
          style={styles.controlBtn(myVideoOn)}
          title={myVideoOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {myVideoOn ? '📹' : '📷'}
        </button>
        <button
          onClick={toggleAudio}
          style={styles.controlBtn(myAudioOn)}
          title={myAudioOn ? 'Mute' : 'Unmute'}
        >
          {myAudioOn ? '🎙️' : '🔇'}
        </button>
        {callStatus === 'idle' && (
          <button onClick={() => startCall()} style={styles.startBtn}>
            Start Call
          </button>
        )}
        {callStatus === 'waiting' && (
          <button style={{ ...styles.startBtn, background: '#f59e0b' }} disabled>
            Calling...
          </button>
        )}
        {callStatus === 'connected' && (
          <button onClick={endCall} style={{ ...styles.startBtn, background: '#ef4444' }}>
            End Call
          </button>
        )}
      </div>
    </div>
  )
}

const styles = {
  panel: {
    position: 'absolute',
    bottom: 36,
    right: 16,
    width: 200,
    background: '#13131f',
    border: '1px solid #2a2a3a',
    borderRadius: 12,
    padding: 10,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  videoWrap: {
    position: 'relative',
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    background: '#000',
  },
  peerVideo: {
    width: '100%',
    height: 130,
    objectFit: 'cover',
    display: 'block',
    borderRadius: 8,
  },
  myVideo: {
    width: '100%',
    height: 100,
    objectFit: 'cover',
    display: 'block',
    borderRadius: 8,
  },
  videoPlaceholder: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1e1e2e',
    color: '#475569',
    fontSize: 12,
    borderRadius: 8,
  },
  videoLabel: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    fontSize: 10,
    color: '#fff',
    background: 'rgba(0,0,0,0.6)',
    padding: '2px 6px',
    borderRadius: 4,
  },
  controls: {
    display: 'flex',
    gap: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  controlBtn: (active) => ({
    padding: '6px 8px',
    background: active ? '#1e293b' : '#450a0a',
    border: `1px solid ${active ? '#334155' : '#7f1d1d'}`,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
  }),
  startBtn: {
    flex: 1,
    padding: '7px 0',
    background: '#6366F1',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    background: '#2d1515',
    border: '1px solid #7f1d1d',
    color: '#fca5a5',
    padding: '6px 8px',
    borderRadius: 6,
    fontSize: 11,
    marginBottom: 8,
  },
}
