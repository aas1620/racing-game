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
        this.drawSky(ctx, w, h, colors, road);

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
            let roadColor;
            if (road.rainbowRoad && road.rainbowColors.length > 0) {
                // Cycle through rainbow colors every 4 segments
                const rc = road.rainbowColors;
                const colorIndex = Math.floor(far.segIndex / 4) % rc.length;
                roadColor = rc[colorIndex];
            } else {
                roadColor = isEven ? colors.road : colors.roadLight;
            }
            ctx.fillStyle = this.fogColor(roadColor, colors.sky, fogAmount);
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

    drawSky(ctx, w, h, colors, road) {
        // Gradient sky
        const grad = ctx.createLinearGradient(0, 0, 0, h / 2);
        grad.addColorStop(0, colors.sky);
        grad.addColorStop(1, colors.skyHorizon);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h / 2);

        if (road && road.rainbowRoad) {
            // Starfield instead of mountains
            this._drawStarfield(ctx, w, h);
        } else {
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
        }
    },

    _drawStarfield(ctx, w, h) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 80; i++) {
            const sx = (Math.sin(i * 127.1) * 0.5 + 0.5) * w;
            const sy = (Math.sin(i * 311.7) * 0.5 + 0.5) * (h / 2 - 20);
            const size = (Math.sin(i * 73.3) * 0.5 + 0.5) * 2 + 0.5;
            ctx.globalAlpha = 0.4 + (Math.sin(i * 43.7) * 0.5 + 0.5) * 0.6;
            ctx.beginPath();
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
            ctx.fill();
        }
        const brightStars = [
            { x: 0.15, y: 0.12, color: '#ff99cc', size: 3 },
            { x: 0.72, y: 0.08, color: '#99ccff', size: 2.5 },
            { x: 0.45, y: 0.2, color: '#ffffaa', size: 3.5 },
            { x: 0.88, y: 0.15, color: '#ffaaff', size: 2 },
            { x: 0.3, y: 0.05, color: '#aaffcc', size: 2.5 },
        ];
        for (const star of brightStars) {
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = star.color;
            ctx.beginPath();
            ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
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

    // =====================================================
    // CAR SPRITES — 3D shaded rear views
    //
    // Coordinate system: (0,0) = center of car
    //   -y = top of screen (roof)
    //   +y = bottom of screen (bumper, closest to viewer)
    //   -x = left, +x = right
    //
    // 3D techniques used:
    //   - Linear gradients on body panels (light top, dark bottom)
    //   - Side edge darkening for volume
    //   - Specular highlights (white ellipse overlay)
    //   - Glowing taillights (shadowBlur)
    //   - Radial gradient shadows
    //   - Gradient tires with rim highlight
    //   - Window reflections
    // =====================================================

    drawCarSprite(ctx, x, y, car) {
        const c = car.stats || {
            id: 'generic', bodyColor: '#e74c3c', accentColor: '#c0392b',
            stripeColor: '#f1c40f', wheelColor: '#333',
        };

        switch (c.id) {
            case 'twin_mill':     this._drawTwinMill(ctx, x, y, c); break;
            case 'bone_shaker':   this._drawBoneShaker(ctx, x, y, c); break;
            case 'porsche_911':   this._drawPorsche911(ctx, x, y, c); break;
            case 'porsche_dakar': this._drawDakar(ctx, x, y, c); break;
            case 'deora_ii':      this._drawDeora(ctx, x, y, c); break;
            case 'night_shifter': this._drawNightShifter(ctx, x, y, c); break;
            case 'unicorn':       this._drawUnicorn(ctx, x, y, c); break;
            default:              this._drawGeneric(ctx, x, y, c); break;
        }
    },

    // --- TWIN MILL: wide low muscle car, MASSIVE twin supercharger scoops ---
    _drawTwinMill(ctx, x, y, c) {
        this._drawShadow(ctx, x, y + 22, 52, 10);

        // Wider stance wheels
        this._drawWheel(ctx, x - 52, y - 10, 14, 30);
        this._drawWheel(ctx, x + 38, y - 10, 14, 30);

        // Flowing body with bezier curves — wide and low
        ctx.fillStyle = this._bodyGrad(ctx, x, y - 36, y + 18, c.bodyColor);
        ctx.beginPath();
        ctx.moveTo(x - 44, y + 18);
        ctx.bezierCurveTo(x - 46, y + 8, x - 48, y - 4, x - 44, y - 14);
        ctx.bezierCurveTo(x - 40, y - 26, x - 32, y - 34, x - 22, y - 36);
        ctx.lineTo(x + 22, y - 36);
        ctx.bezierCurveTo(x + 32, y - 34, x + 40, y - 26, x + 44, y - 14);
        ctx.bezierCurveTo(x + 48, y - 4, x + 46, y + 8, x + 44, y + 18);
        ctx.closePath();
        ctx.fill();

        // Side edge shading for volume
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.moveTo(x - 44, y + 18);
        ctx.bezierCurveTo(x - 46, y + 8, x - 48, y - 4, x - 44, y - 14);
        ctx.bezierCurveTo(x - 40, y - 22, x - 36, y - 28, x - 30, y - 32);
        ctx.lineTo(x - 26, y - 30);
        ctx.bezierCurveTo(x - 34, y - 24, x - 40, y - 16, x - 40, y - 6);
        ctx.lineTo(x - 40, y + 18);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 44, y + 18);
        ctx.bezierCurveTo(x + 46, y + 8, x + 48, y - 4, x + 44, y - 14);
        ctx.bezierCurveTo(x + 40, y - 22, x + 36, y - 28, x + 30, y - 32);
        ctx.lineTo(x + 26, y - 30);
        ctx.bezierCurveTo(x + 34, y - 24, x + 40, y - 16, x + 40, y - 6);
        ctx.lineTo(x + 40, y + 18);
        ctx.closePath();
        ctx.fill();

        // Specular highlight on body
        this._specHighlight(ctx, x, y - 14, 30, 5);

        // Edge highlight on roof
        ctx.strokeStyle = this._lighten(c.bodyColor, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 22, y - 36);
        ctx.lineTo(x + 22, y - 36);
        ctx.stroke();

        // Window with curved top
        ctx.fillStyle = this._windowGrad(ctx, x, y - 33, y - 24);
        ctx.beginPath();
        ctx.moveTo(x - 18, y - 24);
        ctx.lineTo(x - 18, y - 30);
        ctx.bezierCurveTo(x - 14, y - 35, x + 14, y - 35, x + 18, y - 30);
        ctx.lineTo(x + 18, y - 24);
        ctx.closePath();
        ctx.fill();
        this._windowReflection(ctx, x - 14, y - 32, x - 4, y - 26);

        // === MASSIVE TWIN SUPERCHARGER SCOOPS ===
        // THE defining feature — these should dominate the silhouette
        const scoopGrad = ctx.createLinearGradient(x - 18, y - 38, x - 18, y - 62);
        scoopGrad.addColorStop(0, '#666');
        scoopGrad.addColorStop(0.25, '#bbb');
        scoopGrad.addColorStop(0.5, '#ddd');
        scoopGrad.addColorStop(0.75, '#bbb');
        scoopGrad.addColorStop(1, '#888');
        // Left supercharger housing
        ctx.fillStyle = scoopGrad;
        ctx.beginPath();
        ctx.moveTo(x - 26, y - 38);
        ctx.bezierCurveTo(x - 28, y - 44, x - 28, y - 56, x - 22, y - 62);
        ctx.bezierCurveTo(x - 18, y - 64, x - 12, y - 64, x - 8, y - 62);
        ctx.bezierCurveTo(x - 4, y - 56, x - 4, y - 44, x - 6, y - 38);
        ctx.closePath();
        ctx.fill();
        // Right supercharger housing
        ctx.beginPath();
        ctx.moveTo(x + 6, y - 38);
        ctx.bezierCurveTo(x + 4, y - 44, x + 4, y - 56, x + 8, y - 62);
        ctx.bezierCurveTo(x + 12, y - 64, x + 18, y - 64, x + 22, y - 62);
        ctx.bezierCurveTo(x + 28, y - 56, x + 28, y - 44, x + 26, y - 38);
        ctx.closePath();
        ctx.fill();

        // Dark intake openings on top of each scoop
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 60);
        ctx.bezierCurveTo(x - 22, y - 63, x - 12, y - 63, x - 8, y - 60);
        ctx.lineTo(x - 10, y - 56);
        ctx.bezierCurveTo(x - 14, y - 58, x - 20, y - 58, x - 22, y - 56);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 8, y - 60);
        ctx.bezierCurveTo(x + 12, y - 63, x + 22, y - 63, x + 24, y - 60);
        ctx.lineTo(x + 22, y - 56);
        ctx.bezierCurveTo(x + 20, y - 58, x + 14, y - 58, x + 10, y - 56);
        ctx.closePath();
        ctx.fill();

        // Chrome highlight arcs on scoops
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 50);
        ctx.bezierCurveTo(x - 22, y - 56, x - 12, y - 56, x - 8, y - 50);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 8, y - 50);
        ctx.bezierCurveTo(x + 12, y - 56, x + 22, y - 56, x + 24, y - 50);
        ctx.stroke();

        // Gold racing stripe with metallic sheen (between the scoops)
        const sg = ctx.createLinearGradient(x - 2, y, x + 2, y);
        sg.addColorStop(0, this._darken(c.stripeColor, 0.15));
        sg.addColorStop(0.5, this._lighten(c.stripeColor, 0.25));
        sg.addColorStop(1, this._darken(c.stripeColor, 0.15));
        ctx.fillStyle = sg;
        ctx.fillRect(x - 2, y - 36, 4, 52);

        // Panel line across body
        ctx.strokeStyle = this._darken(c.bodyColor, 0.2);
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x - 42, y + 2);
        ctx.lineTo(x + 42, y + 2);
        ctx.stroke();

        // Bumper with gradient
        this._drawBumper(ctx, x - 40, y + 14, 80, 6);

        // Taillights with glow (wider)
        this._glowTaillight(ctx, x - 34, y + 6, 18, 8);
        this._glowTaillight(ctx, x + 16, y + 6, 18, 8);

        // Dual exhaust pipes
        this._drawExhaust(ctx, x - 14, y + 18, 5);
        this._drawExhaust(ctx, x + 14, y + 18, 5);
    },

    // --- BONE SHAKER: hot rod, exposed engine, skull ---
    _drawBoneShaker(ctx, x, y, c) {
        this._drawShadow(ctx, x, y + 22, 48, 10);
        this._draw3DTire(ctx, x - 48, y - 12, 14, 32);
        this._draw3DTire(ctx, x + 34, y - 12, 14, 32);

        // Body with gradient — organic hot rod curves
        ctx.fillStyle = this._bodyGrad(ctx, x, y - 36, y + 18, c.bodyColor);
        ctx.beginPath();
        ctx.moveTo(x - 34, y + 18);
        ctx.bezierCurveTo(x - 36, y + 10, x - 38, y - 2, x - 36, y - 8);
        ctx.bezierCurveTo(x - 34, y - 18, x - 30, y - 28, x - 18, y - 36);
        ctx.lineTo(x + 18, y - 36);
        ctx.bezierCurveTo(x + 30, y - 28, x + 34, y - 18, x + 36, y - 8);
        ctx.bezierCurveTo(x + 38, y - 2, x + 36, y + 10, x + 34, y + 18);
        ctx.closePath();
        ctx.fill();

        // Side shading
        this._sideShade(ctx, x, y, -34, -36, -30, -18, 18, -8, -28);
        this._sideShade(ctx, x, y, 34, 36, 30, 18, 18, -8, -28);

        // Edge highlight
        ctx.strokeStyle = this._lighten(c.bodyColor, 0.3);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 18, y - 36);
        ctx.lineTo(x + 18, y - 36);
        ctx.stroke();

        this._specHighlight(ctx, x, y - 14, 24, 5);

        // Exposed engine block — BIGGER, with individual cylinders
        const eg = ctx.createLinearGradient(x, y - 56, x, y - 34);
        eg.addColorStop(0, '#aaa');
        eg.addColorStop(0.3, '#999');
        eg.addColorStop(0.6, '#888');
        eg.addColorStop(1, '#555');
        ctx.fillStyle = eg;
        ctx.fillRect(x - 14, y - 56, 28, 22);
        // Individual cylinder heads
        ctx.fillStyle = '#777';
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.arc(x + i * 5.5, y - 40, 3, 0, Math.PI, true);
            ctx.fill();
        }
        // Intake stacks with gradient (taller)
        ctx.fillStyle = this._bodyGrad(ctx, x, y - 64, y - 54, c.accentColor);
        ctx.fillRect(x - 10, y - 64, 6, 10);
        ctx.fillRect(x - 2, y - 64, 6, 10);
        ctx.fillRect(x + 6, y - 64, 6, 10);
        // Dark intake openings
        ctx.fillStyle = '#222';
        ctx.fillRect(x - 9, y - 64, 4, 3);
        ctx.fillRect(x - 1, y - 64, 4, 3);
        ctx.fillRect(x + 7, y - 64, 4, 3);
        // Valve covers
        const vg = ctx.createLinearGradient(x, y - 44, x, y - 41);
        vg.addColorStop(0, '#777');
        vg.addColorStop(1, '#444');
        ctx.fillStyle = vg;
        ctx.fillRect(x - 13, y - 44, 26, 3);

        // Chopped window with reflection
        ctx.fillStyle = this._windowGrad(ctx, x, y - 33, y - 25);
        ctx.fillRect(x - 14, y - 33, 28, 8);
        this._windowReflection(ctx, x - 10, y - 32, x - 2, y - 27);

        // Skull emblem with shading
        const skullGrad = ctx.createRadialGradient(x, y + 2, 0, x, y + 2, 10);
        skullGrad.addColorStop(0, this._lighten(c.accentColor, 0.2));
        skullGrad.addColorStop(1, this._darken(c.accentColor, 0.15));
        ctx.fillStyle = skullGrad;
        ctx.beginPath(); ctx.arc(x, y + 2, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(x - 4, y - 1, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 4, y - 1, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 1, y + 3, 2, 3);
        ctx.fillStyle = '#ddd';
        for (let i = -4; i <= 4; i += 2) {
            ctx.fillRect(x + i - 1, y + 7, 2, 3);
        }

        // Flame decals
        ctx.fillStyle = c.stripeColor;
        ctx.beginPath();
        ctx.moveTo(x - 34, y + 12);
        ctx.lineTo(x - 28, y - 2);
        ctx.lineTo(x - 32, y + 4);
        ctx.lineTo(x - 24, y - 8);
        ctx.lineTo(x - 30, y + 0);
        ctx.lineTo(x - 34, y + 4);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 34, y + 12);
        ctx.lineTo(x + 28, y - 2);
        ctx.lineTo(x + 32, y + 4);
        ctx.lineTo(x + 24, y - 8);
        ctx.lineTo(x + 30, y + 0);
        ctx.lineTo(x + 34, y + 4);
        ctx.closePath();
        ctx.fill();

        // Taillights with glow
        this._glowTaillightRound(ctx, x - 28, y + 12, 4);
        this._glowTaillightRound(ctx, x + 28, y + 12, 4);

        // Exhaust
        this._drawExhaust(ctx, x, y + 18, 5);
    },

    // --- PORSCHE 911 TURBO: wide hips, whale tail, round taillights ---
    _drawPorsche911(ctx, x, y, c) {
        this._drawShadow(ctx, x, y + 22, 44, 10);
        this._draw3DTire(ctx, x - 44, y - 8, 11, 28);
        this._draw3DTire(ctx, x + 33, y - 8, 11, 28);

        // Body with gradient — curves
        ctx.fillStyle = this._bodyGrad(ctx, x, y - 44, y + 18, c.bodyColor);
        ctx.beginPath();
        ctx.moveTo(x - 38, y + 18);
        ctx.lineTo(x - 40, y - 6);
        ctx.bezierCurveTo(x - 42, y - 20, x - 36, y - 36, x - 20, y - 44);
        ctx.lineTo(x + 20, y - 44);
        ctx.bezierCurveTo(x + 36, y - 36, x + 42, y - 20, x + 40, y - 6);
        ctx.lineTo(x + 38, y + 18);
        ctx.closePath();
        ctx.fill();

        // Hip highlights (characteristic 911 wide hips)
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.ellipse(x - 32, y - 10, 8, 18, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 32, y - 10, 8, 18, -0.1, 0, Math.PI * 2);
        ctx.fill();

        // Side edge darkening
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.moveTo(x - 38, y + 18);
        ctx.lineTo(x - 40, y - 6);
        ctx.bezierCurveTo(x - 42, y - 16, x - 40, y - 28, x - 30, y - 38);
        ctx.lineTo(x - 26, y - 36);
        ctx.bezierCurveTo(x - 36, y - 26, x - 38, y - 14, x - 36, y - 4);
        ctx.lineTo(x - 34, y + 18);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 38, y + 18);
        ctx.lineTo(x + 40, y - 6);
        ctx.bezierCurveTo(x + 42, y - 16, x + 40, y - 28, x + 30, y - 38);
        ctx.lineTo(x + 26, y - 36);
        ctx.bezierCurveTo(x + 36, y - 26, x + 38, y - 14, x + 36, y - 4);
        ctx.lineTo(x + 34, y + 18);
        ctx.closePath();
        ctx.fill();

        // Specular sweep across body
        this._specHighlight(ctx, x, y - 18, 28, 5);

        // Edge highlight
        ctx.strokeStyle = this._lighten(c.bodyColor, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 20, y - 44);
        ctx.lineTo(x + 20, y - 44);
        ctx.stroke();

        // Whale tail spoiler with 3D depth
        const spoilerGrad = ctx.createLinearGradient(x, y - 50, x, y - 44);
        spoilerGrad.addColorStop(0, this._lighten(c.stripeColor, 0.3));
        spoilerGrad.addColorStop(1, this._darken(c.stripeColor, 0.2));
        ctx.fillStyle = spoilerGrad;
        ctx.beginPath();
        ctx.moveTo(x - 42, y - 44);
        ctx.lineTo(x - 40, y - 50);
        ctx.lineTo(x + 40, y - 50);
        ctx.lineTo(x + 42, y - 44);
        ctx.closePath();
        ctx.fill();
        // Spoiler underside (dark)
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x - 38, y - 44, 76, 2);
        // Spoiler supports
        ctx.fillStyle = this._darken(c.bodyColor, 0.15);
        ctx.fillRect(x - 20, y - 46, 4, 6);
        ctx.fillRect(x + 16, y - 46, 4, 6);

        // Rear window with reflection
        ctx.fillStyle = this._windowGrad(ctx, x, y - 40, y - 28);
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 40);
        ctx.quadraticCurveTo(x, y - 44, x + 16, y - 40);
        ctx.lineTo(x + 14, y - 28);
        ctx.lineTo(x - 14, y - 28);
        ctx.closePath();
        ctx.fill();
        this._windowReflection(ctx, x - 12, y - 38, x - 2, y - 30);

        // Rear panel accent
        const panelGrad = ctx.createLinearGradient(x - 10, y, x + 10, y);
        panelGrad.addColorStop(0, this._darken(c.stripeColor, 0.1));
        panelGrad.addColorStop(0.5, this._lighten(c.stripeColor, 0.15));
        panelGrad.addColorStop(1, this._darken(c.stripeColor, 0.1));
        ctx.fillStyle = panelGrad;
        ctx.fillRect(x - 10, y + 2, 20, 4);

        // Round taillights with glow (iconic 911)
        this._glowTaillightRound(ctx, x - 28, y + 4, 6);
        this._glowTaillightRound(ctx, x + 28, y + 4, 6);
        // Thin LED strip connecting the taillights (modern 911 feature)
        ctx.save();
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#dd2222';
        ctx.fillRect(x - 22, y + 3, 44, 2);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,150,150,0.3)';
        ctx.fillRect(x - 20, y + 3.5, 40, 1);

        // Bumper
        this._drawBumper(ctx, x - 32, y + 14, 64, 5);

        // License plate
        ctx.fillStyle = '#eee';
        ctx.fillRect(x - 10, y + 10, 20, 7);
        ctx.fillStyle = '#333';
        ctx.font = 'bold 6px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('911', x, y + 16);

        // Side accent lines
        ctx.strokeStyle = c.accentColor;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 38, y); ctx.lineTo(x - 30, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 38, y); ctx.lineTo(x + 30, y); ctx.stroke();
    },

    // --- PORSCHE DAKAR: raised 911, roof basket, full-width LED bar, black cladding ---
    _drawDakar(ctx, x, y, c) {
        this._drawShadow(ctx, x, y + 24, 52, 10);

        // Chunky off-road tires
        this._drawWheel(ctx, x - 52, y - 10, 16, 32);
        this._drawWheel(ctx, x + 36, y - 10, 16, 32);
        // Tire tread marks
        ctx.fillStyle = '#555';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(x - 50, y - 6 + i * 7, 12, 2);
            ctx.fillRect(x + 38, y - 6 + i * 7, 12, 2);
        }

        // Body with gradient — 911 curves
        ctx.fillStyle = this._bodyGrad(ctx, x, y - 44, y + 16, c.bodyColor);
        ctx.beginPath();
        ctx.moveTo(x - 38, y + 16);
        ctx.lineTo(x - 40, y - 6);
        ctx.bezierCurveTo(x - 42, y - 22, x - 36, y - 36, x - 20, y - 44);
        ctx.lineTo(x + 20, y - 44);
        ctx.bezierCurveTo(x + 36, y - 36, x + 42, y - 22, x + 40, y - 6);
        ctx.lineTo(x + 38, y + 16);
        ctx.closePath();
        ctx.fill();

        this._specHighlight(ctx, x, y - 16, 28, 5);

        // Black plastic fender flares (wider, more prominent Dakar cladding)
        ctx.fillStyle = c.accentColor; // #1a1a1a black cladding
        ctx.beginPath();
        ctx.moveTo(x - 40, y + 16);
        ctx.quadraticCurveTo(x - 54, y + 0, x - 42, y - 16);
        ctx.lineTo(x - 38, y - 16);
        ctx.quadraticCurveTo(x - 46, y + 0, x - 36, y + 16);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 40, y + 16);
        ctx.quadraticCurveTo(x + 54, y + 0, x + 42, y - 16);
        ctx.lineTo(x + 38, y - 16);
        ctx.quadraticCurveTo(x + 46, y + 0, x + 36, y + 16);
        ctx.closePath();
        ctx.fill();

        // Black lower cladding (bottom section of rear)
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.moveTo(x - 36, y + 16);
        ctx.lineTo(x - 34, y + 4);
        ctx.lineTo(x + 34, y + 4);
        ctx.lineTo(x + 36, y + 16);
        ctx.closePath();
        ctx.fill();

        // Roof basket frame (proper cargo rack with cross-bars)
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 20, y - 54, 40, 8);
        // Cross bars
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 54); ctx.lineTo(x - 10, y - 46);
        ctx.moveTo(x, y - 54); ctx.lineTo(x, y - 46);
        ctx.moveTo(x + 10, y - 54); ctx.lineTo(x + 10, y - 46);
        ctx.stroke();
        // Rack supports
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 18, y - 46); ctx.lineTo(x - 16, y - 44);
        ctx.moveTo(x + 18, y - 46); ctx.lineTo(x + 16, y - 44);
        ctx.stroke();

        // Rally lights on rack with glow
        ctx.save();
        ctx.shadowColor = '#f1c40f';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath(); ctx.arc(x - 8, y - 50, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y - 50, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 8, y - 50, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#fffbe6';
        ctx.beginPath(); ctx.arc(x - 8, y - 50, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y - 50, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 8, y - 50, 1.5, 0, Math.PI * 2); ctx.fill();

        // Rear window with reflection
        ctx.fillStyle = this._windowGrad(ctx, x, y - 40, y - 26);
        ctx.beginPath();
        ctx.moveTo(x - 14, y - 40);
        ctx.quadraticCurveTo(x, y - 44, x + 14, y - 40);
        ctx.lineTo(x + 12, y - 26);
        ctx.lineTo(x - 12, y - 26);
        ctx.closePath();
        ctx.fill();
        this._windowReflection(ctx, x - 10, y - 38, x - 2, y - 28);

        // "PORSCHE" text across rear (iconic feature)
        ctx.fillStyle = c.stripeColor; // silver
        ctx.font = 'bold 7px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PORSCHE', x, y - 17);

        // === FULL-WIDTH LED TAILLIGHT BAR ===
        // THE defining rear feature of the Dakar — connects left to right
        ctx.save();
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 12;
        const barGrad = ctx.createLinearGradient(x - 34, y, x + 34, y);
        barGrad.addColorStop(0, '#cc0000');
        barGrad.addColorStop(0.15, '#ff2222');
        barGrad.addColorStop(0.5, '#ff4444');
        barGrad.addColorStop(0.85, '#ff2222');
        barGrad.addColorStop(1, '#cc0000');
        ctx.fillStyle = barGrad;
        ctx.fillRect(x - 34, y - 10, 68, 4);
        ctx.restore();
        // Bright center glow line
        ctx.fillStyle = 'rgba(255,180,180,0.5)';
        ctx.fillRect(x - 30, y - 9, 60, 2);

        // Diffuser with oval exhaust cutouts
        const diffGrad = ctx.createLinearGradient(x, y + 12, x, y + 20);
        diffGrad.addColorStop(0, '#333');
        diffGrad.addColorStop(1, '#111');
        ctx.fillStyle = diffGrad;
        ctx.fillRect(x - 30, y + 12, 60, 8);
        // Oval exhaust cutouts
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(x - 14, y + 16, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 14, y + 16, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Chrome exhaust trim
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x - 14, y + 16, 6, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + 14, y + 16, 6, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
    },

    // --- DEORA II: tall wedge, surfboard, wide glass ---
    _drawDeora(ctx, x, y, c) {
        this._drawShadow(ctx, x, y + 22, 42, 10);
        this._draw3DTire(ctx, x - 42, y - 6, 11, 26);
        this._draw3DTire(ctx, x + 31, y - 6, 11, 26);

        // Tall wedge body with gradient — smooth curves
        ctx.fillStyle = this._bodyGrad(ctx, x, y - 46, y + 18, c.bodyColor);
        ctx.beginPath();
        ctx.moveTo(x - 34, y + 18);
        ctx.bezierCurveTo(x - 36, y + 8, x - 37, y + 0, x - 36, y - 4);
        ctx.bezierCurveTo(x - 37, y - 12, x - 38, y - 18, x - 38, y - 22);
        ctx.bezierCurveTo(x - 36, y - 34, x - 34, y - 42, x - 32, y - 46);
        ctx.lineTo(x + 32, y - 46);
        ctx.bezierCurveTo(x + 34, y - 42, x + 36, y - 34, x + 38, y - 22);
        ctx.bezierCurveTo(x + 38, y - 18, x + 37, y - 12, x + 36, y - 4);
        ctx.bezierCurveTo(x + 37, y + 0, x + 36, y + 8, x + 34, y + 18);
        ctx.closePath();
        ctx.fill();

        // Side edge shading
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.moveTo(x - 34, y + 18);
        ctx.lineTo(x - 36, y - 4);
        ctx.lineTo(x - 38, y - 22);
        ctx.lineTo(x - 32, y - 46);
        ctx.lineTo(x - 28, y - 44);
        ctx.lineTo(x - 34, y - 20);
        ctx.lineTo(x - 32, y - 2);
        ctx.lineTo(x - 30, y + 18);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 34, y + 18);
        ctx.lineTo(x + 36, y - 4);
        ctx.lineTo(x + 38, y - 22);
        ctx.lineTo(x + 32, y - 46);
        ctx.lineTo(x + 28, y - 44);
        ctx.lineTo(x + 34, y - 20);
        ctx.lineTo(x + 32, y - 2);
        ctx.lineTo(x + 30, y + 18);
        ctx.closePath();
        ctx.fill();

        this._specHighlight(ctx, x, y - 20, 24, 5);

        // Big rear hatch glass with tinted reflection
        const glassGrad = ctx.createLinearGradient(x, y - 42, x, y - 10);
        glassGrad.addColorStop(0, '#1a4060');
        glassGrad.addColorStop(0.3, '#2a6080');
        glassGrad.addColorStop(0.7, '#3a7090');
        glassGrad.addColorStop(1, '#2a5070');
        ctx.fillStyle = glassGrad;
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 42);
        ctx.lineTo(x + 24, y - 42);
        ctx.lineTo(x + 28, y - 10);
        ctx.lineTo(x - 28, y - 10);
        ctx.closePath();
        ctx.fill();
        // Glass divider
        ctx.strokeStyle = this._darken(c.bodyColor, 0.1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 42);
        ctx.lineTo(x, y - 10);
        ctx.stroke();
        // Glass reflection
        ctx.strokeStyle = 'rgba(150,200,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 20, y - 40);
        ctx.lineTo(x - 14, y - 14);
        ctx.stroke();

        // Surfboard with gradient
        const sbGrad = ctx.createLinearGradient(x + 10, y, x + 14, y);
        sbGrad.addColorStop(0, this._darken(c.accentColor, 0.1));
        sbGrad.addColorStop(0.5, this._lighten(c.accentColor, 0.2));
        sbGrad.addColorStop(1, this._darken(c.accentColor, 0.1));
        ctx.fillStyle = sbGrad;
        ctx.beginPath();
        ctx.moveTo(x + 10, y - 46);
        ctx.lineTo(x + 12, y - 68);
        ctx.lineTo(x + 14, y - 46);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = c.stripeColor;
        ctx.fillRect(x + 11, y - 62, 2, 14);

        // Accent swoosh with gradient
        const swooshGrad = this._bodyGrad(ctx, x, y + 0, y + 12, c.accentColor);
        ctx.fillStyle = swooshGrad;
        ctx.beginPath();
        ctx.moveTo(x - 34, y + 8);
        ctx.quadraticCurveTo(x, y + 0, x + 34, y + 8);
        ctx.lineTo(x + 34, y + 12);
        ctx.quadraticCurveTo(x, y + 4, x - 34, y + 12);
        ctx.closePath();
        ctx.fill();

        // Taillights with glow (vertical)
        this._glowTaillight(ctx, x - 34, y + 2, 5, 12);
        this._glowTaillight(ctx, x + 29, y + 2, 5, 12);

        // Bumper
        this._drawBumper(ctx, x - 28, y + 15, 56, 4);
    },

    // --- NIGHT SHIFTER: ultra-low, wide, angular, neon ---
    _drawNightShifter(ctx, x, y, c) {
        this._drawShadow(ctx, x, y + 22, 48, 10);
        this._draw3DTire(ctx, x - 48, y - 4, 12, 24);
        this._draw3DTire(ctx, x + 36, y - 4, 12, 24);

        // Ultra-low body with gradient — angular but flowing
        ctx.fillStyle = this._bodyGrad(ctx, x, y - 34, y + 18, c.bodyColor);
        ctx.beginPath();
        ctx.moveTo(x - 42, y + 18);
        ctx.bezierCurveTo(x - 44, y + 8, x - 45, y + 0, x - 44, y - 2);
        ctx.bezierCurveTo(x - 42, y - 12, x - 40, y - 18, x - 38, y - 22);
        ctx.bezierCurveTo(x - 32, y - 28, x - 26, y - 32, x - 20, y - 34);
        ctx.lineTo(x + 20, y - 34);
        ctx.bezierCurveTo(x + 26, y - 32, x + 32, y - 28, x + 38, y - 22);
        ctx.bezierCurveTo(x + 40, y - 18, x + 42, y - 12, x + 44, y - 2);
        ctx.bezierCurveTo(x + 45, y + 0, x + 44, y + 8, x + 42, y + 18);
        ctx.closePath();
        ctx.fill();

        // Side edge darkening
        this._sideShade(ctx, x, y, -42, -44, -38, -20, 18, -2, -22);
        this._sideShade(ctx, x, y, 42, 44, 38, 20, 18, -2, -22);

        this._specHighlight(ctx, x, y - 12, 30, 4);

        // Spoiler with 3D depth
        const spoilerGrad = ctx.createLinearGradient(x, y - 42, x, y - 34);
        spoilerGrad.addColorStop(0, this._lighten(c.accentColor, 0.25));
        spoilerGrad.addColorStop(1, this._darken(c.accentColor, 0.15));
        ctx.fillStyle = spoilerGrad;
        ctx.beginPath();
        ctx.moveTo(x - 44, y - 34);
        ctx.lineTo(x - 42, y - 42);
        ctx.lineTo(x + 42, y - 42);
        ctx.lineTo(x + 44, y - 34);
        ctx.closePath();
        ctx.fill();
        // Spoiler underside
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x - 40, y - 34, 80, 2);
        // End plates
        ctx.fillStyle = '#222';
        ctx.fillRect(x - 44, y - 42, 4, 10);
        ctx.fillRect(x + 40, y - 42, 4, 10);

        // Angular window
        ctx.fillStyle = this._windowGrad(ctx, x, y - 31, y - 22);
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 31);
        ctx.lineTo(x + 16, y - 31);
        ctx.lineTo(x + 12, y - 22);
        ctx.lineTo(x - 12, y - 22);
        ctx.closePath();
        ctx.fill();

        // Neon accent lines with double glow (outer soft glow + inner bright)
        ctx.save();
        ctx.strokeStyle = c.stripeColor;
        ctx.lineWidth = 4;
        ctx.shadowColor = c.stripeColor;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(x - 36, y + 4);
        ctx.lineTo(x + 36, y + 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - 18);
        ctx.lineTo(x - 30, y + 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - 18);
        ctx.lineTo(x + 30, y + 0);
        ctx.stroke();
        // Second pass — bright core
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#aaffcc';
        ctx.beginPath();
        ctx.moveTo(x - 34, y + 4);
        ctx.lineTo(x + 34, y + 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - 17);
        ctx.lineTo(x - 28, y + 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - 17);
        ctx.lineTo(x + 28, y + 0);
        ctx.stroke();
        ctx.restore();

        // LED strip taillights with glow
        ctx.save();
        ctx.shadowColor = c.accentColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(x - 40, y + 8, 18, 3);
        ctx.fillRect(x + 22, y + 8, 18, 3);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,200,255,0.4)';
        ctx.fillRect(x - 38, y + 9, 14, 1);
        ctx.fillRect(x + 24, y + 9, 14, 1);

        // Diffuser with depth
        const diffGrad = ctx.createLinearGradient(x, y + 14, x, y + 19);
        diffGrad.addColorStop(0, '#444');
        diffGrad.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = diffGrad;
        ctx.fillRect(x - 32, y + 14, 64, 5);
        ctx.fillStyle = '#111';
        for (let i = -2; i <= 2; i++) {
            ctx.fillRect(x + i * 12, y + 14, 2, 5);
        }

        // Quad exhaust
        this._drawExhaust(ctx, x - 14, y + 18, 3);
        this._drawExhaust(ctx, x - 6, y + 18, 3);
        this._drawExhaust(ctx, x + 6, y + 18, 3);
        this._drawExhaust(ctx, x + 14, y + 18, 3);
    },

    // --- UNICORN: side-profile, rainbow mane & tail, golden horn ---
    _drawUnicorn(ctx, x, y, c) {
        const rainbow = ['#e74c3c','#f39c12','#f1c40f','#2ecc71','#3498db','#9b59b6'];
        this._drawShadow(ctx, x, y + 22, 48, 9);

        // === LEGS ===
        // Back legs (darker, behind body)
        const legGrad1 = ctx.createLinearGradient(x + 5, y, x + 35, y);
        legGrad1.addColorStop(0, '#e8e8e8');
        legGrad1.addColorStop(1, '#ccc');
        ctx.fillStyle = legGrad1;
        ctx.beginPath();
        ctx.moveTo(x + 14, y + 4); ctx.lineTo(x + 10, y + 20); ctx.lineTo(x + 8, y + 20);
        ctx.quadraticCurveTo(x + 6, y + 22, x + 9, y + 22); ctx.lineTo(x + 15, y + 22);
        ctx.quadraticCurveTo(x + 17, y + 22, x + 16, y + 20); ctx.lineTo(x + 20, y + 4);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 24, y + 4); ctx.lineTo(x + 28, y + 12); ctx.lineTo(x + 22, y + 20);
        ctx.lineTo(x + 20, y + 20); ctx.quadraticCurveTo(x + 18, y + 22, x + 21, y + 22);
        ctx.lineTo(x + 27, y + 22); ctx.quadraticCurveTo(x + 29, y + 22, x + 28, y + 20);
        ctx.lineTo(x + 34, y + 10); ctx.lineTo(x + 30, y + 4);
        ctx.closePath(); ctx.fill();

        // Front legs (lighter)
        const legGrad2 = ctx.createLinearGradient(x - 38, y, x - 2, y);
        legGrad2.addColorStop(0, '#f8f8f8');
        legGrad2.addColorStop(1, '#e8e8e8');
        ctx.fillStyle = legGrad2;
        ctx.beginPath();
        ctx.moveTo(x - 18, y + 4); ctx.lineTo(x - 28, y + 14); ctx.lineTo(x - 34, y + 20);
        ctx.lineTo(x - 36, y + 20); ctx.quadraticCurveTo(x - 38, y + 22, x - 35, y + 22);
        ctx.lineTo(x - 29, y + 22); ctx.quadraticCurveTo(x - 27, y + 22, x - 28, y + 20);
        ctx.lineTo(x - 22, y + 12); ctx.lineTo(x - 14, y + 4);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - 8, y + 4); ctx.lineTo(x - 10, y + 20); ctx.lineTo(x - 12, y + 20);
        ctx.quadraticCurveTo(x - 14, y + 22, x - 11, y + 22); ctx.lineTo(x - 5, y + 22);
        ctx.quadraticCurveTo(x - 3, y + 22, x - 4, y + 20); ctx.lineTo(x - 2, y + 4);
        ctx.closePath(); ctx.fill();

        // Hooves with golden gradient
        const hoofGrad = ctx.createLinearGradient(x, y + 20, x, y + 23);
        hoofGrad.addColorStop(0, '#e8c430');
        hoofGrad.addColorStop(1, '#a07818');
        ctx.fillStyle = hoofGrad;
        ctx.fillRect(x + 8, y + 20, 8, 3);
        ctx.fillRect(x + 20, y + 20, 8, 3);
        ctx.fillRect(x - 36, y + 20, 8, 3);
        ctx.fillRect(x - 12, y + 20, 8, 3);

        // === BODY with pearly gradient ===
        const bodyGrad = ctx.createLinearGradient(x, y - 22, x, y + 8);
        bodyGrad.addColorStop(0, '#ffffff');
        bodyGrad.addColorStop(0.4, '#f8f0ff');
        bodyGrad.addColorStop(0.7, '#f0e8f8');
        bodyGrad.addColorStop(1, '#e0d8e8');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 4);
        ctx.quadraticCurveTo(x - 30, y - 16, x - 24, y - 28);
        ctx.quadraticCurveTo(x - 14, y - 18, x + 0, y - 20);
        ctx.quadraticCurveTo(x + 16, y - 22, x + 30, y - 14);
        ctx.quadraticCurveTo(x + 36, y - 6, x + 32, y + 6);
        ctx.lineTo(x + 14, y + 6);
        ctx.quadraticCurveTo(x + 0, y + 8, x - 14, y + 6);
        ctx.lineTo(x - 24, y - 4);
        ctx.closePath();
        ctx.fill();

        // Muscle shading
        ctx.fillStyle = 'rgba(180,160,200,0.08)';
        ctx.beginPath();
        ctx.ellipse(x + 20, y - 6, 14, 10, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x - 10, y - 6, 10, 8, -0.1, 0, Math.PI * 2);
        ctx.fill();
        // Belly shadow
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.beginPath();
        ctx.ellipse(x + 4, y + 4, 24, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Back highlight
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.ellipse(x, y - 20, 20, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // === RAINBOW TAIL ===
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (let i = 0; i < rainbow.length; i++) {
            ctx.strokeStyle = rainbow[i];
            ctx.beginPath();
            const offset = i * 2.5;
            ctx.moveTo(x + 30, y - 12 + offset);
            ctx.quadraticCurveTo(x + 44, y - 20 + offset + i * 1.5, x + 52, y - 30 + offset + i * 3);
            ctx.stroke();
        }
        ctx.lineWidth = 4;
        for (let i = 0; i < 3; i++) {
            ctx.strokeStyle = rainbow[i * 2];
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.moveTo(x + 30, y - 10 + i * 4);
            ctx.quadraticCurveTo(x + 42, y - 14 + i * 5, x + 50, y - 24 + i * 7);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
        ctx.lineCap = 'butt';

        // === NECK with gradient ===
        const neckGrad = ctx.createLinearGradient(x - 30, y, x - 18, y);
        neckGrad.addColorStop(0, '#f0e8f0');
        neckGrad.addColorStop(1, '#ffffff');
        ctx.fillStyle = neckGrad;
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 28);
        ctx.quadraticCurveTo(x - 30, y - 40, x - 28, y - 52);
        ctx.lineTo(x - 22, y - 56);
        ctx.quadraticCurveTo(x - 18, y - 44, x - 20, y - 26);
        ctx.closePath();
        ctx.fill();

        // === HEAD with gradient ===
        ctx.fillStyle = neckGrad;
        ctx.beginPath();
        ctx.moveTo(x - 22, y - 56);
        ctx.quadraticCurveTo(x - 24, y - 66, x - 20, y - 70);
        ctx.quadraticCurveTo(x - 14, y - 72, x - 10, y - 68);
        ctx.lineTo(x - 10, y - 64);
        ctx.quadraticCurveTo(x - 8, y - 58, x - 10, y - 54);
        ctx.quadraticCurveTo(x - 14, y - 50, x - 18, y - 52);
        ctx.lineTo(x - 22, y - 56);
        ctx.closePath();
        ctx.fill();

        // Nostril
        ctx.fillStyle = '#ffcccc';
        ctx.beginPath(); ctx.arc(x - 10, y - 55, 1.5, 0, Math.PI * 2); ctx.fill();

        // Eye with depth
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(x - 16, y - 63, 3, 3.5, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2c1a4a';
        ctx.beginPath(); ctx.ellipse(x - 16, y - 63, 2.5, 3, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x - 15.5, y - 64, 1, 0, Math.PI * 2); ctx.fill();

        // Ear
        ctx.fillStyle = '#f0f0f0';
        ctx.beginPath();
        ctx.moveTo(x - 20, y - 70); ctx.lineTo(x - 18, y - 78); ctx.lineTo(x - 16, y - 70);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffb6c1';
        ctx.beginPath();
        ctx.moveTo(x - 19, y - 71); ctx.lineTo(x - 18, y - 76); ctx.lineTo(x - 17, y - 71);
        ctx.closePath(); ctx.fill();

        // === HORN with golden gradient ===
        const hornGrad = ctx.createLinearGradient(x - 18, y - 72, x - 14, y - 72);
        hornGrad.addColorStop(0, '#c4971a');
        hornGrad.addColorStop(0.3, '#f5d442');
        hornGrad.addColorStop(0.7, '#e8c430');
        hornGrad.addColorStop(1, '#b08518');
        ctx.fillStyle = hornGrad;
        ctx.beginPath();
        ctx.moveTo(x - 18, y - 72);
        ctx.lineTo(x - 14, y - 94);
        ctx.lineTo(x - 14, y - 72);
        ctx.closePath();
        ctx.fill();
        // Spiral grooves
        ctx.strokeStyle = '#a07818';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) {
            const hy = y - 74 - i * 4;
            ctx.beginPath();
            ctx.moveTo(x - 18 + i * 0.6, hy);
            ctx.lineTo(x - 14 - i * 0.1, hy);
            ctx.stroke();
        }
        // Horn sparkle with glow
        ctx.save();
        ctx.shadowColor = '#fffbe6';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#fffbe6';
        ctx.beginPath(); ctx.arc(x - 15, y - 90, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // === RAINBOW MANE ===
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        for (let i = 0; i < rainbow.length; i++) {
            ctx.strokeStyle = rainbow[i];
            ctx.beginPath();
            const offset = i * 2;
            ctx.moveTo(x - 20 + offset * 0.3, y - 68 + offset);
            ctx.quadraticCurveTo(x - 28 - i * 1.5, y - 56 + offset, x - 26 - i * 0.8, y - 42 + offset * 1.5);
            ctx.stroke();
        }
        ctx.lineWidth = 2.5;
        for (let i = 0; i < rainbow.length; i++) {
            ctx.strokeStyle = rainbow[i];
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            const offset = i * 2;
            ctx.moveTo(x - 24 - i * 0.5, y - 50 + offset);
            ctx.quadraticCurveTo(x - 32 - i, y - 40 + offset, x - 28 - i * 0.5, y - 30 + offset * 1.2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
        ctx.lineCap = 'butt';

        // === SPARKLES with glow ===
        ctx.save();
        ctx.shadowColor = '#f1c40f';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#f1c40f';
        const sparkles = [
            [x - 36, y - 60], [x + 38, y - 30], [x - 6, y - 80],
            [x + 20, y - 32], [x - 40, y - 34], [x + 46, y - 18],
        ];
        for (const [sx, sy] of sparkles) {
            ctx.beginPath();
            ctx.moveTo(sx, sy - 3); ctx.lineTo(sx + 1, sy - 1);
            ctx.lineTo(sx + 3, sy); ctx.lineTo(sx + 1, sy + 1);
            ctx.lineTo(sx, sy + 3); ctx.lineTo(sx - 1, sy + 1);
            ctx.lineTo(sx - 3, sy); ctx.lineTo(sx - 1, sy - 1);
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    },

    // --- GENERIC fallback ---
    _drawGeneric(ctx, x, y, c) {
        this._drawShadow(ctx, x, y + 22, 44, 10);
        this._draw3DTire(ctx, x - 44, y - 8, 11, 28);
        this._draw3DTire(ctx, x + 33, y - 8, 11, 28);

        ctx.fillStyle = this._bodyGrad(ctx, x, y - 44, y + 18, c.bodyColor);
        ctx.beginPath();
        ctx.moveTo(x - 36, y + 18);
        ctx.bezierCurveTo(x - 38, y + 6, x - 39, y - 2, x - 38, y - 8);
        ctx.bezierCurveTo(x - 36, y - 20, x - 32, y - 30, x - 28, y - 36);
        ctx.bezierCurveTo(x - 24, y - 40, x - 20, y - 43, x - 16, y - 44);
        ctx.lineTo(x + 16, y - 44);
        ctx.bezierCurveTo(x + 20, y - 43, x + 24, y - 40, x + 28, y - 36);
        ctx.bezierCurveTo(x + 32, y - 30, x + 36, y - 20, x + 38, y - 8);
        ctx.bezierCurveTo(x + 39, y - 2, x + 38, y + 6, x + 36, y + 18);
        ctx.closePath();
        ctx.fill();

        this._sideShade(ctx, x, y, -36, -38, -28, -16, 18, -8, -36);
        this._sideShade(ctx, x, y, 36, 38, 28, 16, 18, -8, -36);
        this._specHighlight(ctx, x, y - 18, 24, 5);

        ctx.fillStyle = this._windowGrad(ctx, x, y - 40, y - 28);
        ctx.beginPath();
        ctx.moveTo(x - 14, y - 40);
        ctx.lineTo(x + 14, y - 40);
        ctx.lineTo(x + 12, y - 28);
        ctx.lineTo(x - 12, y - 28);
        ctx.closePath();
        ctx.fill();

        const sg = ctx.createLinearGradient(x - 2, y, x + 2, y);
        sg.addColorStop(0, this._darken(c.stripeColor, 0.15));
        sg.addColorStop(0.5, this._lighten(c.stripeColor, 0.2));
        sg.addColorStop(1, this._darken(c.stripeColor, 0.15));
        ctx.fillStyle = sg;
        ctx.fillRect(x - 2, y - 44, 4, 60);

        this._glowTaillight(ctx, x - 32, y + 4, 12, 6);
        this._glowTaillight(ctx, x + 20, y + 4, 12, 6);
        this._drawBumper(ctx, x - 30, y + 14, 60, 5);
    },

    // =====================================================
    // 3D RENDERING HELPERS
    // =====================================================

    _parseHex(hex) {
        return [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16),
        ];
    },

    _lighten(hex, amt) {
        const [r, g, b] = this._parseHex(hex);
        return `rgb(${Math.min(255, Math.round(r + (255 - r) * amt))},${Math.min(255, Math.round(g + (255 - g) * amt))},${Math.min(255, Math.round(b + (255 - b) * amt))})`;
    },

    _darken(hex, amt) {
        const [r, g, b] = this._parseHex(hex);
        return `rgb(${Math.round(r * (1 - amt))},${Math.round(g * (1 - amt))},${Math.round(b * (1 - amt))})`;
    },

    _bodyGrad(ctx, x, y1, y2, color) {
        const g = ctx.createLinearGradient(x, y1, x, y2);
        g.addColorStop(0, this._lighten(color, 0.3));
        g.addColorStop(0.3, this._lighten(color, 0.1));
        g.addColorStop(0.6, color);
        g.addColorStop(1, this._darken(color, 0.35));
        return g;
    },

    _windowGrad(ctx, x, y1, y2) {
        const g = ctx.createLinearGradient(x, y1, x, y2);
        g.addColorStop(0, '#0d1525');
        g.addColorStop(0.3, '#1a3555');
        g.addColorStop(0.65, '#2a5575');
        g.addColorStop(1, '#1a2a3a');
        return g;
    },

    _windowReflection(ctx, x1, y1, x2, y2) {
        ctx.strokeStyle = 'rgba(150,200,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    },

    _drawShadow(ctx, x, y, rx, ry) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
        g.addColorStop(0, 'rgba(0,0,0,0.4)');
        g.addColorStop(0.6, 'rgba(0,0,0,0.15)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    _drawWheel(ctx, x, y, w, h) {
        const cx = x + w / 2;
        const cy = y + h / 2;

        // Tire rubber — rounded rectangle
        const tireGrad = ctx.createLinearGradient(x, y, x + w, y);
        tireGrad.addColorStop(0, '#080808');
        tireGrad.addColorStop(0.15, '#1a1a1a');
        tireGrad.addColorStop(0.5, '#252525');
        tireGrad.addColorStop(0.85, '#1a1a1a');
        tireGrad.addColorStop(1, '#080808');
        ctx.fillStyle = tireGrad;
        const rr = Math.min(w * 0.35, 4);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
        ctx.fill();

        // Rim face (visible alloy wheel within the tire)
        const rimR = w / 2 - 1.5;
        const rimGrad = ctx.createRadialGradient(cx - 0.5, cy - 1, 0, cx, cy, rimR);
        rimGrad.addColorStop(0, '#bbb');
        rimGrad.addColorStop(0.35, '#999');
        rimGrad.addColorStop(0.75, '#666');
        rimGrad.addColorStop(1, '#444');
        ctx.fillStyle = rimGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, rimR, 0, Math.PI * 2);
        ctx.fill();

        // 5-spoke pattern
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const spokeR = rimR * 0.85;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * 1.5, cy + Math.sin(angle) * 1.5);
            ctx.lineTo(cx + Math.cos(angle) * spokeR, cy + Math.sin(angle) * spokeR);
            ctx.stroke();
        }

        // Center hub cap
        ctx.fillStyle = '#ddd';
        ctx.beginPath();
        ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
        ctx.fill();
    },

    // Keep old name as alias for backwards compat
    _draw3DTire(ctx, x, y, w, h) {
        this._drawWheel(ctx, x, y, w, h);
    },

    _specHighlight(ctx, x, y, w, h) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    _sideShade(ctx, x, y, bot, mid1, shoulder, roof, botY, midY, shoulderY) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        const sign = Math.sign(bot);
        ctx.beginPath();
        ctx.moveTo(x + bot, y + botY);
        ctx.lineTo(x + mid1, y + midY);
        ctx.lineTo(x + shoulder, y + shoulderY);
        ctx.lineTo(x + shoulder + sign * (-4), y + shoulderY + 2);
        ctx.lineTo(x + mid1 + sign * (-4), y + midY + 2);
        ctx.lineTo(x + bot + sign * (-4), y + botY);
        ctx.closePath();
        ctx.fill();
    },

    _glowTaillight(ctx, x, y, w, h) {
        ctx.save();
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ee3333';
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        // Bright center
        ctx.fillStyle = 'rgba(255,180,180,0.5)';
        ctx.fillRect(x + 2, y + 1, w - 4, h - 2);
    },

    _glowTaillightRound(ctx, x, y, r) {
        ctx.save();
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ee3333';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ff8888';
        ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fill();
    },

    _drawBumper(ctx, x, y, w, h) {
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, '#555');
        g.addColorStop(0.5, '#333');
        g.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
    },

    _drawExhaust(ctx, x, y, r) {
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, '#111');
        g.addColorStop(0.6, '#222');
        g.addColorStop(1, '#666');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.fill();
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
