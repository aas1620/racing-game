// hud.js — Heads-Up Display
// Draws speedometer, timer, lap counter, and other info on screen

const HUD = {
    draw(ctx, car, gameState, canvas) {
        const w = canvas.width;
        const h = canvas.height;

        // === SPEEDOMETER (bottom right) ===
        this.drawSpeedometer(ctx, w - 150, h - 80, car.speedMPH);

        // === LAP COUNTER (top right) ===
        if (gameState.state === 'racing' || gameState.state === 'finished') {
            this.drawLapCounter(ctx, w - 20, 20, gameState.currentLap, gameState.totalLaps);
        }

        // === TIMER (top center) ===
        if (gameState.state === 'racing') {
            this.drawTimer(ctx, w / 2, 30, gameState.raceTime);
        }

        // === LAP TIMES (top left) ===
        if (gameState.lapTimes.length > 0) {
            this.drawLapTimes(ctx, 20, 20, gameState.lapTimes);
        }

        // === COUNTDOWN ===
        if (gameState.state === 'countdown') {
            this.drawCountdown(ctx, w / 2, h / 2 - 50, gameState.countdown);
        }

        // === RACE FINISH ===
        if (gameState.state === 'finished') {
            this.drawFinish(ctx, w / 2, h / 2, gameState);
        }

        // === TRACK NAME (briefly at start) ===
        if (gameState.raceTime < 3 && gameState.state === 'racing') {
            const alpha = 1 - gameState.raceTime / 3;
            this.drawTrackName(ctx, w / 2, h / 2 - 100, gameState.trackName, alpha);
        }

        // === CAR NAME (bottom left) ===
        if (car.stats) {
            ctx.font = 'bold 14px monospace';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'left';
            ctx.fillText(car.stats.name, 20, h - 20);
        }
    },

    drawSpeedometer(ctx, x, y, mph) {
        // Digital-style speed readout
        ctx.font = 'bold 48px monospace';
        ctx.fillStyle = mph > 150 ? '#ff4444' : '#ffffff';
        ctx.textAlign = 'right';
        ctx.fillText(mph, x + 60, y);
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#aaa';
        ctx.fillText('MPH', x + 60, y + 20);
    },

    drawLapCounter(ctx, x, y, current, total) {
        ctx.font = 'bold 24px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'right';
        ctx.fillText(`LAP ${Math.min(current, total)}/${total}`, x, y + 20);
    },

    drawTimer(ctx, x, y, time) {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        const ms = Math.floor((time % 1) * 100);
        const timeStr = `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;

        ctx.font = 'bold 28px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, x, y + 20);
    },

    drawLapTimes(ctx, x, y, lapTimes) {
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        for (let i = 0; i < lapTimes.length; i++) {
            const t = lapTimes[i];
            const mins = Math.floor(t / 60);
            const secs = Math.floor(t % 60);
            const ms = Math.floor((t % 1) * 100);
            const str = `L${i + 1}: ${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;

            // Highlight best lap
            const isBest = t === Math.min(...lapTimes);
            ctx.fillStyle = isBest ? '#f1c40f' : '#aaa';
            ctx.fillText(str, x, y + 18 + i * 20);
        }
    },

    drawCountdown(ctx, x, y, value) {
        const num = Math.ceil(value);
        const scale = 1 + (value % 1) * 0.5;

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        ctx.font = 'bold 80px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (num <= 0) {
            ctx.fillStyle = '#2ecc71';
            ctx.fillText('GO!', 0, 0);
        } else {
            ctx.fillStyle = num === 1 ? '#e74c3c' : num === 2 ? '#f39c12' : '#ffffff';
            ctx.fillText(num, 0, 0);
        }

        ctx.restore();
    },

    drawFinish(ctx, x, y, gameState) {
        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // FINISH text
        ctx.font = 'bold 60px monospace';
        ctx.fillStyle = '#f1c40f';
        ctx.textAlign = 'center';
        ctx.fillText('FINISH!', x, y - 40);

        // Total time
        const t = gameState.totalTime;
        const mins = Math.floor(t / 60);
        const secs = Math.floor(t % 60);
        const ms = Math.floor((t % 1) * 100);
        ctx.font = 'bold 36px monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`, x, y + 20);

        // Best time notification
        if (gameState.isNewBest) {
            ctx.font = 'bold 24px monospace';
            ctx.fillStyle = '#2ecc71';
            ctx.fillText('NEW BEST TIME!', x, y + 60);
        }

        // Instructions
        ctx.font = '18px monospace';
        ctx.fillStyle = '#aaa';
        ctx.fillText('Press ENTER to continue', x, y + 110);
    },

    drawTrackName(ctx, x, y, name, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 32px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(name, x, y);
        ctx.restore();
    },
};
