// main.js — Game loop + state management
// This is the conductor — it tells everything else when to play

const Game = {
    canvas: null,
    ctx: null,
    lastTime: 0,
    time: 0,

    // Game state machine
    state: 'garage',    // 'garage', 'countdown', 'racing', 'finished'

    // Race state
    currentLap: 1,
    totalLaps: 3,
    raceTime: 0,
    lapTimes: [],
    lapStartTime: 0,
    totalTime: 0,
    isNewBest: false,
    trackName: '',
    countdown: 0,

    // Selected car/track
    selectedCar: null,
    selectedTrack: null,

    init() {
        // Create canvas
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Set canvas size
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Initialize systems
        Input.init();
        Renderer.init(this.canvas);
        Garage.init();

        // Start the game loop!
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
        // Fill the window but maintain aspect ratio
        const targetW = 960;
        const targetH = 600;
        const scaleX = window.innerWidth / targetW;
        const scaleY = window.innerHeight / targetH;
        const scale = Math.min(scaleX, scaleY);

        this.canvas.width = targetW;
        this.canvas.height = targetH;
        this.canvas.style.width = `${targetW * scale}px`;
        this.canvas.style.height = `${targetH * scale}px`;
    },

    loop(timestamp) {
        // Calculate delta time (time since last frame)
        const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000);
        this.lastTime = timestamp;
        this.time += dt;

        // Update + render based on current state
        switch (this.state) {
            case 'garage':
                this.updateGarage(dt);
                break;
            case 'countdown':
                this.updateCountdown(dt);
                break;
            case 'racing':
                this.updateRacing(dt);
                break;
            case 'finished':
                this.updateFinished(dt);
                break;
        }

        // Keep the loop going!
        requestAnimationFrame((t) => this.loop(t));
    },

    // === GARAGE STATE ===
    updateGarage(dt) {
        const selection = Garage.update(dt, Input);
        if (selection) {
            this.startRace(selection.car, selection.track);
        }
        Garage.draw(this.ctx, this.canvas, this.time);
    },

    // === START RACE ===
    startRace(carDef, trackDef) {
        this.selectedCar = carDef;
        this.selectedTrack = trackDef;

        // Build the road from track definition
        Road.build(trackDef);

        // Initialize the car with selected stats
        Car.init(carDef, trackDef.type);

        // Reset race state
        this.currentLap = 1;
        this.totalLaps = trackDef.laps;
        this.raceTime = 0;
        this.lapTimes = [];
        this.lapStartTime = 0;
        this.totalTime = 0;
        this.isNewBest = false;
        this.trackName = trackDef.name;
        this.countdown = 3.5; // 3... 2... 1... GO!

        // Reset particles
        Particles.particles = [];
        Particles.active = false;

        this.state = 'countdown';
    },

    // === COUNTDOWN STATE ===
    updateCountdown(dt) {
        this.countdown -= dt;

        // Still render the road and car during countdown
        Renderer.render(Road, Car, this.time);
        Renderer.drawCar(this.ctx, Car, this.canvas.width, this.canvas.height, this.time);
        HUD.draw(this.ctx, Car, this, this.canvas);

        if (this.countdown <= -0.5) {
            this.state = 'racing';
        }
    },

    // === RACING STATE ===
    updateRacing(dt) {
        // Update car physics
        const completedLap = Car.update(dt, Road, Input);

        // Check for collisions
        const collision = Collision.check(Car, Road, this.canvas);
        if (collision) {
            Car.crash(collision.severity);
            if (collision.severity === 'explode') {
                Particles.spawn(
                    this.canvas.width / 2,
                    this.canvas.height - 100,
                    this.selectedCar
                );
            }
        }

        // Update particles
        Particles.update(dt);

        // Track time (pauses during crashes)
        if (!Car.crashed) {
            this.raceTime += dt;
        }

        // Lap completion
        if (completedLap) {
            const lapTime = this.raceTime - this.lapStartTime;
            this.lapTimes.push(lapTime);
            this.lapStartTime = this.raceTime;
            this.currentLap++;

            if (this.currentLap > this.totalLaps) {
                this.finishRace();
                return;
            }
        }

        // Render everything
        Renderer.render(Road, Car, this.time);
        Renderer.drawCar(this.ctx, Car, this.canvas.width, this.canvas.height, this.time);
        Particles.draw(this.ctx);
        HUD.draw(this.ctx, Car, this, this.canvas);
    },

    // === FINISH RACE ===
    finishRace() {
        this.state = 'finished';
        this.totalTime = this.raceTime;

        // Check for best time
        const key = `best_${this.selectedCar.id}_${this.selectedTrack.id}`;
        const prevBest = localStorage.getItem(key);

        if (!prevBest || this.totalTime < parseFloat(prevBest)) {
            localStorage.setItem(key, this.totalTime.toString());
            this.isNewBest = true;
        }
    },

    // === FINISHED STATE ===
    updateFinished(dt) {
        // Render the scene frozen
        Renderer.render(Road, Car, this.time);
        Renderer.drawCar(this.ctx, Car, this.canvas.width, this.canvas.height, this.time);
        HUD.draw(this.ctx, Car, this, this.canvas);

        // Wait for ENTER to go back to garage
        if (Input.enter) {
            this.state = 'garage';
            Garage.init();
            Input.keys = {}; // Clear input to prevent instant selection
        }
    },
};

// === LAUNCH! ===
window.addEventListener('load', () => {
    Game.init();
});
