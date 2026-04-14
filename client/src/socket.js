import { io } from 'socket.io-client';

export const socket = io(import.meta.env.VITE_SERVER_URL, {
  autoConnect: false,  // we connect manually when entering a room
  transports: ['websocket'],
});