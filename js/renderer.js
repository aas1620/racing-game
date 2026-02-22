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
            id: 'generic',
            bodyColor: '#e74c3c',
            accentColor: '#c0392b',
            stripeColor: '#f1c40f',
            wheelColor: '#333',
        };
        const id = colors.id;

        // Dispatch to per-car draw function
        switch (id) {
            case 'twin_mill':    this.drawTwinMill(ctx, x, y, colors, car.tilt || 0); break;
            case 'bone_shaker':  this.drawBoneShaker(ctx, x, y, colors, car.tilt || 0); break;
            case 'porsche_911':  this.drawPorsche911(ctx, x, y, colors, car.tilt || 0); break;
            case 'porsche_dakar':this.drawPorscheDakar(ctx, x, y, colors, car.tilt || 0); break;
            case 'deora_ii':     this.drawDeoraII(ctx, x, y, colors, car.tilt || 0); break;
            case 'night_shifter':this.drawNightShifter(ctx, x, y, colors, car.tilt || 0); break;
            default:             this.drawGenericCar(ctx, x, y, colors, car.tilt || 0); break;
        }
    },

    // === Shared helpers ===
    _shadow(ctx, x, y, w) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 25, w, 10, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    _wheels(ctx, x, y, wColor, tilt, backL, backR, frontL, frontR) {
        // Back wheels
        ctx.fillStyle = wColor;
        ctx.fillRect(backL[0] + x, backL[1] + y, 14, 24);
        ctx.fillRect(backR[0] + x, backR[1] + y, 14, 24);
        // Front wheels (steerable)
        const steer = tilt * 3;
        ctx.save();
        ctx.translate(frontL[0] + x + 7, frontL[1] + y + 6);
        ctx.rotate(steer * 0.1);
        ctx.fillRect(-7, -5, 14, 12);
        ctx.restore();
        ctx.save();
        ctx.translate(frontR[0] + x + 7, frontR[1] + y + 6);
        ctx.rotate(steer * 0.1);
        ctx.fillRect(-7, -5, 14, 12);
        ctx.restore();
    },

    _headlights(ctx, x, y, positions) {
        ctx.fillStyle = '#f1c40f';
        for (const p of positions) {
            ctx.fillRect(x + p[0], y + p[1], p[2] || 7, p[3] || 5);
        }
    },

    _taillights(ctx, x, y, color, positions) {
        ctx.fillStyle = color;
        for (const p of positions) {
            ctx.fillRect(x + p[0], y + p[1], p[2] || 7, p[3] || 4);
        }
    },

    // =========================================
    // TWIN MILL — Long hood, twin supercharger bumps, muscle car stance
    // =========================================
    drawTwinMill(ctx, x, y, c, tilt) {
        this._shadow(ctx, x, y, 48);

        // Back wheels (wide stance)
        this._wheels(ctx, x, y, c.wheelColor, tilt,
            [-50, -5], [36, -5], [-44, 12], [30, 12]);

        // Long body — muscular, wide rear tapering to front
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 44, y + 20);   // rear left
        ctx.lineTo(x - 46, y - 5);    // rear fender
        ctx.lineTo(x - 42, y - 22);   // rear deck
        ctx.lineTo(x - 25, y - 38);   // rear window
        ctx.lineTo(x - 12, y - 46);   // roof left
        ctx.lineTo(x + 12, y - 46);   // roof right
        ctx.lineTo(x + 25, y - 38);   // front window
        ctx.lineTo(x + 38, y - 18);   // hood start
        ctx.lineTo(x + 44, y - 10);   // hood
        ctx.lineTo(x + 46, y + 5);    // nose
        ctx.lineTo(x + 42, y + 20);   // front bumper
        ctx.closePath();
        ctx.fill();

        // Twin supercharger bumps on hood
        ctx.fillStyle = c.accentColor;
        // Left engine bump
        ctx.beginPath();
        ctx.moveTo(x - 12, y - 18);
        ctx.lineTo(x - 8, y - 32);
        ctx.lineTo(x - 3, y - 32);
        ctx.lineTo(x + 1, y - 18);
        ctx.closePath();
        ctx.fill();
        // Right engine bump
        ctx.beginPath();
        ctx.moveTo(x + 1, y - 18);
        ctx.lineTo(x + 5, y - 32);
        ctx.lineTo(x + 10, y - 32);
        ctx.lineTo(x + 14, y - 18);
        ctx.closePath();
        ctx.fill();

        // Engine intake scoops (dark slots on bumps)
        ctx.fillStyle = '#111';
        ctx.fillRect(x - 10, y - 30, 6, 3);
        ctx.fillRect(x + 4, y - 30, 6, 3);

        // Windshield
        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath();
        ctx.moveTo(x - 22, y - 36);
        ctx.lineTo(x - 10, y - 44);
        ctx.lineTo(x + 10, y - 44);
        ctx.lineTo(x + 22, y - 36);
        ctx.closePath();
        ctx.fill();

        // Gold center stripe
        ctx.fillStyle = c.stripeColor;
        ctx.fillRect(x - 2, y - 46, 4, 66);

        // Front bumper / grille
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 30, y + 15, 60, 6);
        this._headlights(ctx, x, y, [[-34, 14], [28, 14]]);

        // Taillights
        this._taillights(ctx, x, y, '#e74c3c', [[-40, -8, 6, 6], [34, -8, 6, 6]]);
    },

    // =========================================
    // BONE SHAKER — Hot rod with exposed engine, skull grille, fat rear tires
    // =========================================
    drawBoneShaker(ctx, x, y, c, tilt) {
        this._shadow(ctx, x, y, 46);

        // Fat rear wheels, smaller fronts
        ctx.fillStyle = c.wheelColor;
        ctx.fillRect(x - 50, y - 8, 16, 28); // rear L (fat)
        ctx.fillRect(x + 34, y - 8, 16, 28); // rear R (fat)
        // Front wheels
        const steer = tilt * 3;
        ctx.save();
        ctx.translate(x - 38, y + 16);
        ctx.rotate(steer * 0.1);
        ctx.fillRect(-5, -4, 10, 10);
        ctx.restore();
        ctx.save();
        ctx.translate(x + 38, y + 16);
        ctx.rotate(steer * 0.1);
        ctx.fillRect(-5, -4, 10, 10);
        ctx.restore();

        // Body — chopped hot rod profile, short cab set back
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 42, y + 20);
        ctx.lineTo(x - 44, y - 5);    // rear fender (tall)
        ctx.lineTo(x - 38, y - 20);   // rear deck
        ctx.lineTo(x - 20, y - 36);   // chopped roof rear
        ctx.lineTo(x - 8, y - 40);    // roof top L
        ctx.lineTo(x + 8, y - 40);    // roof top R
        ctx.lineTo(x + 16, y - 32);   // front of cab
        ctx.lineTo(x + 22, y - 15);   // hood drops low
        ctx.lineTo(x + 38, y + 2);    // long low nose
        ctx.lineTo(x + 36, y + 20);
        ctx.closePath();
        ctx.fill();

        // Exposed engine block sticking up from hood
        ctx.fillStyle = '#777';
        ctx.fillRect(x + 8, y - 28, 16, 14);
        // Intake manifold pipes
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(x + 9, y - 32, 4, 6);
        ctx.fillRect(x + 15, y - 32, 4, 6);
        ctx.fillRect(x + 21, y - 30, 4, 6);
        // Engine detail
        ctx.fillStyle = '#555';
        ctx.fillRect(x + 10, y - 20, 12, 3);

        // Skull grille (simplified — circle eyes, nose, grin)
        ctx.fillStyle = c.accentColor;
        // Skull face on front
        ctx.beginPath();
        ctx.arc(x + 32, y + 6, 8, 0, Math.PI * 2);
        ctx.fill();
        // Eye sockets
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(x + 29, y + 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 35, y + 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Nose
        ctx.fillRect(x + 31, y + 7, 2, 3);

        // Windshield (chopped — short)
        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 33);
        ctx.lineTo(x - 6, y - 38);
        ctx.lineTo(x + 6, y - 38);
        ctx.lineTo(x + 14, y - 30);
        ctx.closePath();
        ctx.fill();

        // Flame stripe on side
        ctx.fillStyle = c.stripeColor;
        ctx.beginPath();
        ctx.moveTo(x - 38, y + 5);
        ctx.lineTo(x - 10, y - 5);
        ctx.lineTo(x + 5, y + 0);
        ctx.lineTo(x - 5, y + 5);
        ctx.lineTo(x + 10, y + 2);
        ctx.lineTo(x - 10, y + 10);
        ctx.lineTo(x - 38, y + 12);
        ctx.closePath();
        ctx.fill();

        this._headlights(ctx, x, y, [[28, 14, 5, 4], [36, 14, 5, 4]]);
        this._taillights(ctx, x, y, '#e74c3c', [[-42, -2, 5, 5], [38, -2, 5, 5]]);
    },

    // =========================================
    // PORSCHE 911 TURBO — Sleek slope-back, wide rear haunches, whale tail spoiler
    // =========================================
    drawPorsche911(ctx, x, y, c, tilt) {
        this._shadow(ctx, x, y, 44);

        this._wheels(ctx, x, y, c.wheelColor, tilt,
            [-46, -3], [32, -3], [-40, 12], [28, 12]);

        // Sleek 911 body — iconic sloping rear roofline
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 40, y + 20);
        ctx.lineTo(x - 42, y - 2);     // rear fender
        ctx.lineTo(x - 40, y - 20);    // rear haunch (wide)
        ctx.lineTo(x - 32, y - 36);    // sloping rear window start
        ctx.lineTo(x - 18, y - 48);    // roof peak (far back — 911 signature)
        ctx.lineTo(x + 5, y - 50);     // roof
        ctx.lineTo(x + 22, y - 42);    // windshield top
        ctx.lineTo(x + 36, y - 22);    // long sloping hood
        ctx.lineTo(x + 42, y - 8);     // front fender
        ctx.lineTo(x + 40, y + 8);     // nose
        ctx.lineTo(x + 38, y + 20);    // front bumper
        ctx.closePath();
        ctx.fill();

        // Whale tail spoiler
        ctx.fillStyle = c.bodyColor;
        ctx.fillRect(x - 42, y - 24, 8, 3);
        ctx.fillStyle = c.stripeColor;
        ctx.beginPath();
        ctx.moveTo(x - 48, y - 26);
        ctx.lineTo(x - 46, y - 30);
        ctx.lineTo(x - 34, y - 30);
        ctx.lineTo(x - 32, y - 26);
        ctx.closePath();
        ctx.fill();

        // Rear window (slopes down — 911 signature)
        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath();
        ctx.moveTo(x - 30, y - 34);
        ctx.lineTo(x - 16, y - 46);
        ctx.lineTo(x + 3, y - 48);
        ctx.lineTo(x + 5, y - 42);
        ctx.lineTo(x - 18, y - 38);
        ctx.closePath();
        ctx.fill();

        // Front windshield
        ctx.beginPath();
        ctx.moveTo(x + 8, y - 42);
        ctx.lineTo(x + 20, y - 40);
        ctx.lineTo(x + 32, y - 24);
        ctx.lineTo(x + 12, y - 28);
        ctx.closePath();
        ctx.fill();

        // Side accent line
        ctx.strokeStyle = c.accentColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 38, y + 2);
        ctx.lineTo(x + 38, y + 2);
        ctx.stroke();

        // Racing number circle
        ctx.fillStyle = c.stripeColor;
        ctx.beginPath();
        ctx.arc(x, y - 10, 10, 0, Math.PI * 2);
        ctx.fill();

        // Front bumper intake
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 25, y + 16, 50, 5);

        this._headlights(ctx, x, y, [[-32, 6, 6, 4], [26, 6, 6, 4]]);
        // Round 911 taillights
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(x - 38, y - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 38, y - 6, 4, 0, Math.PI * 2);
        ctx.fill();
    },

    // =========================================
    // PORSCHE 911 DAKAR — Raised 911, roof rack/lights, chunkier fenders
    // =========================================
    drawPorscheDakar(ctx, x, y, c, tilt) {
        this._shadow(ctx, x, y, 46);

        // Chunkier wheels (rally tires)
        ctx.fillStyle = c.wheelColor;
        ctx.fillRect(x - 48, y - 6, 15, 26);
        ctx.fillRect(x + 33, y - 6, 15, 26);
        // Tire tread marks
        ctx.fillStyle = '#666';
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(x - 47, y - 2 + i * 7, 13, 2);
            ctx.fillRect(x + 34, y - 2 + i * 7, 13, 2);
        }
        // Front wheels
        const steer = tilt * 3;
        ctx.save();
        ctx.translate(x - 41, y + 16);
        ctx.rotate(steer * 0.1);
        ctx.fillRect(-7, -5, 14, 12);
        ctx.restore();
        ctx.save();
        ctx.translate(x + 41, y + 16);
        ctx.rotate(steer * 0.1);
        ctx.fillRect(-7, -5, 14, 12);
        ctx.restore();

        // Raised 911 body (2px higher than standard 911)
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 42, y + 18);
        ctx.lineTo(x - 44, y - 6);
        ctx.lineTo(x - 42, y - 24);
        ctx.lineTo(x - 32, y - 40);    // rear slope
        ctx.lineTo(x - 18, y - 52);    // roof
        ctx.lineTo(x + 5, y - 54);
        ctx.lineTo(x + 22, y - 46);
        ctx.lineTo(x + 36, y - 26);
        ctx.lineTo(x + 44, y - 10);
        ctx.lineTo(x + 42, y + 6);
        ctx.lineTo(x + 40, y + 18);
        ctx.closePath();
        ctx.fill();

        // Fender flares (wider than body)
        ctx.fillStyle = c.accentColor;
        // Rear flares
        ctx.beginPath();
        ctx.moveTo(x - 46, y + 18);
        ctx.lineTo(x - 48, y - 2);
        ctx.lineTo(x - 44, y - 6);
        ctx.lineTo(x - 42, y + 18);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 42, y + 18);
        ctx.lineTo(x + 44, y - 6);
        ctx.lineTo(x + 48, y - 2);
        ctx.lineTo(x + 46, y + 18);
        ctx.closePath();
        ctx.fill();

        // Roof rack
        ctx.fillStyle = '#555';
        ctx.fillRect(x - 16, y - 56, 20, 3);
        ctx.fillRect(x - 14, y - 58, 2, 4);
        ctx.fillRect(x + 2, y - 58, 2, 4);

        // Roof-mounted rally lights
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(x - 8, y - 57, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 0, y - 57, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 8, y - 57, 3, 0, Math.PI * 2);
        ctx.fill();

        // Windshield
        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath();
        ctx.moveTo(x - 28, y - 38);
        ctx.lineTo(x - 16, y - 50);
        ctx.lineTo(x + 3, y - 52);
        ctx.lineTo(x + 18, y - 44);
        ctx.lineTo(x + 30, y - 28);
        ctx.lineTo(x + 8, y - 32);
        ctx.closePath();
        ctx.fill();

        // Number plate
        ctx.fillStyle = c.stripeColor;
        ctx.fillRect(x - 8, y - 15, 16, 12);
        ctx.fillStyle = c.accentColor;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('53', x, y - 6);

        // Skid plate underneath
        ctx.fillStyle = '#888';
        ctx.fillRect(x - 25, y + 18, 50, 3);

        this._headlights(ctx, x, y, [[-34, 4, 6, 4], [28, 4, 6, 4]]);
        this._taillights(ctx, x, y, '#e74c3c', [[-40, -8, 5, 5], [36, -8, 5, 5]]);
    },

    // =========================================
    // DEORA II — Wedge-shaped surf wagon, surfboard on back, rounded nose
    // =========================================
    drawDeoraII(ctx, x, y, c, tilt) {
        this._shadow(ctx, x, y, 44);

        this._wheels(ctx, x, y, c.wheelColor, tilt,
            [-46, -3], [32, -3], [-40, 12], [28, 12]);

        // Wedge-shaped body — tall rear sloping to low nose
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 40, y + 20);
        ctx.lineTo(x - 42, y - 8);     // rear
        ctx.lineTo(x - 38, y - 30);    // tall rear
        ctx.lineTo(x - 30, y - 48);    // roofline (tall!)
        ctx.lineTo(x - 10, y - 52);    // roof peak
        ctx.lineTo(x + 10, y - 48);    // roof slopes forward
        ctx.lineTo(x + 28, y - 30);    // windshield slopes way down
        ctx.lineTo(x + 40, y - 8);     // long low nose
        ctx.lineTo(x + 42, y + 10);    // very low front
        ctx.lineTo(x + 38, y + 20);
        ctx.closePath();
        ctx.fill();

        // Big wrap-around windshield (Deora II signature)
        ctx.fillStyle = '#2a5a7a';
        ctx.beginPath();
        ctx.moveTo(x - 26, y - 44);
        ctx.lineTo(x - 8, y - 50);
        ctx.lineTo(x + 8, y - 46);
        ctx.lineTo(x + 26, y - 28);
        ctx.lineTo(x + 36, y - 12);
        ctx.lineTo(x + 30, y - 8);
        ctx.lineTo(x + 16, y - 22);
        ctx.lineTo(x - 4, y - 36);
        ctx.lineTo(x - 20, y - 38);
        ctx.closePath();
        ctx.fill();

        // Surfboard sticking out the back!
        ctx.fillStyle = c.accentColor;
        ctx.beginPath();
        ctx.moveTo(x - 32, y - 50);
        ctx.lineTo(x - 30, y - 68);    // surfboard tip
        ctx.lineTo(x - 26, y - 50);
        ctx.closePath();
        ctx.fill();
        // Board stripe
        ctx.fillStyle = c.stripeColor;
        ctx.fillRect(x - 30, y - 62, 2, 12);

        // Side accent swoosh
        ctx.fillStyle = c.accentColor;
        ctx.beginPath();
        ctx.moveTo(x - 36, y + 5);
        ctx.quadraticCurveTo(x, y - 10, x + 36, y + 5);
        ctx.lineTo(x + 36, y + 10);
        ctx.quadraticCurveTo(x, y - 4, x - 36, y + 10);
        ctx.closePath();
        ctx.fill();

        // Rounded nose detail
        ctx.fillStyle = c.stripeColor;
        ctx.beginPath();
        ctx.arc(x + 38, y + 4, 8, -0.5, 0.5);
        ctx.fill();

        this._headlights(ctx, x, y, [[30, 8, 5, 4], [36, 4, 5, 4]]);
        this._taillights(ctx, x, y, '#e74c3c', [[-38, -4, 5, 5], [34, -4, 5, 5]]);
    },

    // =========================================
    // NIGHT SHIFTER — Ultra-low angular wedge, aggressive splitter, neon accents
    // =========================================
    drawNightShifter(ctx, x, y, c, tilt) {
        this._shadow(ctx, x, y, 46);

        this._wheels(ctx, x, y, c.wheelColor, tilt,
            [-48, -2], [34, -2], [-42, 12], [30, 12]);

        // Ultra-low angular body — like a stealth fighter
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 42, y + 20);
        ctx.lineTo(x - 46, y + 0);     // rear (wide)
        ctx.lineTo(x - 44, y - 15);    // rear haunch
        ctx.lineTo(x - 30, y - 32);    // angular rear
        ctx.lineTo(x - 14, y - 42);    // low roof
        ctx.lineTo(x + 10, y - 42);    // roof
        ctx.lineTo(x + 28, y - 30);    // windshield slope
        ctx.lineTo(x + 42, y - 8);     // needle nose
        ctx.lineTo(x + 48, y + 8);     // front splitter
        ctx.lineTo(x + 44, y + 20);
        ctx.closePath();
        ctx.fill();

        // Angular windshield
        ctx.fillStyle = '#0a0a1a';
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 40);
        ctx.lineTo(x + 8, y - 40);
        ctx.lineTo(x + 26, y - 28);
        ctx.lineTo(x + 36, y - 14);
        ctx.lineTo(x + 20, y - 18);
        ctx.lineTo(x + 2, y - 30);
        ctx.closePath();
        ctx.fill();

        // Neon accent lines (the glow)
        ctx.strokeStyle = c.stripeColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = c.stripeColor;
        ctx.shadowBlur = 6;
        // Side stripe
        ctx.beginPath();
        ctx.moveTo(x - 42, y + 5);
        ctx.lineTo(x + 42, y + 5);
        ctx.stroke();
        // Hood V-line
        ctx.beginPath();
        ctx.moveTo(x + 44, y - 6);
        ctx.lineTo(x + 10, y - 20);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 44, y - 6);
        ctx.lineTo(x + 10, y + 8);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Big rear spoiler (angular)
        ctx.fillStyle = c.accentColor;
        ctx.beginPath();
        ctx.moveTo(x - 50, y - 18);
        ctx.lineTo(x - 48, y - 24);
        ctx.lineTo(x - 32, y - 24);
        ctx.lineTo(x - 30, y - 18);
        ctx.closePath();
        ctx.fill();
        // Spoiler supports
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 46, y - 18, 3, 6);
        ctx.fillRect(x - 34, y - 18, 3, 6);

        // Front splitter
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(x - 36, y + 18, 80, 4);

        // Aggressive headlights (angular slits)
        ctx.fillStyle = c.stripeColor;
        ctx.beginPath();
        ctx.moveTo(x - 30, y + 12);
        ctx.lineTo(x - 20, y + 10);
        ctx.lineTo(x - 20, y + 15);
        ctx.lineTo(x - 30, y + 16);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 30, y + 12);
        ctx.lineTo(x + 20, y + 10);
        ctx.lineTo(x + 20, y + 15);
        ctx.lineTo(x + 30, y + 16);
        ctx.closePath();
        ctx.fill();

        this._taillights(ctx, x, y, c.accentColor, [[-44, -4, 6, 4], [38, -4, 6, 4]]);
    },

    // =========================================
    // GENERIC fallback
    // =========================================
    drawGenericCar(ctx, x, y, c, tilt) {
        this._shadow(ctx, x, y, 45);
        this._wheels(ctx, x, y, c.wheelColor, tilt,
            [-48, -5], [34, -5], [-41, 12], [30, 12]);

        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 40, y + 20);
        ctx.lineTo(x - 42, y - 10);
        ctx.lineTo(x - 30, y - 35);
        ctx.lineTo(x - 15, y - 50);
        ctx.lineTo(x + 15, y - 50);
        ctx.lineTo(x + 30, y - 35);
        ctx.lineTo(x + 42, y - 10);
        ctx.lineTo(x + 40, y + 20);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.moveTo(x - 25, y - 32);
        ctx.lineTo(x - 12, y - 46);
        ctx.lineTo(x + 12, y - 46);
        ctx.lineTo(x + 25, y - 32);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = c.stripeColor;
        ctx.fillRect(x - 3, y - 50, 6, 70);

        ctx.fillStyle = c.accentColor;
        ctx.fillRect(x - 35, y + 12, 70, 8);
        this._headlights(ctx, x, y, [[-35, 12], [27, 12]]);
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
