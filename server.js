const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// Store connected players with their names
const players = new Map();

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Handle player joining with name
    socket.on('playerJoined', (data) => {
        console.log('Player joined with name:', data.name);
        players.set(socket.id, {
            name: data.name,
            position: { x: -15, y: 0.5, z: -15 },
            rotation: 0
        });

        // Notify others about the new player
        socket.broadcast.emit('playerJoined', { 
            id: socket.id,
            name: data.name
        });

        // Send existing players to the new player
        players.forEach((player, playerId) => {
            if (playerId !== socket.id) {
                socket.emit('playerJoined', { 
                    id: playerId,
                    name: player.name
                });
            }
        });
    });

    // Handle position updates
    socket.on('updatePosition', (position) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = position;
            socket.broadcast.emit('updatePositions', {
                [socket.id]: position
            });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        players.delete(socket.id);
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 