let io = null;

function initSocket(server) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Join workspace room for multi-tenant updates
    socket.on('join-workspace', (workspaceId) => {
      socket.join(`workspace:${workspaceId}`);
      console.log(`Socket ${socket.id} joined workspace:${workspaceId}`);
    });

    // Leave workspace room
    socket.on('leave-workspace', (workspaceId) => {
      socket.leave(`workspace:${workspaceId}`);
      console.log(`Socket ${socket.id} left workspace:${workspaceId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIo() {
  return io;
}

function notifyWorkspace(workspaceId, event, data) {
  if (io) {
    io.to(`workspace:${workspaceId}`).emit(event, data);
  }
}

module.exports = {
  initSocket,
  getIo,
  notifyWorkspace,
};
