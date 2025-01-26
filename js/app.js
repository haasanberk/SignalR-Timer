function initializeApp(config) {
    let timeLeft = config.initialTime;
    let timerId = null;

    const timerElement = document.getElementById('timer');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resumeBtn = document.getElementById('resumeBtn');

    function updateTimer() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerElement.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft > 0) {
            timeLeft--;
        } else {
            clearInterval(timerId);
        }
    }

    function startTimer() {
        if (timerId === null) {
            timerId = setInterval(updateTimer, 1000);
        }
    }

    function stopTimer() {
        if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
        }
    }

    function resumeTimer() {
        if (timerId === null) {
            timerId = setInterval(updateTimer, 1000);
        }
    }

    startBtn.addEventListener('click', startTimer);
    stopBtn.addEventListener('click', stopTimer);
    resumeBtn.addEventListener('click', resumeTimer);

    // Automatically start the timer when the page loads
    startTimer();
}