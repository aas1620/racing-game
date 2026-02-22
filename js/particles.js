// particles.js — Explosion particle system
// When a car crashes hard enough: BOOM! Debris, fire, smoke everywhere.

const Particles = {
    particles: [],
    active: false,

    spawn(x, y, carColors) {
        this.particles = [];
        this.active = true;

        const bodyColor = carColors?.bodyColor || '#e74c3c';
        const accentColor = carColors?.accentColor || '#f39c12';

        // Fire particles (orange/yellow, fast)
        for (let i = 0; i < 30; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 40,
                y: y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 400,
                vy: -Math.random() * 300 - 100,
                size: 4 + Math.random() * 8,
                color: Math.random() > 0.5 ? '#ff6600' : '#ffcc00',
                life: 0.5 + Math.random() * 1.0,
                maxLife: 0,
                type: 'fire',
            });
            this.particles[this.particles.length - 1].maxLife = this.particles[this.particles.length - 1].life;
        }

        // Debris particles (car-colored chunks)
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 15,
                vx: (Math.random() - 0.5) * 500,
                vy: -Math.random() * 400 - 50,
                size: 3 + Math.random() * 6,
                color: Math.random() > 0.5 ? bodyColor : accentColor,
                life: 0.8 + Math.random() * 1.5,
                maxLife: 0,
                type: 'debris',
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 15,
            });
            this.particles[this.particles.length - 1].maxLife = this.particles[this.particles.length - 1].life;
        }

        // Smoke particles (grey, slow, long-lasting)
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y,
                vx: (Math.random() - 0.5) * 100,
                vy: -Math.random() * 150 - 30,
                size: 10 + Math.random() * 15,
                color: '#555',
                life: 1.0 + Math.random() * 1.5,
                maxLife: 0,
                type: 'smoke',
            });
            this.particles[this.particles.length - 1].maxLife = this.particles[this.particles.length - 1].life;
        }

        // One big flash
        this.particles.push({
            x: x,
            y: y,
            vx: 0,
            vy: 0,
            size: 60,
            color: '#ffffff',
            life: 0.15,
            maxLife: 0.15,
            type: 'flash',
        });
    },

    update(dt) {
        if (!this.active) return;

        let anyAlive = false;

        for (const p of this.particles) {
            if (p.life <= 0) continue;
            anyAlive = true;

            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Gravity for debris
            if (p.type === 'debris') {
                p.vy += 600 * dt;
                p.rotation += p.rotSpeed * dt;
            }

            // Fire rises and slows
            if (p.type === 'fire') {
                p.vy -= 100 * dt;
                p.vx *= 0.98;
                p.size *= 0.97;
            }

            // Smoke expands
            if (p.type === 'smoke') {
                p.size += 20 * dt;
                p.vx *= 0.99;
            }
        }

        if (!anyAlive) {
            this.active = false;
            this.particles = [];
        }
    },

    draw(ctx) {
        if (!this.active) return;

        for (const p of this.particles) {
            if (p.life <= 0) continue;

            const alpha = Math.max(0, p.life / p.maxLife);

            ctx.save();
            ctx.globalAlpha = alpha;

            if (p.type === 'flash') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * (1 - alpha), 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'debris') {
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            } else if (p.type === 'smoke') {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = alpha * 0.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Fire
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    },
};
