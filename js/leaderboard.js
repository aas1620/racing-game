// leaderboard.js — Save times with player names
// Stores race results in localStorage with name + timestamp

const Leaderboard = {
    STORAGE_KEY: 'hotwheels_leaderboard',
    lastPlayerName: '',

    // Get all saved times
    getAll() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    // Get times for a specific track (optionally filtered by car)
    getForTrack(trackId, carId) {
        const all = this.getAll();
        let filtered = all.filter(e => e.trackId === trackId);
        if (carId) {
            filtered = filtered.filter(e => e.carId === carId);
        }
        return filtered.sort((a, b) => a.time - b.time);
    },

    // Save a new time
    save(entry) {
        const all = this.getAll();
        all.push(entry);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));
        this.lastPlayerName = entry.name;
    },

    // Format time as M:SS.CC
    formatTime(t) {
        const mins = Math.floor(t / 60);
        const secs = Math.floor(t % 60);
        const ms = Math.floor((t % 1) * 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    },

    // Format a date nicely
    formatDate(ts) {
        const d = new Date(ts);
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const hour = d.getHours().toString().padStart(2, '0');
        const min = d.getMinutes().toString().padStart(2, '0');
        return `${month}/${day} ${hour}:${min}`;
    },

    // Show the save overlay
    showSaveUI(gameState, callback) {
        const overlay = document.getElementById('saveOverlay');
        const nameInput = document.getElementById('playerName');
        const timeDisplay = document.getElementById('saveTimeDisplay');
        const trackInfo = document.getElementById('saveTrackInfo');
        const saveBtn = document.getElementById('saveBtn');
        const skipBtn = document.getElementById('skipBtn');

        // Fill in the details
        timeDisplay.textContent = this.formatTime(gameState.totalTime);
        trackInfo.textContent = `${gameState.selectedCar.name} on ${gameState.selectedTrack.name}`;

        // Pre-fill with last used name
        nameInput.value = this.lastPlayerName;

        // Show it
        overlay.style.display = 'flex';

        // Focus the input
        setTimeout(() => nameInput.focus(), 100);

        // Clean up old listeners
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        const newSkipBtn = skipBtn.cloneNode(true);
        skipBtn.parentNode.replaceChild(newSkipBtn, skipBtn);

        // Re-apply hover styles
        newSaveBtn.onmouseover = function() { this.style.background = '#ff8833'; };
        newSaveBtn.onmouseout = function() { this.style.background = '#ff6600'; };
        newSkipBtn.onmouseover = function() { this.style.background = '#444'; };
        newSkipBtn.onmouseout = function() { this.style.background = '#333'; };

        const doSave = () => {
            const name = nameInput.value.trim() || 'Anonymous';
            this.save({
                name: name,
                time: gameState.totalTime,
                lapTimes: gameState.lapTimes,
                carId: gameState.selectedCar.id,
                carName: gameState.selectedCar.name,
                trackId: gameState.selectedTrack.id,
                trackName: gameState.selectedTrack.name,
                bumpers: Car.bumpers,
                timestamp: Date.now(),
            });
            overlay.style.display = 'none';
            callback();
        };

        const doSkip = () => {
            overlay.style.display = 'none';
            callback();
        };

        newSaveBtn.addEventListener('click', doSave);
        newSkipBtn.addEventListener('click', doSkip);

        // Enter key saves
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSave();
            if (e.key === 'Escape') doSkip();
            e.stopPropagation(); // Don't let game input see these keys
        });

        // Stop all keyboard events from reaching the game while overlay is open
        nameInput.addEventListener('keyup', (e) => e.stopPropagation());
    },
};
