// client/src/components/SharedEditor.jsx
import { useEffect, useRef, useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { socket } from '../socket'

const CURSOR_COLORS = [
  '#F97316', '#8B5CF6', '#10B981',
  '#EF4444', '#3B82F6', '#EC4899',
]

export default function SharedEditor({ roomId, role, currentUser, onPeerRequest }) {
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const decorationsRef = useRef([])
  const isRemoteChange = useRef(false)

  const [code, setCode] = useState('// Start coding here...\n')
  const [peers, setPeers] = useState([])
  const [language, setLanguage] = useState('javascript')
  const [status, setStatus] = useState('Connecting...')

  useEffect(() => {
    socket.connect()

    // Join room based on role
    if (role === 'host') {
      socket.emit('join-room-host', { roomId, user: currentUser })
    } else {
      socket.emit('request-join', { roomId, user: currentUser })
    }

    // Successfully joined (both host and accepted peer)
    socket.on('joined-room', ({ role: confirmedRole }) => {
      setStatus(`Connected as ${confirmedRole}`)
    })

    // Peer waiting for host approval
    socket.on('waiting-for-host', ({ msg }) => {
      setStatus(msg)
    })

    // Peer was rejected
    socket.on('join-rejected', ({ msg }) => {
      setStatus('Rejected: ' + msg)
      alert(msg)
    })

    // Room error
    socket.on('join-error', ({ msg }) => {
      setStatus('Error: ' + msg)
      alert(msg)
    })

    // Receive code update (from host typing OR from server snapshot)
    socket.on('code-update', ({ newCode, senderId }) => {
      if (senderId === socket.id) return
      isRemoteChange.current = true
      setCode(newCode)
    })

    // Host pushed solution to peers
    socket.on('host-push', ({ content }) => {
      isRemoteChange.current = true
      setCode(content)
      setStatus('Host pushed new code!')
      setTimeout(() => setStatus('Connected as peer'), 3000)
    })

    // Cursor update from another user
    socket.on('cursor-update', ({ userId, userName, position }) => {
      setPeers(prev => {
        const exists = prev.find(p => p.id === userId)
        if (exists) {
          return prev.map(p => p.id === userId ? { ...p, cursor: position } : p)
        }
        return [...prev, { id: userId, name: userName, cursor: position }]
      })
    })

    // New user joined
    socket.on('user-joined', ({ userId, userName, role: joinedRole, socketId }) => {
      setPeers(prev => {
        if (prev.find(p => p.id === userId)) return prev
        return [...prev, { id: userId, name: userName, role: joinedRole, socketId }]
      })
      setStatus(`${userName} joined as ${joinedRole}`)
      setTimeout(() => setStatus('Connected'), 3000)
    })

    // Someone left
    socket.on('user-left', ({ userId, userName, role: leftRole }) => {
      setPeers(prev => prev.filter(p => p.id !== userId))
      setStatus(`${userName} left the room`)
      setTimeout(() => setStatus('Connected'), 3000)
    })

    // Host left
    socket.on('host-left', ({ msg }) => {
      setStatus(msg)
      alert(msg)
    })

    // Language changed
    socket.on('language-change', ({ lang }) => setLanguage(lang))

    // Host: peer requesting to join — pass up to EditorPage
    socket.on('peer-requesting', (data) => {
      if (onPeerRequest) onPeerRequest(data)
    })

    return () => {
      socket.off('joined-room')
      socket.off('waiting-for-host')
      socket.off('join-rejected')
      socket.off('join-error')
      socket.off('code-update')
      socket.off('host-push')
      socket.off('cursor-update')
      socket.off('user-joined')
      socket.off('user-left')
      socket.off('host-left')
      socket.off('language-change')
      socket.off('peer-requesting')
      socket.emit('leave-room', { roomId })
      socket.disconnect()
    }
  }, [roomId, role])

  // Render peer cursors as Monaco decorations
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return
    const monaco = monacoRef.current
    const editor = editorRef.current

    const newDecorations = peers
      .filter(p => p.cursor)
      .map((peer, i) => {
        const color = CURSOR_COLORS[i % CURSOR_COLORS.length]
        const className = `peer-cursor-${peer.id?.replace(/[^a-z0-9]/gi, '')}`
        injectCursorStyle(className, color, peer.name)
        return {
          range: new monaco.Range(
            peer.cursor.lineNumber,
            peer.cursor.column,
            peer.cursor.lineNumber,
            peer.cursor.column
          ),
          options: {
            className,
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        }
      })

    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecorations
    )
  }, [peers])

  const handleChange = useCallback((value) => {
    if (isRemoteChange.current) {
      isRemoteChange.current = false
      return
    }
    setCode(value)
    socket.emit('code-change', { roomId, newCode: value })
  }, [roomId])

  const handleCursorChange = useCallback((event) => {
    if (!event.position) return
    socket.emit('cursor-move', {
      roomId,
      userId: currentUser?.id,
      userName: currentUser?.name,
      position: {
        lineNumber: event.position.lineNumber,
        column: event.position.column,
      },
    })
  }, [roomId, currentUser])

  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    editor.onDidChangeCursorPosition(handleCursorChange)

    // Peers cannot type in the editor
    // Only host can type — peers receive pushed code
    if (role === 'peer') {
      editor.updateOptions({ readOnly: true })
    }
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {/* Status bar */}
      <div style={styles.statusBar}>
        <span style={styles.statusDot(status)} />
        <span style={styles.statusText}>{status}</span>
      </div>

      <Editor
        height="100%"
        language={language}
        value={code}
        theme="vs-dark"
        onChange={handleChange}
        onMount={handleMount}
        options={{
          fontSize: 15,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          cursorBlinking: 'smooth',
          // Hide the read-only tooltip for peers
          readOnlyMessage: { value: '' },
        }}
      />

      {/* Active peers list */}
      <div style={styles.peerList}>
        {peers.map((peer, i) => (
          <span
            key={peer.id}
            style={{
              ...styles.peerBadge,
              background: CURSOR_COLORS[i % CURSOR_COLORS.length],
            }}
          >
            {peer.name}
          </span>
        ))}
      </div>
    </div>
  )
}

const styles = {
  statusBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 24,
    background: '#007acc',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 12,
    gap: 6,
    zIndex: 10,
    fontSize: 11,
    color: '#fff',
  },
  statusDot: (status) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: status.includes('Error') || status.includes('Rejected')
      ? '#ef4444'
      : status.includes('Waiting') || status.includes('Connecting')
        ? '#f59e0b'
        : '#22c55e',
  }),
  statusText: { fontSize: 11 },
  peerList: {
    position: 'absolute',
    top: 8,
    right: 12,
    display: 'flex',
    gap: 6,
    zIndex: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  peerBadge: {
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 11,
    color: '#fff',
    fontWeight: 500,
  },
}

const injectedStyles = new Set()
function injectCursorStyle(className, color, userName) {
  if (injectedStyles.has(className)) return
  injectedStyles.add(className)
  const style = document.createElement('style')
  style.innerHTML = `
    .${className} {
      border-left: 2px solid ${color} !important;
      background: ${color}22;
    }
  `
  document.head.appendChild(style)
}
