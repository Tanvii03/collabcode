// client/src/components/HostSidebar.jsx
import { useState } from "react";
import { socket } from "../socket";

export default function HostSidebar({ roomId }) {
  const [notes, setNotes] = useState("");
  const [solution, setSolution] = useState("");
  const [pushed, setPushed] = useState(false);

  const handlePush = () => {
    // Push the solution code to all peers in the room
    socket.emit("host-push", { roomId, content: solution });
    setPushed(true);
    setTimeout(() => setPushed(false), 2000); // reset feedback
  };

  const handleLanguageChange = (e) => {
    socket.emit("language-change", { roomId, lang: e.target.value });
  };

  return (
    <div style={styles.sidebar}>
      <h3 style={styles.heading}>Host Panel <span style={styles.private}>🔒 Private</span></h3>

      {/* Language selector */}
      <label style={styles.label}>Language</label>
      <select onChange={handleLanguageChange} style={styles.select} defaultValue="javascript">
        {["javascript", "typescript", "python", "java", "cpp", "go", "rust"].map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>

      {/* Private notes — only host sees this */}
      <label style={styles.label}>Private notes</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Your private interview notes, hints, observations..."
        style={{ ...styles.textarea, minHeight: 120 }}
      />

      {/* Solution code to push to peers */}
      <label style={styles.label}>Solution / starter code</label>
      <textarea
        value={solution}
        onChange={(e) => setSolution(e.target.value)}
        placeholder="Paste solution or starter code here. Hit Push to send to peers' editor."
        style={{ ...styles.textarea, minHeight: 180, fontFamily: "monospace", fontSize: 13 }}
      />

      <button
        onClick={handlePush}
        style={{ ...styles.button, background: pushed ? "#10B981" : "#6366F1" }}
      >
        {pushed ? "✓ Pushed to peers!" : "Push to peers →"}
      </button>

      <p style={styles.hint}>
        Peers will see this code in their editor. Your private notes stay here only.
      </p>
    </div>
  );
}

const styles = {
  sidebar: {
    width: 280,
    minWidth: 280,
    height: "100%",
    background: "#1e1e2e",
    borderLeft: "1px solid #2a2a3a",
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    overflowY: "auto",
    boxSizing: "border-box",
  },
  heading: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: 600,
    margin: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  private: {
    fontSize: 11,
    background: "#374151",
    padding: "2px 8px",
    borderRadius: 12,
    color: "#9ca3af",
    fontWeight: 400,
  },
  label: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: -4,
  },
  select: {
    background: "#2a2a3a",
    color: "#e2e8f0",
    border: "1px solid #3f3f5a",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    cursor: "pointer",
  },
  textarea: {
    background: "#2a2a3a",
    color: "#e2e8f0",
    border: "1px solid #3f3f5a",
    borderRadius: 6,
    padding: "10px",
    fontSize: 13,
    resize: "vertical",
    outline: "none",
    lineHeight: 1.6,
  },
  button: {
    padding: "10px 0",
    borderRadius: 8,
    border: "none",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.2s",
    marginTop: 4,
  },
  hint: {
    color: "#4b5563",
    fontSize: 11,
    lineHeight: 1.5,
    margin: 0,
  },
};
