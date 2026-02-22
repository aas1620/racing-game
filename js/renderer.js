// renderer.js — The pseudo-3D road rendering engine
// This is where the magic trick happens!
//
// How it works:
// We draw the road as horizontal stripes from the bottom of the screen (close) to a horizon
// line (far away). Each stripe gets narrower as it goes up — that's perspective.
// To make the road curve, we shift each stripe left or right.
// To make hills, we shift them up or down.

const Renderer = {
    canvas: null,
    ctx: null,

    // Camera settings
    cameraHeight: 1200,     // How high above the road the camera sits
    cameraDepth: 0,         // Calculated from field of view
    drawDistance: 200,       // How many segments ahead we draw
    roadWidth: 2000,        // Half-width of the road in world units
    fogDensity: 5,          // How quickly things fade into the distance

    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        // Calculate camera depth from a ~100 degree field of view
        this.cameraDepth = 1 / Math.tan((100 / 2) * Math.PI / 180);
    },

    render(road, car, time) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const colors = road.colors;

        // === SKY ===
        this.drawSky(ctx, w, h, colors);

        // === ROAD (the pseudo-3D part) ===
        const baseSegmentIndex = Math.floor(car.position / road.segmentLength);
        const basePercent = (car.position % road.segmentLength) / road.segmentLength;

        // We'll project each segment from far to near, tracking where on screen it lands
        let curveAccum = 0;   // Accumulated curve offset (this makes curves work!)
        let hillAccum = 0;

        // First pass: calculate projected positions for all visible segments
        const projected = [];

        for (let i = 0; i < this.drawDistance; i++) {
            const segIndex = baseSegmentIndex + i;
            const seg = road.getSegmentByIndex(segIndex);
            if (!seg) continue;

            // How far ahead is this segment?
            const segZ = (i - basePercent) * road.segmentLength;
            if (segZ <= 0) continue;

            // Project from world coordinates to screen coordinates
            // This is the core perspective math!
            // scale shrinks with distance (things far away look small)
            const scale = this.cameraDepth / segZ;
            const screenX = w / 2 + (curveAccum - car.x * this.roadWidth) * scale * w / 2;
            // Camera is above the road, so road projects BELOW the horizon (h/2).
            // Near segments (large scale) → large screenY → bottom of screen.
            // Far segments (small scale) → screenY near h/2 → horizon.
            // Hills shift the road surface up (negative hillAccum → higher).
            const screenY = h / 2 + (this.cameraHeight - hillAccum) * scale * h / 2;
            const screenW = this.roadWidth * scale * w / 2;

            projected.push({
                screenX,
                screenY,
                screenW,
                scale,
                segIndex: segIndex % road.totalSegments,
                segment: seg,
                z: segZ,
            });

            // Accumulate curve — this is how the road bends!
            curveAccum += seg.curve * road.segmentLength;
            hillAccum += seg.hill * 30;
        }

        // Second pass: draw from far to near (painter's algorithm)
        // projected[0] = nearest segment (bottom of screen, wide road)
        // projected[last] = farthest segment (near horizon, narrow road)
        // We iterate backwards: draw far segments first, near segments paint over them.
        for (let i = projected.length - 1; i > 0; i--) {
            const far = projected[i];         // farther segment (higher on screen, narrower)
            const near = projected[i - 1];    // nearer segment (lower on screen, wider)

            // Skip if this strip is above the near one (shouldn't happen on flat road)
            if (far.screenY >= near.screenY) continue;

            const fogAmount = Math.min(1, i / this.drawDistance);

            // Alternating segment colors (like a barber pole — gives sense of speed)
            const isEven = (far.segIndex % 2) === 0;

            // === Draw grass (the ground on both sides of the road) ===
            ctx.fillStyle = this.fogColor(
                isEven ? colors.grass : colors.grassLight,
                colors.sky, fogAmount
            );
            ctx.fillRect(0, far.screenY, w, near.screenY - far.screenY + 1);

            // === Draw road surface ===
            ctx.fillStyle = this.fogColor(
                isEven ? colors.road : colors.roadLight,
                colors.sky, fogAmount
            );
            this.drawTrapezoid(ctx,
                far.screenX, far.screenW, far.screenY,
                near.screenX, near.screenW, near.screenY
            );

            // === Draw rumble strips (red/white curbs) ===
            const farRumbleW = far.screenW * 1.15;
            const nearRumbleW = near.screenW * 1.15;
            ctx.fillStyle = this.fogColor(
                isEven ? colors.rumble : colors.rumbleLight,
                colors.sky, fogAmount
            );
            // Left rumble
            this.drawTrapezoid(ctx,
                far.screenX - farRumbleW, farRumbleW * 0.15, far.screenY,
                near.screenX - nearRumbleW, nearRumbleW * 0.15, near.screenY
            );
            // Right rumble
            this.drawTrapezoid(ctx,
                far.screenX + farRumbleW * 0.85, farRumbleW * 0.15, far.screenY,
                near.screenX + nearRumbleW * 0.85, nearRumbleW * 0.15, near.screenY
            );

            // === Lane markings (dashed center line) ===
            if (isEven && far.segIndex % 4 < 2) {
                ctx.fillStyle = this.fogColor(colors.lane, colors.sky, fogAmount);
                const farLaneW = far.screenW * 0.02;
                const nearLaneW = near.screenW * 0.02;
                this.drawTrapezoid(ctx,
                    far.screenX - farLaneW / 2, farLaneW, far.screenY,
                    near.screenX - nearLaneW / 2, nearLaneW, near.screenY
                );
            }

            // === Start/finish line ===
            if (far.segIndex === 0 || far.segIndex === 1) {
                ctx.fillStyle = this.fogColor(colors.startLine, colors.sky, fogAmount);
                ctx.globalAlpha = 0.7;
                this.drawTrapezoid(ctx,
                    far.screenX, far.screenW * 0.9, far.screenY,
                    near.screenX, near.screenW * 0.9, near.screenY
                );
                ctx.globalAlpha = 1;
            }

            // === Scenery ===
            if (i < this.drawDistance * 0.8) { // Don't draw scenery too far away
                const seg = far.segment;
                if (seg.sceneryLeft) {
                    const sx = far.screenX + seg.sceneryLeft.offset * far.screenW;
                    Scenery.draw(ctx, seg.sceneryLeft.type, sx, far.screenY, far.scale * 40, colors);
                }
                if (seg.sceneryRight) {
                    const sx = far.screenX + seg.sceneryRight.offset * far.screenW;
                    Scenery.draw(ctx, seg.sceneryRight.type, sx, far.screenY, far.scale * 40, colors);
                }

                // Hazards
                if (seg.hazard) {
                    const hx = far.screenX + seg.hazard.lane * far.screenW;
                    Scenery.drawHazard(ctx, seg.hazard.type, hx, far.screenY, far.scale * 40, time);
                }
            }
        }
    },

    drawSky(ctx, w, h, colors) {
        // Gradient sky
        const grad = ctx.createLinearGradient(0, 0, 0, h / 2);
        grad.addColorStop(0, colors.sky);
        grad.addColorStop(1, colors.skyHorizon);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h / 2);

        // Mountains / distant terrain silhouette
        ctx.fillStyle = this.blendColors(colors.sky, colors.skyHorizon, 0.5);
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        for (let x = 0; x <= w; x += 40) {
            const mountainY = h / 2 - 20 - Math.sin(x * 0.005) * 30 - Math.sin(x * 0.013) * 15;
            ctx.lineTo(x, mountainY);
        }
        ctx.lineTo(w, h / 2);
        ctx.closePath();
        ctx.fill();
    },

    drawTrapezoid(ctx, x1, w1, y1, x2, w2, y2) {
        ctx.beginPath();
        ctx.moveTo(x1 - w1, y1);
        ctx.lineTo(x1 + w1, y1);
        ctx.lineTo(x2 + w2, y2);
        ctx.lineTo(x2 - w2, y2);
        ctx.closePath();
        ctx.fill();
    },

    drawCar(ctx, car, w, h, time) {
        const centerX = w / 2;
        const carY = h - 100;

        // If crashed and exploding, particles handle the visual
        if (car.crashed && car.explosionTriggered) return;

        // If crashed (spin), draw spinning car
        if (car.crashed) {
            ctx.save();
            ctx.translate(centerX, carY + car.bounce);
            ctx.rotate(car.spinAngle);
            this.drawCarSprite(ctx, 0, 0, car);
            ctx.restore();
            return;
        }

        // Flash the car during invincibility (blink every 0.1s)
        if (car.invincibleTimer > 0 && Math.floor(time * 10) % 2 === 0) {
            return; // Skip drawing this frame = blink effect
        }

        ctx.save();
        ctx.translate(centerX, carY + car.bounce);

        // Visible lean when steering — skew the car body
        const lean = car.tilt * 0.15;
        ctx.transform(1, 0, lean, 1, 0, 0);

        this.drawCarSprite(ctx, 0, 0, car);
        ctx.restore();
    },

    drawCarSprite(ctx, x, y, car) {
        const colors = car.stats || {
            bodyColor: '#e74c3c',
            accentColor: '#c0392b',
            stripeColor: '#f1c40f',
            wheelColor: '#333',
        };

        const bColor = colors.bodyColor;
        const aColor = colors.accentColor;
        const sColor = colors.stripeColor;
        const wColor = colors.wheelColor;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 25, 45, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wheels (back)
        ctx.fillStyle = wColor;
        ctx.fillRect(x - 48, y - 5, 14, 25);
        ctx.fillRect(x + 34, y - 5, 14, 25);

        // Main body
        ctx.fillStyle = bColor;
        ctx.beginPath();
        ctx.moveTo(x - 40, y + 20);   // Bottom left
        ctx.lineTo(x - 42, y - 10);   // Left side
        ctx.lineTo(x - 30, y - 35);   // Left windshield
        ctx.lineTo(x - 15, y - 50);   // Roof left
        ctx.lineTo(x + 15, y - 50);   // Roof right
        ctx.lineTo(x + 30, y - 35);   // Right windshield
        ctx.lineTo(x + 42, y - 10);   // Right side
        ctx.lineTo(x + 40, y + 20);   // Bottom right
        ctx.closePath();
        ctx.fill();

        // Windshield
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.moveTo(x - 25, y - 32);
        ctx.lineTo(x - 12, y - 46);
        ctx.lineTo(x + 12, y - 46);
        ctx.lineTo(x + 25, y - 32);
        ctx.closePath();
        ctx.fill();

        // Racing stripe
        ctx.fillStyle = sColor;
        ctx.fillRect(x - 5, y - 50, 10, 70);

        // Front accent
        ctx.fillStyle = aColor;
        ctx.fillRect(x - 35, y + 12, 70, 8);

        // Headlights
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(x - 35, y + 12, 8, 5);
        ctx.fillRect(x + 27, y + 12, 8, 5);

        // Wheels (front, drawn on top)
        ctx.fillStyle = wColor;
        const steer = car.tilt * 3;
        ctx.save();
        ctx.translate(x - 41, y + 12);
        ctx.rotate(steer * 0.1);
        ctx.fillRect(-7, -3, 14, 12);
        ctx.restore();
        ctx.save();
        ctx.translate(x + 41, y + 12);
        ctx.rotate(steer * 0.1);
        ctx.fillRect(-7, -3, 14, 12);
        ctx.restore();
    },

    // === Color utilities ===

    fogColor(baseColor, fogColor, amount) {
        return this.blendColors(baseColor, fogColor, Math.pow(amount, this.fogDensity));
    },

    blendColors(color1, color2, ratio) {
        const r1 = parseInt(color1.slice(1, 3), 16);
        const g1 = parseInt(color1.slice(3, 5), 16);
        const b1 = parseInt(color1.slice(5, 7), 16);
        const r2 = parseInt(color2.slice(1, 3), 16);
        const g2 = parseInt(color2.slice(3, 5), 16);
        const b2 = parseInt(color2.slice(5, 7), 16);
        const r = Math.round(r1 + (r2 - r1) * ratio);
        const g = Math.round(g1 + (g2 - g1) * ratio);
        const b = Math.round(b1 + (b2 - b1) * ratio);
        return `rgb(${r},${g},${b})`;
    },
};
