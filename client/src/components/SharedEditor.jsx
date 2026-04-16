// client/src/components/SharedEditor.jsx
// ─────────────────────────────────────────────────────────────────────────────
// CANDIDATE (peer): Full editor — can type freely. Code syncs to host live.
//                   Receives hint popups from interviewer.
//                   Receives pushed solutions from interviewer.
//
// INTERVIEWER (host): Read-only mirror of candidate's code.
//                     Sees every keystroke in real time.
//                     Cursor shows where candidate is typing.
// ─────────────────────────────────────────────────────────────────────────────

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

  const [code, setCode] = useState('// Candidate will write code here...\n')
  const [language, setLanguage] = useState('javascript')
  const [peers, setPeers] = useState([])
  const [status, setStatus] = useState('Connecting...')

  // Hint system state
  const [hints, setHints] = useState([])   // list of active hints shown to candidate

  useEffect(() => {
    socket.connect()

    // Join based on role
    if (role === 'host') {
      socket.emit('join-room-host', { roomId, user: currentUser })
    } else {
      socket.emit('request-join', { roomId, user: currentUser })
    }

    // ── Socket event listeners ────────────────────────────────────────────────

    socket.on('joined-room', ({ role: r }) => {
      setStatus(r === 'host' ? 'Interviewer connected' : 'Connected — you can start typing')
    })

    socket.on('waiting-for-host', ({ msg }) => setStatus(msg))
    socket.on('join-error', ({ msg }) => { setStatus('Error: ' + msg); alert(msg) })
    socket.on('join-rejected', ({ msg }) => { setStatus('Rejected'); alert(msg) })

    // Code update — from candidate typing or server snapshot
    socket.on('code-update', ({ newCode, senderId }) => {
      if (senderId === socket.id) return   // ignore own echo
      isRemoteChange.current = true
      setCode(newCode)
    })

    // Language changed by host
    socket.on('language-update', ({ lang }) => setLanguage(lang))

    // Host pushed full solution/starter code
    socket.on('host-push', ({ content }) => {
      // Only for candidates — replaces their editor content
      isRemoteChange.current = true
      setCode(content)
      // Add a hint notification about the push
      addHint({
        hint: 'Interviewer has pushed new code to your editor.',
        hintType: 'success',
        from: 'System',
        timestamp: new Date().toLocaleTimeString(),
      })
    })

    // Hint/suggestion received (candidate only sees this)
    socket.on('hint-received', (hintData) => {
      addHint(hintData)
    })

    // Someone joined/left
    socket.on('user-joined', ({ userId, userName, role: r, socketId }) => {
      setPeers(prev =>
        prev.find(p => p.id === userId)
          ? prev
          : [...prev, { id: userId, name: userName, role: r, socketId }]
      )
      setStatus(`${userName} joined as ${r === 'host' ? 'Interviewer' : 'Candidate'}`)
      setTimeout(() => setStatus('Connected'), 3000)
    })

    socket.on('user-left', ({ userName, role: r }) => {
      setPeers(prev => prev.filter(p => p.name !== userName))
      setStatus(`${userName} left`)
      setTimeout(() => setStatus('Connected'), 3000)
    })

    socket.on('host-left', ({ msg }) => {
      setStatus(msg)
      alert(msg)
    })

    // Cursor updates from others
    socket.on('cursor-update', ({ userId, userName, position }) => {
      setPeers(prev => {
        const exists = prev.find(p => p.id === userId)
        if (exists) return prev.map(p => p.id === userId ? { ...p, cursor: position } : p)
        return [...prev, { id: userId, name: userName, cursor: position }]
      })
    })

    // Pass peer requests up to EditorPage (host only)
    socket.on('peer-requesting', (data) => {
      if (onPeerRequest) onPeerRequest(data)
    })

    return () => {
      ;[
        'joined-room', 'waiting-for-host', 'join-error', 'join-rejected',
        'code-update', 'language-update', 'host-push', 'hint-received',
        'user-joined', 'user-left', 'host-left', 'cursor-update', 'peer-requesting',
      ].forEach(ev => socket.off(ev))

      socket.emit('leave-room', { roomId })
      socket.disconnect()
    }
  }, [roomId, role])

  // ── Add a hint to the list (auto-removes after 12 seconds) ─────────────────
  const addHint = (hintData) => {
    const id = Date.now() + Math.random()
    setHints(prev => [...prev, { ...hintData, id }])
    setTimeout(() => {
      setHints(prev => prev.filter(h => h.id !== id))
    }, 12000)
  }

  const dismissHint = (id) => {
    setHints(prev => prev.filter(h => h.id !== id))
  }

  // ── Render peer cursors as Monaco decorations ───────────────────────────────
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
            peer.cursor.lineNumber, peer.cursor.column,
            peer.cursor.lineNumber, peer.cursor.column
          ),
          options: {
            className,
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        }
      })

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations)
  }, [peers])

  // ── Handle code changes ─────────────────────────────────────────────────────
  const handleChange = useCallback((value) => {
    if (isRemoteChange.current) {
      isRemoteChange.current = false
      return
    }
    setCode(value)
    socket.emit('code-change', { roomId, newCode: value })
  }, [roomId])

  // ── Broadcast cursor position ───────────────────────────────────────────────
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

  // ── Wire up Monaco ──────────────────────────────────────────────────────────
  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    editor.onDidChangeCursorPosition(handleCursorChange)

    // HOST: read-only mirror of candidate's work
    // PEER (candidate): full edit access
    if (role === 'host') {
      editor.updateOptions({ readOnly: true })
    }
  }

  // ── Hint colour by type ─────────────────────────────────────────────────────
  const hintColors = {
    info:    { bg: '#0c1a2e', border: '#1d4ed8', text: '#93c5fd', icon: '💡' },
    warning: { bg: '#1c1400', border: '#d97706', text: '#fde68a', icon: '⚠️' },
    success: { bg: '#0a1f12', border: '#16a34a', text: '#86efac', icon: '✅' },
    error:   { bg: '#1f0a0a', border: '#dc2626', text: '#fca5a5', icon: '❌' },
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>

      {/* ── Role indicator header ── */}
      <div style={styles.editorHeader(role)}>
        {role === 'host'
          ? '👁 Interviewer View — watching candidate in real time (read only)'
          : '💻 Your Editor — write your solution here'}
      </div>

      {/* ── Monaco Editor ── */}
      <Editor
        height="calc(100% - 54px)"
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
          readOnlyMessage: { value: '' },
          // Show a subtle watermark for host
          ...(role === 'host' && {
            renderLineHighlight: 'none',
          }),
        }}
      />

      {/* ── Status bar (bottom) ── */}
      <div style={styles.statusBar}>
        <span style={styles.statusDot(status)} />
        <span style={{ fontSize: 11 }}>{status}</span>
        {peers.length > 0 && (
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
        )}
      </div>

      {/* ── Hint popups (candidate/peer only) ── */}
      {role === 'peer' && hints.length > 0 && (
        <div style={styles.hintsContainer}>
          {hints.map(h => {
            const c = hintColors[h.hintType] || hintColors.info
            return (
              <div key={h.id} style={styles.hintCard(c)}>
                <div style={styles.hintHeader}>
                  <span style={styles.hintIcon}>{c.icon}</span>
                  <span style={{ ...styles.hintFrom, color: c.text }}>
                    Hint from {h.from}
                  </span>
                  <span style={styles.hintTime}>{h.timestamp}</span>
                  <button
                    onClick={() => dismissHint(h.id)}
                    style={styles.hintClose}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ ...styles.hintText, color: c.text }}>
                  {h.hint}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  editorHeader: (role) => ({
    height: 30,
    background: role === 'host' ? '#0c1a2e' : '#0a1f12',
    borderBottom: `1px solid ${role === 'host' ? '#1d4ed8' : '#166534'}`,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 14,
    fontSize: 11,
    color: role === 'host' ? '#93c5fd' : '#86efac',
    fontFamily: 'sans-serif',
    flexShrink: 0,
  }),
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
    fontFamily: 'sans-serif',
  },
  statusDot: (status) => ({
    width: 7, height: 7, borderRadius: '50%',
    background: status.includes('Error') || status.includes('Rejected')
      ? '#ef4444'
      : status.includes('Waiting') || status.includes('Connecting')
        ? '#f59e0b'
        : '#22c55e',
  }),
  peerList: {
    marginLeft: 'auto',
    display: 'flex',
    gap: 6,
    paddingRight: 12,
  },
  peerBadge: {
    padding: '1px 8px',
    borderRadius: 10,
    fontSize: 10,
    color: '#fff',
    fontWeight: 500,
  },
  // Hint popup container — bottom-left of editor
  hintsContainer: {
    position: 'absolute',
    bottom: 36,
    left: 16,
    width: 340,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    zIndex: 50,
    fontFamily: 'sans-serif',
  },
  hintCard: (c) => ({
    background: c.bg,
    border: `1px solid ${c.border}`,
    borderLeft: `4px solid ${c.border}`,
    borderRadius: 10,
    padding: '10px 12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    animation: 'slideIn 0.2s ease',
  }),
  hintHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  hintIcon: { fontSize: 14 },
  hintFrom: { fontWeight: 600, fontSize: 12, flex: 1 },
  hintTime: { fontSize: 10, color: '#475569' },
  hintClose: {
    background: 'transparent',
    border: 'none',
    color: '#475569',
    cursor: 'pointer',
    fontSize: 12,
    padding: '0 2px',
  },
  hintText: {
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
}

// ── CSS animation for hint popups ─────────────────────────────────────────────
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.innerHTML = `
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(-20px); }
      to   { opacity: 1; transform: translateX(0); }
    }
  `
  document.head.appendChild(style)
}

// ── Inject cursor decoration CSS ──────────────────────────────────────────────
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
