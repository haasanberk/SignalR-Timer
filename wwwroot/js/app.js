// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    const connectionStatusElement = document.getElementById('connectionStatus');
    
    // Initialize timer state
    window.timerState = {
        isRunning: false,
        currentTime: 0
    };

    // Initialize SignalR service with callbacks
    window.signalRService.setCallbacks({
        onNameReceived: (name) => {
            const nameElement = document.getElementById("randomName");
            nameElement.style.opacity = "0";
            setTimeout(() => {
                nameElement.textContent = name;
                nameElement.style.opacity = "1";
            }, 200);
        },
        onConnectionStatusChanged: (status, type) => {
            const element = document.getElementById('connectionStatus');
            element.textContent = `Connection: ${status}`;
            element.className = `connection-status ${type}`;
        }
    });

    // Initialize SignalR
    window.signalRService.initialize();

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
                // Wait for the service worker to be ready
                return navigator.serviceWorker.ready;
            })
            .then(() => {
                // Add button click handlers only after service worker is ready
                setupTimerControls();
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed: ', err);
            });
    }

    function setupTimerControls() {
        // Timer control functions
        function startTimer() {
            const seconds = document.getElementById('seconds').value;
            if (seconds > 0 && navigator.serviceWorker.controller) {
                window.timerState.isRunning = true;
                navigator.serviceWorker.controller.postMessage({
                    type: 'start',
                    duration: seconds
                });
            }
        }

        function stopTimer() {
            if (navigator.serviceWorker.controller) {
                window.timerState.isRunning = false;
                navigator.serviceWorker.controller.postMessage({
                    type: 'stop'
                });
            }
        }

        function resumeTimer() {
            if (!window.timerState.isRunning && window.timerState.currentTime > 0 && navigator.serviceWorker.controller) {
                window.timerState.isRunning = true;
                navigator.serviceWorker.controller.postMessage({
                    type: 'resume',
                    timeLeft: window.timerState.currentTime
                });
            }
        }

        // Make timer controls globally available
        window.timerControls = {
            start: startTimer,
            stop: stopTimer,
            resume: resumeTimer
        };

        // Add button click handlers
        document.getElementById('startBtn').addEventListener('click', startTimer);
        document.getElementById('stopBtn').addEventListener('click', stopTimer);
        document.getElementById('resumeBtn').addEventListener('click', resumeTimer);
    }

    // Update timer display
    function updateDisplay(seconds) {
        document.getElementById('timer').textContent = seconds;
        window.timerState.currentTime = seconds;
    }

    // Listen for service worker messages
    navigator.serviceWorker.addEventListener('message', function(event) {
        if (event.data.type === 'tick') {
            updateDisplay(event.data.timeLeft);
            window.timerState.isRunning = true;
        } else if (event.data.type === 'stopped') {
            window.timerState.isRunning = false;
            updateDisplay(event.data.timeLeft || window.timerState.currentTime);
        }
    });

    // Add visibility change handler
    document.addEventListener('visibilitychange', () => {
        window.signalRService.handleVisibilityChange();
    });

    // Add CSS for animation
    const style = document.createElement('style');
    style.textContent = `
        #randomName {
            transition: opacity 0.2s ease-in-out;
        }
    `;
    document.head.appendChild(style);
});

function initializeApp(config) {
    const connectionStatusElement = config.enableSignalR ? document.getElementById('connectionStatus') : null;
    
    // Initialize timer state with initial time
    window.timerState = {
        isRunning: false,
        currentTime: config.initialTime
    };

    if (config.enableSignalR) {
        // Initialize SignalR service with callbacks
        window.signalRService.setCallbacks({
            onNameReceived: (name) => {
                const nameElement = document.getElementById("randomName");
                nameElement.style.opacity = "0";
                setTimeout(() => {
                    nameElement.textContent = name;
                    nameElement.style.opacity = "1";
                }, 200);
            },
            onConnectionStatusChanged: (status, type) => {
                const element = document.getElementById('connectionStatus');
                element.textContent = `Connection: ${status}`;
                element.className = `connection-status ${type}`;
            }
        });

        window.signalRService.initialize();
    }

    // Register service worker and initialize timer
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
                return navigator.serviceWorker.ready;
            })
            .then(() => {
                setupTimerControls(config.initialTime);
                // Start timer immediately if needed
                if (config.initialTime > 0) {
                    startTimer(config.initialTime);
                }
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed: ', err);
            });
    }
}

function setupTimerControls(initialTime) {
    // Update initial display
    const timerDisplay = document.getElementById('timer');
    const secondsInput = document.getElementById('seconds');
    
    timerDisplay.textContent = initialTime;
    secondsInput.value = initialTime;

    function startTimer(duration) {
        if (duration > 0 && navigator.serviceWorker.controller) {
            window.timerState.isRunning = true;
            navigator.serviceWorker.controller.postMessage({
                type: 'start',
                duration: duration
            });
        }
    }

    function stopTimer() {
        if (navigator.serviceWorker.controller) {
            window.timerState.isRunning = false;
            navigator.serviceWorker.controller.postMessage({
                type: 'stop'
            });
        }
    }

    function resumeTimer() {
        if (!window.timerState.isRunning && window.timerState.currentTime > 0 && navigator.serviceWorker.controller) {
            window.timerState.isRunning = true;
            navigator.serviceWorker.controller.postMessage({
                type: 'resume',
                timeLeft: window.timerState.currentTime
            });
        }
    }

    // Add button click handlers
    document.getElementById('startBtn').addEventListener('click', () => {
        const seconds = document.getElementById('seconds').value;
        startTimer(seconds);
    });
    document.getElementById('stopBtn').addEventListener('click', stopTimer);
    document.getElementById('resumeBtn').addEventListener('click', resumeTimer);

    // Start timer with initial value if provided
    if (initialTime > 0) {
        startTimer(initialTime);
    }
}

// Update timer display
function updateDisplay(seconds) {
    document.getElementById('timer').textContent = seconds;
    window.timerState.currentTime = seconds;
}

// Listen for service worker messages
navigator.serviceWorker.addEventListener('message', function(event) {
    if (event.data.type === 'tick') {
        updateDisplay(event.data.timeLeft);
        window.timerState.isRunning = true;
    } else if (event.data.type === 'stopped') {
        window.timerState.isRunning = false;
        updateDisplay(event.data.timeLeft || window.timerState.currentTime);
    }
}); 