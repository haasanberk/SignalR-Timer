class SignalRService {
    constructor() {
        this.connection = null;
        this.callbacks = {
            onNameReceived: null,
            onConnectionStatusChanged: null
        };
        this.connectionState = 'disconnected';
        this._pendingMessages = new Set(); // Track pending messages
        this.disconnectReason = null;
        this.keepAliveInterval = null;
        this.lastKeepAlive = Date.now();
        this.isEnabled = true;
    }

    initialize() {
        if (!this.isEnabled) {
            console.log('SignalR is disabled');
            return;
        }

        if (typeof signalR === 'undefined') {
            console.error('SignalR library not loaded!');
            return;
        }

        // Define connection only once
        if (!this.connection) {
            this.connection = new signalR.HubConnectionBuilder()
                .withUrl("/randomNameHub", {
                    transport: signalR.HttpTransportType.WebSockets | 
                              signalR.HttpTransportType.ServerSentEvents | 
                              signalR.HttpTransportType.LongPolling,
                    skipNegotiation: false
                })
                .withAutomaticReconnect({
                    nextRetryDelayInMilliseconds: retryContext => {
                        if (retryContext.previousRetryCount === 0) {
                            return 0;
                        }
                        if (retryContext.previousRetryCount < 10) {
                            return 1000;
                        }
                        return 3000;
                    }
                })
                .withKeepAliveInterval(15000)
                .withServerTimeout(30000)
                .configureLogging(signalR.LogLevel.Information)
                .build();

            this.setupConnectionHandlers();
            this.setupMessageHandlers();
            this.setupPageLifecycle();
        }

        // Start the connection
        this.startConnection();

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
        // Handle online/offline events
        window.addEventListener('online', () => this.handleOnlineStatus(true));
        window.addEventListener('offline', () => this.handleOnlineStatus(false));
    }

    setupConnectionHandlers() {
        this.connection.onreconnecting(error => {
            console.log('Reconnecting to SignalR hub...', error);
            this.connectionState = 'reconnecting';
            this.notifyConnectionStatus('Reconnecting...', 'warning');
        });

        this.connection.onreconnected(connectionId => {
            console.log('Reconnected to SignalR hub', connectionId);
            this.connectionState = 'connected';
            this.disconnectReason = null;
            this.notifyConnectionStatus('Connected', 'success');
        });

        this.connection.onclose(error => {
            console.log('SignalR connection closed', error);
            this.connectionState = 'disconnected';
            
            if (error) {
                // Connection error
                this.disconnectReason = 'error';
                this.notifyConnectionStatus('Connection Error', 'error');
            } else if (!navigator.onLine) {
                // Network offline
                this.disconnectReason = 'offline';
                this.notifyConnectionStatus('No Internet Connection', 'error');
            } else if (document.visibilityState === 'hidden') {
                // Tab/browser closed or in background
                this.disconnectReason = 'hidden';
                this.notifyConnectionStatus('Connection Closed', 'error');
            } else {
                // Other disconnection
                this.disconnectReason = 'unknown';
                this.notifyConnectionStatus('Connection Lost', 'error');
            }

            this.handleConnectionLoss();
        });
    }

    setupMessageHandlers() {
        this.connection.on("ReceiveNewName", (name) => {
            console.log("Received new name:", name);
            if (this.callbacks.onNameReceived) {
                // Add message to pending if we're not connected
                if (this.connectionState !== 'connected') {
                    this._pendingMessages.add(name);
                    return;
                }
                this.callbacks.onNameReceived(name);
            }
        });

        this.connection.on("Connected", (message) => {
            console.log("Hub message:", message);
            // Process any pending messages
            this._pendingMessages.forEach(name => {
                if (this.callbacks.onNameReceived) {
                    this.callbacks.onNameReceived(name);
                }
            });
            this._pendingMessages.clear();
        });
    }

    setupPageLifecycle() {
        // Handle page freeze/resume events if supported
        if ('onfreeze' in document) {
            document.addEventListener('freeze', () => {
                console.log('Page frozen');
                this.handlePageFreeze();
            });
            
            document.addEventListener('resume', () => {
                console.log('Page resumed');
                this.handlePageResume();
            });
        }

        // Start keep-alive monitoring
        this.startKeepAliveMonitor();
    }

    startKeepAliveMonitor() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }

        this.keepAliveInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastKeepAlive = now - this.lastKeepAlive;

            if (timeSinceLastKeepAlive > 20000) { // 20 seconds threshold
                console.log('Keep-alive timeout detected');
                this.handleKeepAliveTimeout();
            }
        }, 5000); // Check every 5 seconds
    }

    handleKeepAliveTimeout() {
        if (this.connectionState === 'connected') {
            console.log('Connection may be stale, attempting to reconnect...');
            this.connection.stop()
                .then(() => {
                    // Just restart the existing connection
                    this.startConnection();
                })
                .catch(err => console.error('Error during keep-alive reconnect:', err));
        }
    }

    handlePageFreeze() {
        // Page is being frozen (tab sleeping)
        this.disconnectReason = 'frozen';
        // Don't disconnect, let SignalR handle keep-alive
    }

    handlePageResume() {
        if (this.disconnectReason === 'frozen') {
            this.disconnectReason = null;
            // Check connection state and reconnect if needed
            if (this.connectionState !== 'connected') {
                this.startConnection();
            }
        }
    }

    handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            console.log('Page became visible, checking connection...');
            this.lastKeepAlive = Date.now(); // Reset keep-alive timer
            if (this.connectionState !== 'connected') {
                this.startConnection();
            }
        } else if (document.visibilityState === 'hidden') {
            console.log('Page hidden');
            // Let SignalR handle keep-alive while hidden
        }
    }

    handleConnectionLoss() {
        if (this.connectionState === 'disconnected' && navigator.onLine) {
            if (this.disconnectReason === 'error' || this.disconnectReason === 'unknown') {
                // Try to reconnect for connection errors
                setTimeout(() => this.startConnection(), 5000);
            }
            // Don't reconnect for 'hidden' or intentional disconnects
        }
    }

    handleOnlineStatus(isOnline) {
        console.log('Online status changed:', isOnline);
        if (isOnline) {
            this.startConnection();
        } else {
            this.connectionState = 'disconnected';
            this.notifyConnectionStatus('No Internet Connection', 'error');
        }
    }

    startConnection() {
        if (!this.connection) {
            console.error('Connection not initialized');
            return;
        }

        this.notifyConnectionStatus('Connecting...', 'warning');
        this.lastKeepAlive = Date.now();
        
        // Reuse existing connection object
        this.connection.start()
            .then(() => {
                console.log("SignalR Connected");
                this.connectionState = 'connected';
                this.notifyConnectionStatus('Connected', 'success');
            })
            .catch(err => {
                console.error("SignalR Connection Error: ", err);
                this.connectionState = 'disconnected';
                this.notifyConnectionStatus('Connection Failed', 'error');
                this.handleConnectionLoss();
            });
    }

    notifyConnectionStatus(status, type) {
        console.log(`Connection status update: ${status} (${type})`);
        if (this.callbacks.onConnectionStatusChanged) {
            this.callbacks.onConnectionStatusChanged(status, type);
        }
    }

    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    // Clean up when service is destroyed
    cleanup() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }
        if (this.connection) {
            this.connection.stop();
            // Don't null out the connection - it can be reused
        }
    }
}

// Create global instance only if needed
if (document.getElementById('connectionStatus')) {
    window.signalRService = new SignalRService();
} 