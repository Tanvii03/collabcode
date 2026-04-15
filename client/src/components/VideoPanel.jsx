import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';

export default function VideoPanel({ roomId, userId }) {
  const myVideoRef = useRef();
  const peerVideoRef = useRef();
  const peerConnectionRef = useRef();
  const [callActive, setCallActive] = useState(false);

  useEffect(() => {
    // Get user's camera and mic
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        myVideoRef.current.srcObject = stream;

        // When someone calls us
        socket.on('incoming-call', async ({ from, offer }) => {
          peerConnectionRef.current = createPeerConnection(stream);
          await peerConnectionRef.current.setRemoteDescription(offer);
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          socket.emit('call-accepted', { to: from, answer });
          setCallActive(true);
        });

        // When our call is accepted
        socket.on('call-accepted', async ({ answer }) => {
          await peerConnectionRef.current.setRemoteDescription(answer);
          setCallActive(true);
        });

        // ICE candidate received
        socket.on('ice-candidate', ({ candidate }) => {
          peerConnectionRef.current?.addIceCandidate(candidate);
        });
      });

    return () => {
      socket.off('incoming-call');
      socket.off('call-accepted');
      socket.off('ice-candidate');
    };
  }, []);

  function createPeerConnection(stream) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Add our video/audio tracks
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // When ICE candidates are found, share with peer
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('ice-candidate', { roomId, candidate });
    };

    // When peer's video arrives
    pc.ontrack = ({ streams }) => {
      peerVideoRef.current.srcObject = streams[0];
    };

    return pc;
  }

  const startCall = async () => {
    const stream = myVideoRef.current.srcObject;
    peerConnectionRef.current = createPeerConnection(stream);
    const offer = await peerConnectionRef.current.createOffer();
    await peerConnectionRef.current.setLocalDescription(offer);
    socket.emit('call-user', { roomId, offer });
  };

  return (
    <div style={styles.panel}>
      <video ref={myVideoRef} autoPlay muted style={styles.myVid} />
      <video ref={peerVideoRef} autoPlay style={styles.peerVid} />
      {!callActive && (
        <button onClick={startCall} style={styles.callBtn}>
          Start Call
        </button>
      )}
    </div>
  );
}

const styles = {
  panel:{position:'absolute',bottom:16,right:16,
    display:'flex',flexDirection:'column',gap:8,zIndex:100},
  myVid:{width:160,height:120,background:'#000',borderRadius:8,
    border:'2px solid #6366F1'},
  peerVid:{width:160,height:120,background:'#111',borderRadius:8,
    border:'2px solid #10B981'},
  callBtn:{padding:'8px 16px',background:'#6366F1',border:'none',
    borderRadius:8,color:'#fff',cursor:'pointer',fontSize:13},
};
