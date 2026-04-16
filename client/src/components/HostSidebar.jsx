// client/src/components/HostSidebar.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Interviewer's private panel:
//   - Send hint/suggestion → appears as popup on candidate's screen
//   - Private notes        → saved to DB, only interviewer sees
//   - Solution code        → push to replace candidate's editor
//   - Language selector    → changes language for everyone
//   - Room management      → clear history (DELETE in CRUD)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { socket } from '../socket'

const LANGUAGES = [
  'javascript', 'typescript', 'python',
  'java', 'cpp', 'go', 'rust', 'csharp', 'sql',
]

const HINT_TYPES = [
  { value: 'info',    label: '💡 Hint',    color: '#3b82f6' },
  { value: 'warning', label: '⚠️ Warning', color: '#f59e0b' },
  { value: 'success', label: '✅ Good job', color: '#22c55e' },
  { value: 'error',   label: '❌ Mistake', color: '#ef4444' },
]

export default function HostSidebar({ roomId, userId }) {
  // ── Notes state ─────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState('')
  const [notesOriginal, setNotesOriginal] = useState('')  // track if changed
  const [noteStatus, setNoteStatus] = useState('')

  // ── Hint state ───────────────────────────────────────────────────────────────
  const [hint, setHint] = useState('')
  const [hintType, setHintType] = useState('info')
  const [hintSent, setHintSent] = useState(false)
  const [hintHistory, setHintHistory] = useState([]) // keep track of sent hints

  // ── Solution push state ──────────────────────────────────────────────────────
  const [solution, setSolution] = useState('')
  const [pushed, setPushed] = useState(false)

  // ── Language state ───────────────────────────────────────────────────────────
  const [language, setLanguage] = useState('javascript')

  // ── Room management ──────────────────────────────────────────────────────────
  const [historyStatus, setHistoryStatus] = useState('')

  // ── Load notes on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    socket.emit('load-notes', { roomId, userId })

    socket.on('notes-loaded', ({ notes: saved }) => {
      setNotes(saved || '')
      setNotesOriginal(saved || '')
    })
    socket.on('notes-saved', ({ msg }) => {
      setNoteStatus(msg)
      setNotesOriginal(notes)
      setTimeout(() => setNoteStatus(''), 3000)
    })
    socket.on('notes-updated', ({ msg }) => {
      setNoteStatus(msg)
      setNotesOriginal(notes)
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
    socket.on('language-update', ({ lang }) => setLanguage(lang))

    return () => {
      socket.off('notes-loaded')
      socket.off('notes-saved')
      socket.off('notes-updated')
      socket.off('notes-save-error')
      socket.off('history-deleted')
      socket.off('language-update')
    }
  }, [roomId, userId])

  // ── Send a hint to candidate ─────────────────────────────────────────────────
  const sendHint = () => {
    if (!hint.trim()) {
      alert('Type a hint first.')
      return
    }
    socket.emit('send-hint', { roomId, hint, hintType })
    setHintHistory(prev => [...prev, {
      text: hint, type: hintType,
      time: new Date().toLocaleTimeString(),
    }])
    setHint('')
    setHintSent(true)
    setTimeout(() => setHintSent(false), 2500)
  }

  // ── Save notes (CREATE if first time, UPDATE if exists) ──────────────────────
  const saveNotes = () => {
    const isUpdate = notesOriginal !== ''
    socket.emit(isUpdate ? 'update-notes' : 'save-notes', {
      roomId, userId, notes,
    })
  }

  // ── Push solution to candidate ───────────────────────────────────────────────
  const pushSolution = () => {
    if (!solution.trim()) {
      alert('Write code in the solution area first.')
      return
    }
    if (!window.confirm('This will replace the candidate\'s current code. Continue?')) return
    socket.emit('host-push', { roomId, content: solution })
    setPushed(true)
    setTimeout(() => setPushed(false), 2500)
  }

  // ── Change language ───────────────────────────────────────────────────────────
  const changeLanguage = (lang) => {
    setLanguage(lang)
    socket.emit('language-change', { roomId, lang })
  }

  // ── Delete room history ───────────────────────────────────────────────────────
  const deleteHistory = () => {
    if (!window.confirm('Clear all room code history and your notes? This cannot be undone.')) return
    socket.emit('delete-room-history', { roomId, userId })
  }

  const notesChanged = notes !== notesOriginal

  return (
    <div style={styles.sidebar}>

      {/* ── Header ── */}
      <div style={styles.header}>
        <span style={styles.title}>Interviewer Panel</span>
        <span style={styles.privateBadge}>🔒 Private</span>
      </div>

      {/* ── Language selector ── */}
      <Section label="LANGUAGE">
        <select
          value={language}
          onChange={e => changeLanguage(e.target.value)}
          style={styles.select}
        >
          {LANGUAGES.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </Section>

      {/* ── Send hint to candidate ── */}
      <Section label="SEND HINT TO CANDIDATE">
        <div style={styles.hintTypeRow}>
          {HINT_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setHintType(t.value)}
              style={{
                ...styles.hintTypeBtn,
                borderColor: hintType === t.value ? t.color : '#2a2a3a',
                background: hintType === t.value ? t.color + '22' : 'transparent',
                color: hintType === t.value ? t.color : '#64748b',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          value={hint}
          onChange={e => setHint(e.target.value)}
          placeholder="Type a hint, suggestion, or feedback for the candidate..."
          style={{ ...styles.textarea, minHeight: 80 }}
          onKeyDown={e => {
            if (e.key === 'Enter' && e.ctrlKey) sendHint()
          }}
        />
        <button
          onClick={sendHint}
          style={{
            ...styles.actionBtn,
            background: hintSent ? '#16a34a' : '#2563eb',
          }}
        >
          {hintSent ? '✓ Hint sent!' : 'Send Hint (Ctrl+Enter)'}
        </button>

        {/* Hint history */}
        {hintHistory.length > 0 && (
          <div style={styles.hintHistory}>
            <div style={styles.hintHistoryLabel}>Sent hints this session:</div>
            {hintHistory.slice(-3).reverse().map((h, i) => (
              <div key={i} style={styles.hintHistoryItem}>
                <span style={{ fontSize: 10, color: '#475569' }}>{h.time}</span>
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>
                  {h.text.length > 50 ? h.text.slice(0, 50) + '...' : h.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Solution / starter code push ── */}
      <Section label="PUSH CODE TO CANDIDATE">
        <textarea
          value={solution}
          onChange={e => setSolution(e.target.value)}
          placeholder="Write solution or starter code. Pushing will replace candidate's editor."
          style={{
            ...styles.textarea,
            minHeight: 140,
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        />
        <button
          onClick={pushSolution}
          style={{
            ...styles.actionBtn,
            background: pushed ? '#16a34a' : '#7c3aed',
          }}
        >
          {pushed ? '✓ Pushed to candidate!' : '⬆ Push to candidate editor'}
        </button>
        <p style={styles.hint}>
          This replaces what the candidate sees in their editor.
        </p>
      </Section>

      {/* ── Private notes (CRUD: Create + Update) ── */}
      <Section label="PRIVATE NOTES">
        <div style={styles.notesHeader}>
          <span style={styles.notesStatus(notesChanged)}>
            {notesChanged ? 'Unsaved changes' : 'Saved'}
          </span>
          <button
            onClick={saveNotes}
            style={{
              ...styles.saveBtn,
              borderColor: notesChanged ? '#6366F1' : '#2a2a3a',
              color: notesChanged ? '#a5b4fc' : '#475569',
            }}
          >
            {notesOriginal ? 'Update Notes' : 'Save Notes'}
          </button>
        </div>
        {noteStatus && (
          <div style={styles.toast(noteStatus.includes('Error'))}>
            {noteStatus}
          </div>
        )}
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Private interview notes... Only you see this. Saved to database."
          style={{ ...styles.textarea, minHeight: 120 }}
        />
        <p style={styles.hint}>
          Saved to database. Candidate never sees this. Persists across sessions.
        </p>
      </Section>

      {/* ── Room management (DELETE in CRUD) ── */}
      <Section label="ROOM MANAGEMENT">
        {historyStatus && (
          <div style={styles.toast(false)}>{historyStatus}</div>
        )}
        <button onClick={deleteHistory} style={styles.deleteBtn}>
          🗑 Clear Room History
        </button>
        <p style={styles.hint}>
          Resets editor code and deletes your saved notes.
        </p>
      </Section>

    </div>
  )
}

// ── Reusable section wrapper ──────────────────────────────────────────────────
function Section({ label, children }) {
  return (
    <div style={sectionStyle}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  )
}
const sectionStyle = {
  padding: '14px 16px',
  borderBottom: '1px solid #1a1a2a',
}
const labelStyle = {
  fontSize: 10,
  fontWeight: 700,
  color: '#475569',
  letterSpacing: '0.08em',
  marginBottom: 10,
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  sidebar: {
    width: 300,
    minWidth: 300,
    height: '100%',
    background: '#13131f',
    borderLeft: '1px solid #2a2a3a',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    fontFamily: 'sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid #2a2a3a',
    flexShrink: 0,
  },
  title: { color: '#e2e8f0', fontSize: 14, fontWeight: 600 },
  privateBadge: {
    fontSize: 11,
    background: '#1e293b',
    padding: '3px 8px',
    borderRadius: 10,
    color: '#64748b',
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
  hintTypeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  hintTypeBtn: {
    padding: '4px 10px',
    border: '1.5px solid',
    borderRadius: 20,
    fontSize: 11,
    cursor: 'pointer',
    background: 'transparent',
    transition: 'all 0.15s',
    fontFamily: 'sans-serif',
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
    fontFamily: 'sans-serif',
  },
  actionBtn: {
    width: '100%',
    padding: '10px 0',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
    transition: 'background 0.2s',
    fontFamily: 'sans-serif',
  },
  hintHistory: {
    marginTop: 10,
    background: '#0f0f1a',
    borderRadius: 8,
    padding: '8px 10px',
  },
  hintHistoryLabel: {
    fontSize: 10,
    color: '#334155',
    marginBottom: 6,
    fontWeight: 600,
    letterSpacing: '0.05em',
  },
  hintHistoryItem: {
    padding: '3px 0',
    borderTop: '1px solid #1a1a2a',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 4,
  },
  notesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  notesStatus: (changed) => ({
    fontSize: 11,
    color: changed ? '#f59e0b' : '#22c55e',
  }),
  saveBtn: {
    padding: '5px 12px',
    background: 'transparent',
    border: '1px solid',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'sans-serif',
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
    fontFamily: 'sans-serif',
  },
  hint: {
    color: '#334155',
    fontSize: 11,
    marginTop: 6,
    lineHeight: 1.5,
    fontFamily: 'sans-serif',
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
