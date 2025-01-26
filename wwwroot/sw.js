let timerInterval = null;
let timeLeft = 0;
let isPaused = false;

self.addEventListener('message', function(event) {
    if (event.data.type === 'start') {
        // Clear existing timer if any
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        
        timeLeft = parseInt(event.data.duration);
        startCountdown();
    }
    else if (event.data.type === 'stop') {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
            isPaused = true;
            notifyClients('stopped');
        }
    }
    else if (event.data.type === 'resume') {
        if (isPaused) {
            timeLeft = event.data.timeLeft;
            startCountdown();
            isPaused = false;
        }
    }
});

function startCountdown() {
    timerInterval = setInterval(() => {
        timeLeft--;
        
        notifyClients('tick');
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            notifyClients('stopped');
        }
    }, 1000);
}

function notifyClients(type) {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: type,
                timeLeft: timeLeft
            });
        });
    });
}

// Ensure the service worker stays active
self.addEventListener('install', event => {
    console.log('Service Worker installing.');
    // Perform install steps
});

self.addEventListener('activate', event => {
    console.log('Service Worker activating.');
    // Perform activate steps
});

self.addEventListener('fetch', event => {
    console.log('Fetching:', event.request.url);
    // You can add caching logic here
}); 