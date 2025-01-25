// Please see documentation at https://learn.microsoft.com/aspnet/core/client-side/bundling-and-minification
// for details on configuring this project to bundle and minify static web assets.

// Write your JavaScript code.

// Example of controlling timer from another file
function exampleControl() {
    // Start the timer
    window.timerControls.start();
    
    // Stop the timer
    window.timerControls.stop();
    
    // Resume the timer
    window.timerControls.resume();
    
    // Check timer state
    console.log('Is timer running:', window.timerState.isRunning);
    console.log('Current time:', window.timerState.currentTime);
}
