class SignalRService {
    constructor() {
        this.connection = null;
        this.callbacks = {};
        this.connectionState = 'disconnected';
        this._pendingMessages = new Set(); // Track pending messages
        this.disconnectReason = null;
        this.keepAliveInterval = null;
        this.lastKeepAlive = Date.now();
        this.isEnabled = true;
        this.connectionTimeout = null;
        this.oldConnectionId = null;
        this.connectionStartTime = null; // Track when the connection was established
        this.totalConnectionTime = 180000; // 180 seconds
        this.retryInterval = null;
        this.pendingNameRequest = false; // Track if a name request is pending
        this.networkStatus = navigator.onLine; // Track network status
    }

    initialize() {
        if (this.connectionState === 'connected') {
            console.log('Already connected');
            return;
        }

        this.connection = new signalR.HubConnectionBuilder()
            .withUrl("/randomNameHub", {
                transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.ServerSentEvents | signalR.HttpTransportType.LongPolling
            })
            .configureLogging(signalR.LogLevel.Information)
            .withAutomaticReconnect({
                nextRetryDelayInMilliseconds: retryContext => {
                    // Retry every second, up to 10 times
                    const maxRetries = 10;
                    const delay = 1000; // 1 second
                    return retryContext.previousRetryCount < maxRetries ? delay : null;
                }
            })
            .build();

        this.connection.onreconnecting(error => {
            console.log('Reconnecting...', error);
            this.oldConnectionId = this.connection.connectionId;
            this.updateConnectionStatus('Reconnecting...', 'warning');
        });

        this.connection.onreconnected(async connectionId => {
            console.log('Reconnected:', connectionId);
            await this.notifyReconnection(this.oldConnectionId, connectionId);
            this.adjustConnectionTimeout(); // Adjust the timeout based on elapsed time
            this.updateConnectionStatus('Connected', 'success');
            if (this.pendingNameRequest) {
                this.sendNewName(); // Retry sending the name if it was pending
            }
        });

        this.connection.onclose(async () => {
            console.log('Connection closed. Attempting to reconnect...');
            this.oldConnectionId = this.connection.connectionId;
            this.updateConnectionStatus('Disconnected', 'error');
            await this.startConnection();
        });

        this.connection.on("ReceiveNewName", (name) => {
            console.log("Received new name:", name);
            this.updateName(name);
            this.pendingNameRequest = false; // Reset pending request flag
        });

        this.startConnection();

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

        // Monitor network status
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        // Start sending new names every 30 seconds
        this.startNameSending();
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
            this.processPendingMessages();
        });

        this.connection.onclose(async () => {
            console.log("Connection closed. Attempting to reconnect...");
            await this.startConnection();
        });
    }

    setupMessageHandlers() {
        this.connection.on("ReceiveNewName", (name) => {
            console.log("Received new name:", name);
            if (this.callbacks.onNameReceived) {
                if (this.connectionState !== 'connected') {
                    this._pendingMessages.add(name);
                    return;
                }
                this.callbacks.onNameReceived(name);
            }
        });

        this.connection.on("SpecialMessage", (message) => {
            console.log("Received special message:", message);
            this.cleanup(); // Close connection after receiving this message
        });
    }

    processPendingMessages() {
        this._pendingMessages.forEach(name => {
            if (this.callbacks.onNameReceived) {
                this.callbacks.onNameReceived(name);
            }
        });
        this._pendingMessages.clear();
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
        } else {
            console.log('Page hidden');
            // Optionally, you can pause certain activities or reduce resource usage
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

    handleOnline() {
        console.log('Network is online');
        if (this.connectionState !== 'connected') {
            this.startConnection();
        }
    }

    handleOffline() {
        console.log('Network is offline');
        this.updateConnectionStatus('Offline', 'error');
    }

    async startConnection() {
        try {
            await this.connection.start();
            console.log('SignalR Connected');
            this.connectionState = 'connected';
            this.updateConnectionStatus('Connected', 'success');

            this.connectionStartTime = Date.now();

            const connectionId = await this.connection.invoke("NotifyConnectionEstablished");
            console.log('Connection ID:', connectionId);

            this.startConnectionTimeout();
        } catch (err) {
            console.error('Connection failed:', err);
            this.connectionState = 'disconnected';
            this.updateConnectionStatus('Connection Failed', 'error');
            setTimeout(() => this.startConnection(), 2000); // Retry more frequently
        }
    }

    adjustConnectionTimeout() {
        const elapsedTime = Date.now() - this.connectionStartTime;
        const remainingTime = this.totalConnectionTime - elapsedTime;

        if (remainingTime > 0) {
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
            }
            this.connectionTimeout = setTimeout(() => {
                console.log('Adjusted connection timeout reached, closing connection.');
                this.cleanup();
            }, remainingTime);
        } else {
            console.log('No remaining time, closing connection immediately.');
            this.cleanup();
        }
    }

    async notifyReconnection(oldConnectionId, newConnectionId) {
        try {
            await this.connection.invoke("NotifyReconnection", oldConnectionId, newConnectionId);
            console.log(`Notified server of reconnection: old ID = ${oldConnectionId}, new ID = ${newConnectionId}`);
        } catch (err) {
            console.error('Error notifying reconnection:', err);
        }
    }

    notifyDisconnection() {
        if (this.connectionState === 'connected') {
            this.connection.invoke("NotifyDisconnection", this.connection.connectionId)
                .catch(err => console.error('Error notifying disconnection:', err));
        }
    }

    startConnectionTimeout() {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
        }
        this.connectionTimeout = setTimeout(() => {
            console.log('Connection timeout reached, closing connection.');
            this.cleanup();
        }, this.totalConnectionTime);
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
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
        }
        if (this.retryInterval) {
            clearInterval(this.retryInterval);
        }
    }

    startNameSending() {
        this.retryInterval = setInterval(() => {
            if (this.connectionState === 'connected') {
                this.sendNewName();
            }
        }, 30000); // 30 seconds
    }

    async sendNewName() {
        try {
            this.pendingNameRequest = true; // Set pending request flag
            await this.connection.invoke("SendNewName");
        } catch (err) {
            console.error('Error sending new name:', err);
            this.pendingNameRequest = false; // Reset pending request flag if failed
        }
    }

    updateImage(name) {
        // Implement logic to update the image based on the new name
        const imageElement = document.getElementById('imageElementId'); // Replace with your image element ID
        if (imageElement) {
            imageElement.src = `/images/${name}.png`; // Example: change image source
        }
    }

    updateConnectionStatus(status, type) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `connection-status ${type}`;
        }
    }

    updateName(name) {
        const nameElement = document.getElementById('randomName');
        if (nameElement) {
            nameElement.textContent = name;
        }
    }
}

// Create global instance
window.signalRService = new SignalRService(); 