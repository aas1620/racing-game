// scenery.js — Roadside objects drawn per track theme
// Each scenery type is a function that draws at a given position and scale

const Scenery = {
    draw(ctx, type, x, y, scale, colors) {
        const s = scale;
        if (s < 0.005) return; // Too small to see

        switch (type) {
            // === MONACO ===
            case 'building':
                this.drawBuilding(ctx, x, y, s, colors);
                break;
            case 'palm':
                this.drawPalm(ctx, x, y, s);
                break;
            case 'barrier':
                this.drawBarrier(ctx, x, y, s);
                break;
            case 'lamppost':
                this.drawLamppost(ctx, x, y, s);
                break;

            // === MOUNTAIN ===
            case 'pine':
                this.drawPine(ctx, x, y, s);
                break;
            case 'rock':
                this.drawRock(ctx, x, y, s, '#888');
                break;
            case 'guardrail':
                this.drawGuardrail(ctx, x, y, s);
                break;
            case 'boulder':
                this.drawRock(ctx, x, y, s * 1.5, '#777');
                break;

            // === BAJA ===
            case 'cactus':
                this.drawCactus(ctx, x, y, s);
                break;
            case 'rock_desert':
                this.drawRock(ctx, x, y, s, '#c4713b');
                break;
            case 'tumbleweed':
                this.drawTumbleweed(ctx, x, y, s);
                break;
            case 'mesa':
                this.drawMesa(ctx, x, y, s);
                break;
        }
    },

    // === Drawing functions ===

    drawBuilding(ctx, x, y, s, colors) {
        const w = 120 * s;
        const h = 180 * s;
        // Building body
        const buildColors = ['#f5e6ca', '#e8d5b5', '#dcc8a0', '#c9b896'];
        const color = buildColors[Math.floor(Math.abs(x * 0.01)) % buildColors.length];
        ctx.fillStyle = color;
        ctx.fillRect(x - w / 2, y - h, w, h);
        // Windows
        ctx.fillStyle = '#5dade2';
        const winW = 15 * s;
        const winH = 20 * s;
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 3; col++) {
                ctx.fillRect(
                    x - w / 2 + 15 * s + col * 30 * s,
                    y - h + 20 * s + row * 40 * s,
                    winW, winH
                );
            }
        }
        // Roof line
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x - w / 2 - 5 * s, y - h - 5 * s, w + 10 * s, 8 * s);
    },

    drawPalm(ctx, x, y, s) {
        // Trunk
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = Math.max(1, 8 * s);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 10 * s, y - 80 * s, x + 5 * s, y - 140 * s);
        ctx.stroke();
        // Fronds
        ctx.fillStyle = '#27ae60';
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
            ctx.beginPath();
            ctx.ellipse(
                x + 5 * s + Math.cos(angle) * 25 * s,
                y - 140 * s + Math.sin(angle) * 15 * s,
                35 * s, 8 * s, angle, 0, Math.PI * 2
            );
            ctx.fill();
        }
    },

    drawBarrier(ctx, x, y, s) {
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(x - 15 * s, y - 20 * s, 30 * s, 20 * s);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 15 * s, y - 20 * s, 15 * s, 10 * s);
        ctx.fillRect(x, y - 10 * s, 15 * s, 10 * s);
    },

    drawLamppost(ctx, x, y, s) {
        ctx.strokeStyle = '#666';
        ctx.lineWidth = Math.max(1, 4 * s);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 150 * s);
        ctx.stroke();
        // Light
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(x, y - 155 * s, 8 * s, 0, Math.PI * 2);
        ctx.fill();
    },

    drawPine(ctx, x, y, s) {
        // Trunk
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(x - 5 * s, y - 30 * s, 10 * s, 30 * s);
        // Three layers of branches
        ctx.fillStyle = '#1B5E20';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(x, y - 150 * s + i * 30 * s);
            ctx.lineTo(x - 35 * s + i * 5 * s, y - 50 * s + i * 25 * s);
            ctx.lineTo(x + 35 * s - i * 5 * s, y - 50 * s + i * 25 * s);
            ctx.closePath();
            ctx.fill();
        }
    },

    drawRock(ctx, x, y, s, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x - 20 * s, y);
        ctx.lineTo(x - 25 * s, y - 15 * s);
        ctx.lineTo(x - 10 * s, y - 30 * s);
        ctx.lineTo(x + 10 * s, y - 28 * s);
        ctx.lineTo(x + 22 * s, y - 10 * s);
        ctx.lineTo(x + 18 * s, y);
        ctx.closePath();
        ctx.fill();
    },

    drawGuardrail(ctx, x, y, s) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(x - 20 * s, y - 15 * s, 40 * s, 5 * s);
        // Posts
        ctx.fillStyle = '#888';
        ctx.fillRect(x - 15 * s, y - 20 * s, 4 * s, 20 * s);
        ctx.fillRect(x + 11 * s, y - 20 * s, 4 * s, 20 * s);
    },

    drawCactus(ctx, x, y, s) {
        ctx.fillStyle = '#2d8a4e';
        // Main body
        ctx.fillRect(x - 8 * s, y - 80 * s, 16 * s, 80 * s);
        // Left arm
        ctx.fillRect(x - 30 * s, y - 60 * s, 22 * s, 12 * s);
        ctx.fillRect(x - 30 * s, y - 80 * s, 12 * s, 32 * s);
        // Right arm
        ctx.fillRect(x + 8 * s, y - 45 * s, 22 * s, 12 * s);
        ctx.fillRect(x + 18 * s, y - 70 * s, 12 * s, 37 * s);
    },

    drawTumbleweed(ctx, x, y, s) {
        ctx.strokeStyle = '#8B7355';
        ctx.lineWidth = Math.max(1, 2 * s);
        ctx.beginPath();
        ctx.arc(x, y - 12 * s, 12 * s, 0, Math.PI * 2);
        ctx.stroke();
        // Some inner lines for texture
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * 10 * s, y - 12 * s + Math.sin(a) * 10 * s);
            ctx.lineTo(x - Math.cos(a) * 10 * s, y - 12 * s - Math.sin(a) * 10 * s);
            ctx.stroke();
        }
    },

    drawMesa(ctx, x, y, s) {
        // Large flat-topped rock formation in background
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.moveTo(x - 80 * s, y);
        ctx.lineTo(x - 60 * s, y - 100 * s);
        ctx.lineTo(x - 40 * s, y - 120 * s);
        ctx.lineTo(x + 40 * s, y - 120 * s);
        ctx.lineTo(x + 60 * s, y - 100 * s);
        ctx.lineTo(x + 80 * s, y);
        ctx.closePath();
        ctx.fill();
        // Flat top
        ctx.fillStyle = '#a93226';
        ctx.fillRect(x - 40 * s, y - 125 * s, 80 * s, 8 * s);
    },

    // === HAZARD DRAWING ===
    drawHazard(ctx, type, x, y, scale, time) {
        const s = scale;
        if (s < 0.01) return;

        switch (type) {
            case 'pedestrian':
                this.drawPedestrian(ctx, x, y, s, time);
                break;
            case 'moose':
                this.drawMoose(ctx, x, y, s);
                break;
            case 'rattlesnake':
                this.drawRattlesnake(ctx, x, y, s, time);
                break;
        }
    },

    drawPedestrian(ctx, x, y, s, time) {
        // A confused-looking person
        const wobble = Math.sin(time * 3) * 5 * s;
        // Body
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(x - 8 * s + wobble, y - 40 * s, 16 * s, 25 * s);
        // Head
        ctx.fillStyle = '#f5cba7';
        ctx.beginPath();
        ctx.arc(x + wobble, y - 48 * s, 10 * s, 0, Math.PI * 2);
        ctx.fill();
        // Legs
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(x - 6 * s + wobble, y - 15 * s, 5 * s, 15 * s);
        ctx.fillRect(x + 1 * s + wobble, y - 15 * s, 5 * s, 15 * s);
    },

    drawMoose(ctx, x, y, s) {
        // A moose, looking completely unbothered
        // Body
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(x - 30 * s, y - 50 * s, 60 * s, 30 * s);
        // Legs
        ctx.fillRect(x - 25 * s, y - 20 * s, 8 * s, 20 * s);
        ctx.fillRect(x - 5 * s, y - 20 * s, 8 * s, 20 * s);
        ctx.fillRect(x + 8 * s, y - 20 * s, 8 * s, 20 * s);
        ctx.fillRect(x + 20 * s, y - 20 * s, 8 * s, 20 * s);
        // Head
        ctx.fillRect(x + 25 * s, y - 60 * s, 20 * s, 20 * s);
        // Antlers
        ctx.strokeStyle = '#795548';
        ctx.lineWidth = Math.max(1, 3 * s);
        ctx.beginPath();
        ctx.moveTo(x + 30 * s, y - 60 * s);
        ctx.lineTo(x + 25 * s, y - 80 * s);
        ctx.lineTo(x + 15 * s, y - 75 * s);
        ctx.moveTo(x + 40 * s, y - 60 * s);
        ctx.lineTo(x + 45 * s, y - 80 * s);
        ctx.lineTo(x + 55 * s, y - 75 * s);
        ctx.stroke();
    },

    drawRattlesnake(ctx, x, y, s, time) {
        // A slithering snake
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = Math.max(1, 6 * s);
        ctx.beginPath();
        ctx.moveTo(x - 20 * s, y - 3 * s);
        for (let i = 0; i < 8; i++) {
            const sx = x - 20 * s + i * 6 * s;
            const sy = y - 3 * s + Math.sin(i + time * 5) * 4 * s;
            ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        // Head
        ctx.fillStyle = '#8B6914';
        ctx.beginPath();
        ctx.arc(x + 28 * s, y - 3 * s, 4 * s, 0, Math.PI * 2);
        ctx.fill();
        // Rattle
        ctx.fillStyle = '#DAA520';
        ctx.beginPath();
        ctx.arc(x - 22 * s, y - 3 * s + Math.sin(time * 10) * 2 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
    },
};
