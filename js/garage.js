// garage.js — Car selection and track selection screens
// The menu system where you pick your ride and your track

const Garage = {
    state: 'car',           // 'car' or 'track'
    selectedCar: 0,
    selectedTrack: 0,
    inputCooldown: 0,       // Prevent super-fast scrolling
    bumpers: true,          // Bumpers mode default ON

    init() {
        this.state = 'car';
        this.selectedCar = 0;
        this.selectedTrack = 0;
        this.inputCooldown = 0.4; // Brief cooldown to prevent accidental selection
    },

    update(dt, input) {
        this.inputCooldown -= dt;
        if (this.inputCooldown > 0) return null;

        if (this.state === 'car') {
            if (input.left) {
                this.selectedCar = (this.selectedCar - 1 + Cars.length) % Cars.length;
                this.inputCooldown = 0.2;
            }
            if (input.right) {
                this.selectedCar = (this.selectedCar + 1) % Cars.length;
                this.inputCooldown = 0.2;
            }
            if (input.enter || input.space) {
                this.state = 'track';
                this.inputCooldown = 0.3;
            }
        } else if (this.state === 'track') {
            if (input.left) {
                this.selectedTrack = (this.selectedTrack - 1 + Tracks.length) % Tracks.length;
                this.inputCooldown = 0.2;
            }
            if (input.right) {
                this.selectedTrack = (this.selectedTrack + 1) % Tracks.length;
                this.inputCooldown = 0.2;
            }
            if (input.isPressed('b') || input.isPressed('B')) {
                this.bumpers = !this.bumpers;
                this.inputCooldown = 0.3;
            }
            if (input.escape) {
                this.state = 'car';
                this.inputCooldown = 0.3;
            }
            if (input.enter || input.space) {
                this.inputCooldown = 0.3;
                return {
                    car: Cars[this.selectedCar],
                    track: Tracks[this.selectedTrack],
                    bumpers: this.bumpers,
                };
            }
        }

        return null;
    },

    draw(ctx, canvas, time) {
        const w = canvas.width;
        const h = canvas.height;

        // Background
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, w, h);

        // Animated diagonal stripes
        ctx.save();
        ctx.globalAlpha = 0.03;
        for (let i = -w; i < w * 2; i += 60) {
            ctx.fillStyle = '#ff6600';
            ctx.beginPath();
            ctx.moveTo(i + Math.sin(time) * 20, 0);
            ctx.lineTo(i + 30 + Math.sin(time) * 20, 0);
            ctx.lineTo(i - h + 30 + Math.sin(time) * 20, h);
            ctx.lineTo(i - h + Math.sin(time) * 20, h);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // Title
        ctx.font = 'bold 48px monospace';
        ctx.fillStyle = '#ff6600';
        ctx.textAlign = 'center';
        ctx.fillText('HOT WHEELS', w / 2, 60);
        ctx.font = 'bold 28px monospace';
        ctx.fillStyle = '#f39c12';
        ctx.fillText('RACING', w / 2, 95);

        if (this.state === 'car') {
            this.drawCarSelect(ctx, w, h, time);
        } else {
            this.drawTrackSelect(ctx, w, h, time);
        }
    },

    drawCarSelect(ctx, w, h, time) {
        ctx.font = 'bold 22px monospace';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('CHOOSE YOUR RIDE', w / 2, 140);

        const car = Cars[this.selectedCar];

        // Car preview (large centered car drawing)
        ctx.save();
        ctx.translate(w / 2, h / 2 - 30);
        ctx.scale(2.5, 2.5);
        Renderer.drawCarSprite(ctx, 0, 0, { tilt: 0, stats: car });
        ctx.restore();

        // Car name
        ctx.font = 'bold 30px monospace';
        ctx.fillStyle = car.bodyColor;
        ctx.textAlign = 'center';
        const namePulse = 1 + Math.sin(time * 3) * 0.02;
        ctx.save();
        ctx.translate(w / 2, h / 2 + 80);
        ctx.scale(namePulse, namePulse);
        ctx.fillText(car.name, 0, 0);
        ctx.restore();

        // Tagline
        ctx.font = '16px monospace';
        ctx.fillStyle = '#aaa';
        ctx.fillText(car.tagline, w / 2, h / 2 + 105);

        // Stats bars
        this.drawStatBars(ctx, w / 2 - 120, h / 2 + 130, car);

        // Navigation arrows
        ctx.font = 'bold 40px monospace';
        ctx.fillStyle = '#ff6600';
        ctx.textAlign = 'center';
        const arrowBounce = Math.sin(time * 4) * 5;
        ctx.fillText('<', 80 + arrowBounce, h / 2);
        ctx.fillText('>', w - 80 - arrowBounce, h / 2);

        // Car counter
        ctx.font = '14px monospace';
        ctx.fillStyle = '#666';
        ctx.fillText(`${this.selectedCar + 1} / ${Cars.length}`, w / 2, h - 60);

        // Instructions
        ctx.font = '16px monospace';
        ctx.fillStyle = '#888';
        ctx.fillText('< > to browse    ENTER to select', w / 2, h - 30);
    },

    drawStatBars(ctx, x, y, car) {
        const stats = [
            { name: 'SPEED', value: car.topSpeed, color: '#e74c3c' },
            { name: 'ACCEL', value: car.acceleration, color: '#f39c12' },
            { name: 'HANDLING', value: car.handling, color: '#2ecc71' },
            { name: 'OFF-ROAD', value: car.offRoad, color: '#9b59b6' },
        ];

        for (let i = 0; i < stats.length; i++) {
            const stat = stats[i];
            const sy = y + i * 28;

            // Label
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = '#888';
            ctx.textAlign = 'right';
            ctx.fillText(stat.name, x + 70, sy + 12);

            // Bar background
            ctx.fillStyle = '#222';
            ctx.fillRect(x + 80, sy, 160, 16);

            // Bar fill
            ctx.fillStyle = stat.color;
            ctx.fillRect(x + 80, sy, (stat.value / 10) * 160, 16);

            // Value number
            ctx.font = 'bold 12px monospace';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'left';
            ctx.fillText(stat.value, x + 250, sy + 12);
        }
    },

    drawTrackSelect(ctx, w, h, time) {
        ctx.font = 'bold 22px monospace';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('CHOOSE YOUR TRACK', w / 2, 140);

        const track = Tracks[this.selectedTrack];

        // Track preview — draw a mini road with the track's colors
        this.drawTrackPreview(ctx, w / 2, h / 2 - 30, track, time);

        // Track name
        ctx.font = 'bold 30px monospace';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(track.name, w / 2, h / 2 + 80);

        // Description
        ctx.font = '16px monospace';
        ctx.fillStyle = '#aaa';
        ctx.fillText(track.description, w / 2, h / 2 + 105);

        // Track info
        ctx.font = '14px monospace';
        ctx.fillStyle = '#888';
        ctx.fillText(`${track.laps} laps  |  ${track.type}`, w / 2, h / 2 + 130);

        // Leaderboard — top 3 times for this track
        const entries = Leaderboard.getForTrack(track.id);
        if (entries.length > 0) {
            ctx.font = 'bold 14px monospace';
            ctx.fillStyle = '#f1c40f';
            ctx.fillText('LEADERBOARD', w / 2, h / 2 + 150);
            ctx.font = '13px monospace';
            const top = entries.slice(0, 3);
            for (let i = 0; i < top.length; i++) {
                const e = top[i];
                const medal = i === 0 ? '1st' : i === 1 ? '2nd' : '3rd';
                const bumperTag = e.bumpers ? '' : ' *';
                ctx.fillStyle = i === 0 ? '#f1c40f' : '#aaa';
                ctx.fillText(
                    `${medal}  ${Leaderboard.formatTime(e.time)}  ${e.name}  (${e.carName})${bumperTag}`,
                    w / 2, h / 2 + 170 + i * 18
                );
            }
        }

        // Navigation arrows
        ctx.font = 'bold 40px monospace';
        ctx.fillStyle = '#ff6600';
        const arrowBounce = Math.sin(time * 4) * 5;
        ctx.fillText('<', 80 + arrowBounce, h / 2);
        ctx.fillText('>', w - 80 - arrowBounce, h / 2);

        // Bumpers toggle
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = this.bumpers ? '#2ecc71' : '#666';
        ctx.fillText(`BUMPERS: ${this.bumpers ? 'ON' : 'OFF'}   [B to toggle]`, w / 2, h - 55);

        // Instructions
        ctx.font = '16px monospace';
        ctx.fillStyle = '#888';
        ctx.fillText('< > to browse    ENTER to race    ESC to go back', w / 2, h - 30);
    },

    drawTrackPreview(ctx, cx, cy, track, time) {
        const colors = track.colors;
        const previewW = 300;
        const previewH = 180;
        const x = cx - previewW / 2;
        const y = cy - previewH / 2;

        // Sky
        const grad = ctx.createLinearGradient(x, y, x, y + previewH / 2);
        grad.addColorStop(0, colors.sky);
        grad.addColorStop(1, colors.skyHorizon);
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, previewW, previewH / 2);

        // Ground
        ctx.fillStyle = colors.grass;
        ctx.fillRect(x, y + previewH / 2, previewW, previewH / 2);

        // Mini road
        for (let i = 0; i < 20; i++) {
            const t = i / 20;
            const roadY = y + previewH / 2 + t * previewH / 2;
            const roadW = 30 + t * 80;
            const roadX = cx + Math.sin(t * 4 + time) * 30 * t;
            ctx.fillStyle = i % 2 === 0 ? colors.road : colors.roadLight;
            ctx.fillRect(roadX - roadW / 2, roadY, roadW, previewH / 20 + 1);
        }

        // Border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, previewW, previewH);
    },
};
