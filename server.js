const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class VoteServer {
  constructor(port = 7004) { // Default port set to 7004
    this.port = port;
    this.setupServer();
  }

  setupServer() {
    this.server = new WebSocket.Server({ 
      port: this.port,
      perMessageDeflate: false
    });
    
    this.clients = new Map();
    this.votes = new Map();
    this.votedClients = new Set();
    this.candidates = ['Candidate A', 'Candidate B', 'Candidate C'];
    
    this.initializeCandidates();
    this.setupEventHandlers();
  }

  initializeCandidates() {
    this.candidates.forEach(candidate => {
      this.votes.set(candidate, 0);
    });
  }

  setupEventHandlers() {
    this.server.on('listening', () => {
      console.log(`✅ Vote server running on ws://localhost:${this.port}`);
    });

    this.server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`❌ Port ${this.port} is already in use. Trying port ${this.port + 1}...`);
        this.port += 1;
        this.setupServer(); // Restart with new port
      } else {
        console.error('Server error:', error);
      }
    });

    this.server.on('connection', (ws, req) => {
      const clientId = uuidv4();
      const clientIp = req.socket.remoteAddress;
      
      this.clients.set(clientId, ws);
      console.log(`🔗 Client connected: ${clientId} from ${clientIp}`);
      
      // Send welcome message
      this.sendToClient(ws, {
        type: 'welcome',
        clientId: clientId,
        candidates: this.candidates,
        tally: this.getTally()
      });

      // Handle messages from client
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(clientId, message);
        } catch (error) {
          console.error('Error parsing message:', error);
          this.sendToClient(ws, {
            type: 'error',
            message: 'Invalid message format'
          });
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        console.log(`❌ Client disconnected: ${clientId}`);
        this.clients.delete(clientId);
        this.votedClients.delete(clientId);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
      });
    });
  }

  handleMessage(clientId, message) {
    console.log(`📨 Received ${message.type} from ${clientId.substring(0, 8)}`);
    
    switch (message.type) {
      case 'vote':
        this.handleVote(clientId, message);
        break;
      case 'request_tally':
        this.sendTallyToClient(clientId);
        break;
      default:
        console.log('Unknown message type:', message.type);
        this.sendToClient(this.clients.get(clientId), {
          type: 'error',
          message: 'Unknown message type'
        });
    }
  }

  handleVote(clientId, message) {
    if (this.votedClients.has(clientId)) {
      this.sendToClient(this.clients.get(clientId), {
        type: 'error',
        message: 'You have already voted!'
      });
      return;
    }

    const { candidate } = message;
    if (!this.candidates.includes(candidate)) {
      this.sendToClient(this.clients.get(clientId), {
        type: 'error',
        message: 'Invalid candidate selected!'
      });
      return;
    }

    // Record vote
    this.votes.set(candidate, this.votes.get(candidate) + 1);
    this.votedClients.add(clientId);

    // Send confirmation to voter
    this.sendToClient(this.clients.get(clientId), {
      type: 'vote_confirmed',
      candidate: candidate
    });

    // Broadcast updated tally to all clients
    this.broadcastTally();

    console.log(`🗳️ Vote recorded: ${clientId.substring(0, 8)} voted for ${candidate}`);
    console.log(`📊 Current tally:`, this.getTally());
  }

  sendTallyToClient(clientId) {
    const ws = this.clients.get(clientId);
    if (ws) {
      this.sendToClient(ws, {
        type: 'tally_update',
        tally: this.getTally(),
        totalVotes: this.votedClients.size
      });
    }
  }

  broadcastTally() {
    const tallyMessage = {
      type: 'tally_update',
      tally: this.getTally(),
      totalVotes: this.votedClients.size
    };

    let connectedClients = 0;
    this.clients.forEach((ws, clientId) => {
      if (this.sendToClient(ws, tallyMessage)) {
        connectedClients++;
      }
    });
    
    console.log(`📢 Tally broadcast to ${connectedClients} clients`);
  }

  getTally() {
    return Array.from(this.votes.entries()).map(([candidate, votes]) => ({
      candidate,
      votes
    }));
  }

  sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Error sending message to client:', error);
        return false;
      }
    }
    return false;
  }
}

// Start server explicitly on port 7004
const PORT = 7004;
console.log(`🚀 Starting Vote Server on port ${PORT}...`);
new VoteServer(PORT);