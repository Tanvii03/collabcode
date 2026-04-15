// client/src/components/HostSidebar.jsx
import { useState, useEffect } from 'react'
import { socket } from '../socket'

export default function HostSidebar({ roomId, userId }) {
  const [notes, setNotes] = useState('')
  const [solution, setSolution] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [pushed, setPushed] = useState(false)
  const [noteStatus, setNoteStatus] = useState('')
  const [historyStatus, setHistoryStatus] = useState('')

  const LANGUAGES = [
    'javascript', 'typescript', 'python',
    'java', 'cpp', 'go', 'rust', 'csharp',
  ]

  // Load saved notes on mount
  useEffect(() => {
    socket.emit('load-notes', { roomId, userId })

    socket.on('notes-loaded', ({ notes: savedNotes }) => {
      setNotes(savedNotes || '')
    })

    socket.on('notes-saved', ({ msg }) => {
      setNoteStatus(msg)
      setTimeout(() => setNoteStatus(''), 3000)
    })

    socket.on('notes-save-error', ({ msg }) => {
      setNoteStatus('Error: ' + msg)
      setTimeout(() => setNoteStatus(''), 3000)
    })

    socket.on('history-deleted', ({ msg }) => {
      setHistoryStatus(msg)
      setSolution('')
      setTimeout(() => setHistoryStatus(''), 3000)
    })

    return () => {
      socket.off('notes-loaded')
      socket.off('notes-saved')
      socket.off('notes-save-error')
      socket.off('history-deleted')
    }
  }, [roomId, userId])

  const handlePush = () => {
    if (!solution.trim()) {
      alert('Write some code in the solution area first.')
      return
    }
    socket.emit('host-push', { roomId, content: solution })
    setPushed(true)
    setTimeout(() => setPushed(false), 2500)
  }

  const handleLanguageChange = (e) => {
    const lang = e.target.value
    setLanguage(lang)
    socket.emit('language-change', { roomId, lang })
  }

  const handleSaveNotes = () => {
    socket.emit('save-notes', { roomId, userId, notes })
  }

  const handleDeleteHistory = () => {
    const confirmed = window.confirm(
      'This will clear the editor code and your saved notes for this room. Are you sure?'
    )
    if (confirmed) {
      socket.emit('delete-room-history', { roomId, userId })
    }
  }

  return (
    <div style={styles.sidebar}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Host Panel</span>
        <span style={styles.privateBadge}>🔒 Private</span>
      </div>

      {/* Language selector */}
      <div style={styles.section}>
        <label style={styles.label}>LANGUAGE</label>
        <select
          value={language}
          onChange={handleLanguageChange}
          style={styles.select}
        >
          {LANGUAGES.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {/* Private notes */}
      <div style={styles.section}>
        <div style={styles.labelRow}>
          <label style={styles.label}>PRIVATE NOTES</label>
          <button onClick={handleSaveNotes} style={styles.saveBtn}>
            Save
          </button>
        </div>
        {noteStatus && (
          <div style={styles.toast(noteStatus.includes('Error'))}>{noteStatus}</div>
        )}
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Your private interview notes, hints, observations..."
          style={{ ...styles.textarea, minHeight: 110 }}
        />
        <p style={styles.hint}>
          Notes are saved to database. Peers never see this.
        </p>
      </div>

      {/* Solution / starter code */}
      <div style={styles.section}>
        <label style={styles.label}>SOLUTION / STARTER CODE</label>
        <textarea
          value={solution}
          onChange={e => setSolution(e.target.value)}
          placeholder="Write or paste solution/starter code here. Hit Push to send to peers."
          style={{ ...styles.textarea, minHeight: 160, fontFamily: 'monospace', fontSize: 12 }}
        />
        <button
          onClick={handlePush}
          style={{
            ...styles.pushBtn,
            background: pushed ? '#10B981' : '#6366F1',
          }}
        >
          {pushed ? '✓ Pushed to peers!' : 'Push to peers →'}
        </button>
        <p style={styles.hint}>
          Peers will see this code in their editor instantly.
        </p>
      </div>

      {/* Delete history */}
      <div style={styles.section}>
        <label style={styles.label}>ROOM MANAGEMENT</label>
        {historyStatus && (
          <div style={styles.toast(false)}>{historyStatus}</div>
        )}
        <button onClick={handleDeleteHistory} style={styles.deleteBtn}>
          🗑 Clear Room History
        </button>
        <p style={styles.hint}>
          Clears editor code and your saved notes for this room.
        </p>
      </div>
    </div>
  )
}

const styles = {
  sidebar: {
    width: 290,
    minWidth: 290,
    height: '100%',
    background: '#13131f',
    borderLeft: '1px solid #2a2a3a',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    boxSizing: 'border-box',
    fontFamily: 'sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid #2a2a3a',
  },
  title: { color: '#e2e8f0', fontSize: 14, fontWeight: 600 },
  privateBadge: {
    fontSize: 11,
    background: '#1e293b',
    padding: '3px 8px',
    borderRadius: 12,
    color: '#64748b',
  },
  section: {
    padding: '14px 16px',
    borderBottom: '1px solid #1a1a2a',
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    display: 'block',
    color: '#475569',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    marginBottom: 8,
  },
  select: {
    width: '100%',
    background: '#1e1e2e',
    color: '#e2e8f0',
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 13,
    cursor: 'pointer',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    background: '#1e1e2e',
    color: '#e2e8f0',
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    resize: 'vertical',
    outline: 'none',
    lineHeight: 1.6,
    boxSizing: 'border-box',
  },
  saveBtn: {
    padding: '4px 12px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 6,
    color: '#94a3b8',
    fontSize: 12,
    cursor: 'pointer',
  },
  pushBtn: {
    width: '100%',
    padding: '11px 0',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
    transition: 'background 0.2s',
  },
  deleteBtn: {
    width: '100%',
    padding: '10px 0',
    background: '#1a0a0a',
    border: '1px solid #7f1d1d',
    borderRadius: 8,
    color: '#fca5a5',
    fontSize: 13,
    cursor: 'pointer',
  },
  hint: {
    color: '#334155',
    fontSize: 11,
    marginTop: 6,
    lineHeight: 1.5,
  },
  toast: (isError) => ({
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 12,
    marginBottom: 8,
    background: isError ? '#2d1515' : '#0f2d1e',
    color: isError ? '#fca5a5' : '#86efac',
    border: `1px solid ${isError ? '#7f1d1d' : '#166534'}`,
  }),
}
