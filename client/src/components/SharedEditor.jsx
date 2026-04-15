import { useEffect, useRef, useState, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { socket } from "../socket"; // your socket.io client instance

// ─── Cursor colours assigned per user ────────────────────────────────────────
const CURSOR_COLORS = [
  "#F97316", // orange
  "#8B5CF6", // violet
  "#10B981", // emerald
  "#EF4444", // red
  "#3B82F6", // blue
  "#EC4899", // pink
];

function getColorForUser(userId, userList) {
  const index = userList.findIndex((u) => u.id === userId);
  return CURSOR_COLORS[index % CURSOR_COLORS.length];
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SharedEditor({ roomId, role, currentUser, language = "javascript" }) {
  const editorRef = useRef(null);         // Monaco editor instance
  const monacoRef = useRef(null);         // Monaco API
  const decorationsRef = useRef([]);      // Cursor decoration IDs
  const isRemoteChange = useRef(false);   // Prevents echo loops

  const [code, setCode] = useState("// Start coding here...\n");
  const [peers, setPeers] = useState([]);  // { id, name, cursor: { lineNumber, column } }
  const [language_, setLanguage] = useState(language);

  // ── On mount: join room, listen for events ──────────────────────────────────
  useEffect(() => {
    socket.emit("join-room", { roomId, user: currentUser, role });

    // Another user's code change came in
    socket.on("code-update", ({ newCode, senderId }) => {
      if (senderId === socket.id) return;         // ignore own echo
      isRemoteChange.current = true;
      setCode(newCode);
    });

    // Another user's cursor moved
    socket.on("cursor-update", ({ userId, userName, position }) => {
      setPeers((prev) => {
        const exists = prev.find((p) => p.id === userId);
        if (exists) {
          return prev.map((p) =>
            p.id === userId ? { ...p, cursor: position } : p
          );
        }
        return [...prev, { id: userId, name: userName, cursor: position }];
      });
    });

    // Host pushed solution/notes to peers
    socket.on("host-push", ({ content }) => {
      if (role === "peer") {
        isRemoteChange.current = true;
        setCode(content);
      }
    });

    // Someone left the room
    socket.on("user-left", ({ userId }) => {
      setPeers((prev) => prev.filter((p) => p.id !== userId));
    });

    // Language changed by host
    socket.on("language-change", ({ lang }) => {
      setLanguage(lang);
    });

    return () => {
      socket.off("code-update");
      socket.off("cursor-update");
      socket.off("host-push");
      socket.off("user-left");
      socket.off("language-change");
      socket.emit("leave-room", { roomId, userId: currentUser.id });
    };
  }, [roomId, role, currentUser]);

  // ── Render peer cursors as Monaco decorations ───────────────────────────────
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const allUsers = [currentUser, ...peers];

    const newDecorations = peers
      .filter((p) => p.cursor)
      .map((peer) => {
        const color = getColorForUser(peer.id, allUsers);
        const { lineNumber, column } = peer.cursor;

        // Inject a CSS class for this user's cursor colour dynamically
        const className = `cursor-${peer.id.replace(/[^a-z0-9]/gi, "")}`;
        injectCursorStyle(className, color, peer.name);

        return {
          range: new monaco.Range(lineNumber, column, lineNumber, column),
          options: {
            className,                        // coloured cursor line
            beforeContentClassName: className + "-label", // name tag
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        };
      });

    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  }, [peers, currentUser]);

  // ── Handle local code changes ───────────────────────────────────────────────
  const handleChange = useCallback(
    (value) => {
      if (isRemoteChange.current) {
        isRemoteChange.current = false;
        return;
      }
      setCode(value);
      socket.emit("code-change", {
        roomId,
        newCode: value,
        senderId: socket.id,
      });
    },
    [roomId]
  );

  // ── Broadcast cursor position on move ──────────────────────────────────────
  const handleCursorChange = useCallback(
    (event) => {
      if (!event.position) return;
      socket.emit("cursor-move", {
        roomId,
        userId: currentUser.id,
        userName: currentUser.name,
        position: {
          lineNumber: event.position.lineNumber,
          column: event.position.column,
        },
      });
    },
    [roomId, currentUser]
  );

  // ── Wire up editor instance ─────────────────────────────────────────────────
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Listen for cursor position changes
    editor.onDidChangeCursorPosition(handleCursorChange);

    // Peers cannot type — editor is read-only for them
    // (Host pushes code to peers via the sidebar "Push" button)
    if (role === "peer") {
      editor.updateOptions({ readOnly: true });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <Editor
        height="100%"
        language={language_}
        value={code}
        theme="vs-dark"
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,     // resizes when parent changes
          tabSize: 2,
          wordWrap: "on",
          cursorBlinking: "smooth",
          renderLineHighlight: "line",
        }}
      />

      {/* Peer list overlay — shows who's in the room */}
      <div style={styles.peerList}>
        {peers.map((peer, i) => {
          const allUsers = [currentUser, ...peers];
          const color = getColorForUser(peer.id, allUsers);
          return (
            <span key={peer.id} style={{ ...styles.peerBadge, background: color }}>
              {peer.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  peerList: {
    position: "absolute",
    top: 8,
    right: 12,
    display: "flex",
    gap: 6,
    zIndex: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  peerBadge: {
    padding: "2px 10px",
    borderRadius: 12,
    fontSize: 11,
    color: "#fff",
    fontWeight: 500,
    opacity: 0.9,
    userSelect: "none",
  },
};

// ── Inject cursor CSS dynamically for each peer colour ────────────────────────
const injectedStyles = new Set();

function injectCursorStyle(className, color, userName) {
  if (injectedStyles.has(className)) return;
  injectedStyles.add(className);

  const style = document.createElement("style");
  style.innerHTML = `
    .${className} {
      border-left: 2px solid ${color} !important;
      background: ${color}22;
    }
    .${className}-label::before {
      content: '${userName}';
      background: ${color};
      color: #fff;
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      position: absolute;
      top: -18px;
      white-space: nowrap;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}
