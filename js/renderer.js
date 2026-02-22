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
        // Dense starfield for Rainbow Road's night sky
        ctx.fillStyle = '#ffffff';
        // Use seeded positions so stars don't flicker
        for (let i = 0; i < 80; i++) {
            const sx = (Math.sin(i * 127.1) * 0.5 + 0.5) * w;
            const sy = (Math.sin(i * 311.7) * 0.5 + 0.5) * (h / 2 - 20);
            const size = (Math.sin(i * 73.3) * 0.5 + 0.5) * 2 + 0.5;
            ctx.globalAlpha = 0.4 + (Math.sin(i * 43.7) * 0.5 + 0.5) * 0.6;
            ctx.beginPath();
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
            ctx.fill();
        }
        // A few brighter colored stars
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
    // CAR SPRITES — Rear view (what you see from behind)
    //
    // Coordinate system: (0,0) = center of car
    //   -y = top of screen (roof)
    //   +y = bottom of screen (bumper, closest to viewer)
    //   -x = left, +x = right
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

    // --- TWIN MILL: wide muscle car, twin hood scoops visible above roof ---
    _drawTwinMill(ctx, x, y, c) {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(x, y + 22, 44, 8, 0, 0, Math.PI * 2); ctx.fill();

        // Rear tires (wide, visible from behind)
        ctx.fillStyle = '#222';
        ctx.fillRect(x - 46, y - 10, 12, 30);
        ctx.fillRect(x + 34, y - 10, 12, 30);
        // Tire highlight
        ctx.fillStyle = '#444';
        ctx.fillRect(x - 44, y - 8, 3, 26);
        ctx.fillRect(x + 43, y - 8, 3, 26);

        // Main body — wide muscle car rear
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 38, y + 18);     // bottom-left
        ctx.lineTo(x - 40, y - 8);      // left side
        ctx.lineTo(x - 36, y - 30);     // left shoulder
        ctx.lineTo(x - 22, y - 42);     // roof-left
        ctx.lineTo(x + 22, y - 42);     // roof-right
        ctx.lineTo(x + 36, y - 30);     // right shoulder
        ctx.lineTo(x + 40, y - 8);      // right side
        ctx.lineTo(x + 38, y + 18);     // bottom-right
        ctx.closePath();
        ctx.fill();

        // Rear window
        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath();
        ctx.moveTo(x - 18, y - 38);
        ctx.lineTo(x - 14, y - 28);
        ctx.lineTo(x + 14, y - 28);
        ctx.lineTo(x + 18, y - 38);
        ctx.closePath();
        ctx.fill();

        // Twin engine scoops above the roofline
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(x - 14, y - 52, 10, 12);
        ctx.fillRect(x + 4, y - 52, 10, 12);
        // Scoop intakes (dark slots)
        ctx.fillStyle = '#111';
        ctx.fillRect(x - 12, y - 52, 6, 4);
        ctx.fillRect(x + 6, y - 52, 6, 4);

        // Gold racing stripe (center, vertical)
        ctx.fillStyle = c.stripeColor;
        ctx.fillRect(x - 2, y - 42, 4, 58);

        // Rear bumper
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 34, y + 14, 68, 6);

        // Taillights — wide rectangular
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(x - 34, y + 4, 14, 8);
        ctx.fillRect(x + 20, y + 4, 14, 8);

        // Exhaust pipes
        ctx.fillStyle = '#666';
        ctx.beginPath(); ctx.arc(x - 12, y + 18, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 12, y + 18, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(x - 12, y + 18, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 12, y + 18, 2.5, 0, Math.PI * 2); ctx.fill();
    },

    // --- BONE SHAKER: hot rod, exposed engine above cab, skull on rear ---
    _drawBoneShaker(ctx, x, y, c) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(x, y + 22, 44, 8, 0, 0, Math.PI * 2); ctx.fill();

        // Fat rear tires
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 48, y - 12, 14, 32);
        ctx.fillRect(x + 34, y - 12, 14, 32);
        ctx.fillStyle = '#555';
        ctx.fillRect(x - 46, y - 10, 3, 28);
        ctx.fillRect(x + 45, y - 10, 3, 28);

        // Body — boxy hot rod rear, narrower than tires
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 34, y + 18);
        ctx.lineTo(x - 36, y - 8);
        ctx.lineTo(x - 30, y - 28);
        ctx.lineTo(x - 18, y - 36);     // chopped roof
        ctx.lineTo(x + 18, y - 36);
        ctx.lineTo(x + 30, y - 28);
        ctx.lineTo(x + 36, y - 8);
        ctx.lineTo(x + 34, y + 18);
        ctx.closePath();
        ctx.fill();

        // Exposed engine block (tall, above the roof)
        ctx.fillStyle = '#777';
        ctx.fillRect(x - 10, y - 52, 20, 18);
        // Intake stacks
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(x - 8, y - 58, 5, 8);
        ctx.fillRect(x - 1, y - 58, 5, 8);
        ctx.fillRect(x + 6, y - 58, 5, 8);
        // Valve covers
        ctx.fillStyle = '#555';
        ctx.fillRect(x - 9, y - 42, 18, 3);

        // Chopped rear window (short)
        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(x - 14, y - 33, 28, 8);

        // Skull emblem on rear panel
        ctx.fillStyle = c.accentColor;
        ctx.beginPath(); ctx.arc(x, y + 2, 10, 0, Math.PI * 2); ctx.fill();
        // Eyes
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(x - 4, y - 1, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 4, y - 1, 3, 0, Math.PI * 2); ctx.fill();
        // Nose
        ctx.fillRect(x - 1, y + 3, 2, 3);
        // Teeth
        ctx.fillStyle = '#ddd';
        for (let i = -4; i <= 4; i += 2) {
            ctx.fillRect(x + i - 1, y + 7, 2, 3);
        }

        // Flame decals on fenders
        ctx.fillStyle = c.stripeColor;
        // Left
        ctx.beginPath();
        ctx.moveTo(x - 34, y + 12);
        ctx.lineTo(x - 28, y - 2);
        ctx.lineTo(x - 32, y + 4);
        ctx.lineTo(x - 24, y - 8);
        ctx.lineTo(x - 30, y + 0);
        ctx.lineTo(x - 34, y + 4);
        ctx.closePath();
        ctx.fill();
        // Right
        ctx.beginPath();
        ctx.moveTo(x + 34, y + 12);
        ctx.lineTo(x + 28, y - 2);
        ctx.lineTo(x + 32, y + 4);
        ctx.lineTo(x + 24, y - 8);
        ctx.lineTo(x + 30, y + 0);
        ctx.lineTo(x + 34, y + 4);
        ctx.closePath();
        ctx.fill();

        // Taillights — small round
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.arc(x - 28, y + 12, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 28, y + 12, 4, 0, Math.PI * 2); ctx.fill();

        // Big single exhaust
        ctx.fillStyle = '#666';
        ctx.beginPath(); ctx.arc(x, y + 18, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(x, y + 18, 3, 0, Math.PI * 2); ctx.fill();
    },

    // --- PORSCHE 911 TURBO: wide hips, whale tail spoiler, round taillights ---
    _drawPorsche911(ctx, x, y, c) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(x, y + 22, 42, 8, 0, 0, Math.PI * 2); ctx.fill();

        // Rear tires
        ctx.fillStyle = '#222';
        ctx.fillRect(x - 44, y - 8, 11, 28);
        ctx.fillRect(x + 33, y - 8, 11, 28);

        // Body — wide hips tapering to narrower roof (911 rear shape)
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 38, y + 18);
        ctx.lineTo(x - 40, y - 6);
        ctx.bezierCurveTo(x - 42, y - 20, x - 36, y - 36, x - 20, y - 44);
        ctx.lineTo(x + 20, y - 44);
        ctx.bezierCurveTo(x + 36, y - 36, x + 42, y - 20, x + 40, y - 6);
        ctx.lineTo(x + 38, y + 18);
        ctx.closePath();
        ctx.fill();

        // Whale tail spoiler
        ctx.fillStyle = c.stripeColor;
        ctx.beginPath();
        ctx.moveTo(x - 42, y - 44);
        ctx.lineTo(x - 40, y - 50);
        ctx.lineTo(x + 40, y - 50);
        ctx.lineTo(x + 42, y - 44);
        ctx.closePath();
        ctx.fill();
        // Spoiler supports
        ctx.fillStyle = c.bodyColor;
        ctx.fillRect(x - 20, y - 46, 4, 6);
        ctx.fillRect(x + 16, y - 46, 4, 6);

        // Rear window (wide, curved)
        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 40);
        ctx.quadraticCurveTo(x, y - 44, x + 16, y - 40);
        ctx.lineTo(x + 14, y - 28);
        ctx.lineTo(x - 14, y - 28);
        ctx.closePath();
        ctx.fill();

        // Rear panel center (between taillights)
        ctx.fillStyle = c.stripeColor;
        ctx.fillRect(x - 10, y + 2, 20, 4);

        // Round taillights (iconic 911)
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.arc(x - 28, y + 4, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 28, y + 4, 6, 0, Math.PI * 2); ctx.fill();
        // Inner ring
        ctx.fillStyle = '#cc2222';
        ctx.beginPath(); ctx.arc(x - 28, y + 4, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 28, y + 4, 3.5, 0, Math.PI * 2); ctx.fill();

        // Rear bumper
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 32, y + 14, 64, 5);

        // License plate
        ctx.fillStyle = '#eee';
        ctx.fillRect(x - 10, y + 10, 20, 7);
        ctx.fillStyle = '#333';
        ctx.font = 'bold 6px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('911', x, y + 16);

        // Side accent line
        ctx.strokeStyle = c.accentColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 38, y + 0);
        ctx.lineTo(x - 30, y + 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 38, y + 0);
        ctx.lineTo(x + 30, y + 0);
        ctx.stroke();
    },

    // --- PORSCHE DAKAR: raised 911 rear, roof rack + lights, fender flares ---
    _drawDakar(ctx, x, y, c) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(x, y + 22, 46, 8, 0, 0, Math.PI * 2); ctx.fill();

        // Chunky rally tires (wider)
        ctx.fillStyle = '#444';
        ctx.fillRect(x - 48, y - 10, 14, 30);
        ctx.fillRect(x + 34, y - 10, 14, 30);
        // Tread pattern
        ctx.fillStyle = '#666';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(x - 46, y - 6 + i * 7, 10, 2);
            ctx.fillRect(x + 36, y - 6 + i * 7, 10, 2);
        }

        // Body — like the 911 but raised, with fender flares
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 36, y + 16);
        ctx.lineTo(x - 38, y - 8);
        ctx.bezierCurveTo(x - 40, y - 22, x - 34, y - 36, x - 18, y - 44);
        ctx.lineTo(x + 18, y - 44);
        ctx.bezierCurveTo(x + 34, y - 36, x + 40, y - 22, x + 38, y - 8);
        ctx.lineTo(x + 36, y + 16);
        ctx.closePath();
        ctx.fill();

        // Fender flares (bulging out beyond body)
        ctx.fillStyle = c.accentColor;
        ctx.beginPath();
        ctx.moveTo(x - 38, y + 16);
        ctx.quadraticCurveTo(x - 48, y + 0, x - 38, y - 14);
        ctx.lineTo(x - 36, y - 14);
        ctx.quadraticCurveTo(x - 42, y + 0, x - 36, y + 16);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 38, y + 16);
        ctx.quadraticCurveTo(x + 48, y + 0, x + 38, y - 14);
        ctx.lineTo(x + 36, y - 14);
        ctx.quadraticCurveTo(x + 42, y + 0, x + 36, y + 16);
        ctx.closePath();
        ctx.fill();

        // Roof rack with rally lights
        ctx.fillStyle = '#555';
        ctx.fillRect(x - 18, y - 48, 36, 3);
        ctx.fillRect(x - 16, y - 52, 3, 6);
        ctx.fillRect(x + 13, y - 52, 3, 6);
        // Three rally lights
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath(); ctx.arc(x - 8, y - 50, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y - 50, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 8, y - 50, 3.5, 0, Math.PI * 2); ctx.fill();

        // Rear window
        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath();
        ctx.moveTo(x - 14, y - 40);
        ctx.quadraticCurveTo(x, y - 44, x + 14, y - 40);
        ctx.lineTo(x + 12, y - 28);
        ctx.lineTo(x - 12, y - 28);
        ctx.closePath();
        ctx.fill();

        // Number plate (on rear)
        ctx.fillStyle = c.stripeColor;
        ctx.fillRect(x - 8, y + 0, 16, 10);
        ctx.fillStyle = c.accentColor;
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('53', x, y + 8);

        // Taillights
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.arc(x - 26, y + 4, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 26, y + 4, 5, 0, Math.PI * 2); ctx.fill();

        // Skid plate
        ctx.fillStyle = '#888';
        ctx.fillRect(x - 24, y + 16, 48, 3);
    },

    // --- DEORA II: tall wedge from behind, surfboard, wide glass ---
    _drawDeora(ctx, x, y, c) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(x, y + 22, 40, 8, 0, 0, Math.PI * 2); ctx.fill();

        // Rear tires
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 42, y - 6, 11, 26);
        ctx.fillRect(x + 31, y - 6, 11, 26);

        // Tall wedge body — wider at top, narrower at bottom
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 34, y + 18);
        ctx.lineTo(x - 36, y - 4);
        ctx.lineTo(x - 38, y - 22);
        ctx.lineTo(x - 32, y - 46);     // tall!
        ctx.lineTo(x + 32, y - 46);
        ctx.lineTo(x + 38, y - 22);
        ctx.lineTo(x + 36, y - 4);
        ctx.lineTo(x + 34, y + 18);
        ctx.closePath();
        ctx.fill();

        // Big rear hatch glass (Deora's signature — huge rear window)
        ctx.fillStyle = '#2a5a7a';
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 42);
        ctx.lineTo(x + 24, y - 42);
        ctx.lineTo(x + 28, y - 10);
        ctx.lineTo(x - 28, y - 10);
        ctx.closePath();
        ctx.fill();
        // Glass center divider
        ctx.strokeStyle = c.bodyColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 42);
        ctx.lineTo(x, y - 10);
        ctx.stroke();

        // Surfboard sticking up from bed (behind the cab)
        ctx.fillStyle = c.accentColor;
        ctx.beginPath();
        ctx.moveTo(x + 10, y - 46);
        ctx.lineTo(x + 12, y - 68);
        ctx.lineTo(x + 14, y - 46);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = c.stripeColor;
        ctx.fillRect(x + 11, y - 62, 2, 14);

        // Accent swoosh across rear
        ctx.fillStyle = c.accentColor;
        ctx.beginPath();
        ctx.moveTo(x - 34, y + 8);
        ctx.quadraticCurveTo(x, y + 0, x + 34, y + 8);
        ctx.lineTo(x + 34, y + 12);
        ctx.quadraticCurveTo(x, y + 4, x - 34, y + 12);
        ctx.closePath();
        ctx.fill();

        // Taillights (vertical strips on sides)
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(x - 34, y + 2, 5, 12);
        ctx.fillRect(x + 29, y + 2, 5, 12);

        // Bumper
        ctx.fillStyle = '#555';
        ctx.fillRect(x - 28, y + 15, 56, 4);
    },

    // --- NIGHT SHIFTER: ultra-low, wide, angular, neon accents ---
    _drawNightShifter(ctx, x, y, c) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(x, y + 22, 46, 8, 0, 0, Math.PI * 2); ctx.fill();

        // Low-profile tires
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x - 48, y - 4, 12, 24);
        ctx.fillRect(x + 36, y - 4, 12, 24);

        // Ultra-wide, ultra-low body
        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 42, y + 18);
        ctx.lineTo(x - 44, y - 2);
        ctx.lineTo(x - 38, y - 22);
        ctx.lineTo(x - 20, y - 34);     // low roof
        ctx.lineTo(x + 20, y - 34);
        ctx.lineTo(x + 38, y - 22);
        ctx.lineTo(x + 44, y - 2);
        ctx.lineTo(x + 42, y + 18);
        ctx.closePath();
        ctx.fill();

        // Big angular rear spoiler
        ctx.fillStyle = c.accentColor;
        ctx.beginPath();
        ctx.moveTo(x - 44, y - 34);
        ctx.lineTo(x - 42, y - 42);
        ctx.lineTo(x + 42, y - 42);
        ctx.lineTo(x + 44, y - 34);
        ctx.closePath();
        ctx.fill();
        // Spoiler end plates
        ctx.fillStyle = '#222';
        ctx.fillRect(x - 44, y - 42, 4, 10);
        ctx.fillRect(x + 40, y - 42, 4, 10);

        // Angular rear window (narrow slit)
        ctx.fillStyle = '#0a0a1a';
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 31);
        ctx.lineTo(x + 16, y - 31);
        ctx.lineTo(x + 12, y - 22);
        ctx.lineTo(x - 12, y - 22);
        ctx.closePath();
        ctx.fill();

        // Neon accent lines (the glow!)
        ctx.strokeStyle = c.stripeColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = c.stripeColor;
        ctx.shadowBlur = 8;
        // Horizontal light bar across rear
        ctx.beginPath();
        ctx.moveTo(x - 36, y + 4);
        ctx.lineTo(x + 36, y + 4);
        ctx.stroke();
        // V-shaped accent on body
        ctx.beginPath();
        ctx.moveTo(x, y - 18);
        ctx.lineTo(x - 30, y + 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y - 18);
        ctx.lineTo(x + 30, y + 0);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Taillights — long thin LED strips
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(x - 40, y + 8, 18, 3);
        ctx.fillRect(x + 22, y + 8, 18, 3);

        // Diffuser (bottom)
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 32, y + 14, 64, 5);
        // Diffuser fins
        ctx.fillStyle = '#222';
        for (let i = -2; i <= 2; i++) {
            ctx.fillRect(x + i * 12, y + 14, 2, 5);
        }

        // Quad exhaust
        ctx.fillStyle = '#555';
        ctx.beginPath(); ctx.arc(x - 14, y + 18, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x - 6, y + 18, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 6, y + 18, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 14, y + 18, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(x - 14, y + 18, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x - 6, y + 18, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 6, y + 18, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 14, y + 18, 1.5, 0, Math.PI * 2); ctx.fill();
    },

    // --- UNICORN: full side-profile, rainbow mane & tail, golden horn ---
    _drawUnicorn(ctx, x, y, c) {
        const rainbow = ['#e74c3c','#f39c12','#f1c40f','#2ecc71','#3498db','#9b59b6'];

        // Shadow on ground
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(x, y + 22, 46, 7, 0, 0, Math.PI * 2); ctx.fill();

        // === LEGS (back pair slightly behind, front pair in front) ===
        // Back legs (darker, behind body)
        ctx.fillStyle = '#ddd';
        // Back-left leg
        ctx.beginPath();
        ctx.moveTo(x + 14, y + 4);
        ctx.lineTo(x + 10, y + 20);
        ctx.lineTo(x + 8, y + 20);
        ctx.quadraticCurveTo(x + 6, y + 22, x + 9, y + 22);
        ctx.lineTo(x + 15, y + 22);
        ctx.quadraticCurveTo(x + 17, y + 22, x + 16, y + 20);
        ctx.lineTo(x + 20, y + 4);
        ctx.closePath();
        ctx.fill();
        // Back-right leg (slightly bent — galloping pose)
        ctx.beginPath();
        ctx.moveTo(x + 24, y + 4);
        ctx.lineTo(x + 28, y + 12);
        ctx.lineTo(x + 22, y + 20);
        ctx.lineTo(x + 20, y + 20);
        ctx.quadraticCurveTo(x + 18, y + 22, x + 21, y + 22);
        ctx.lineTo(x + 27, y + 22);
        ctx.quadraticCurveTo(x + 29, y + 22, x + 28, y + 20);
        ctx.lineTo(x + 34, y + 10);
        ctx.lineTo(x + 30, y + 4);
        ctx.closePath();
        ctx.fill();

        // Front legs (lighter, in front)
        ctx.fillStyle = '#f0f0f0';
        // Front-left leg (reaching forward — gallop)
        ctx.beginPath();
        ctx.moveTo(x - 18, y + 4);
        ctx.lineTo(x - 28, y + 14);
        ctx.lineTo(x - 34, y + 20);
        ctx.lineTo(x - 36, y + 20);
        ctx.quadraticCurveTo(x - 38, y + 22, x - 35, y + 22);
        ctx.lineTo(x - 29, y + 22);
        ctx.quadraticCurveTo(x - 27, y + 22, x - 28, y + 20);
        ctx.lineTo(x - 22, y + 12);
        ctx.lineTo(x - 14, y + 4);
        ctx.closePath();
        ctx.fill();
        // Front-right leg
        ctx.beginPath();
        ctx.moveTo(x - 8, y + 4);
        ctx.lineTo(x - 10, y + 20);
        ctx.lineTo(x - 12, y + 20);
        ctx.quadraticCurveTo(x - 14, y + 22, x - 11, y + 22);
        ctx.lineTo(x - 5, y + 22);
        ctx.quadraticCurveTo(x - 3, y + 22, x - 4, y + 20);
        ctx.lineTo(x - 2, y + 4);
        ctx.closePath();
        ctx.fill();

        // Hooves (gold)
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(x + 8, y + 20, 8, 3);
        ctx.fillRect(x + 20, y + 20, 8, 3);
        ctx.fillRect(x - 36, y + 20, 8, 3);
        ctx.fillRect(x - 12, y + 20, 8, 3);

        // === BODY (muscular horse torso — side profile) ===
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 4);   // chest
        ctx.quadraticCurveTo(x - 30, y - 16, x - 24, y - 28); // neck-chest curve
        ctx.quadraticCurveTo(x - 14, y - 18, x + 0, y - 20);  // top of back
        ctx.quadraticCurveTo(x + 16, y - 22, x + 30, y - 14);  // rump curve
        ctx.quadraticCurveTo(x + 36, y - 6, x + 32, y + 6);   // hindquarters
        ctx.lineTo(x + 14, y + 6);                              // belly back
        ctx.quadraticCurveTo(x + 0, y + 8, x - 14, y + 6);    // belly
        ctx.lineTo(x - 24, y - 4);                              // close at chest
        ctx.closePath();
        ctx.fill();

        // Subtle muscle shading
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath();
        ctx.ellipse(x + 20, y - 6, 14, 10, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x - 10, y - 6, 10, 8, -0.1, 0, Math.PI * 2);
        ctx.fill();

        // === RAINBOW TAIL (flowing behind — multiple colored strands) ===
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (let i = 0; i < rainbow.length; i++) {
            ctx.strokeStyle = rainbow[i];
            ctx.beginPath();
            const offset = i * 2.5;
            ctx.moveTo(x + 30, y - 12 + offset);
            ctx.quadraticCurveTo(
                x + 44, y - 20 + offset + i * 1.5,
                x + 52, y - 30 + offset + i * 3
            );
            ctx.stroke();
        }
        // Thicker base strands for volume
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

        // === NECK ===
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 28);   // base of neck at body
        ctx.quadraticCurveTo(x - 30, y - 40, x - 28, y - 52);  // back of neck
        ctx.lineTo(x - 22, y - 56);                              // top of neck
        ctx.quadraticCurveTo(x - 18, y - 44, x - 20, y - 26);  // front of neck
        ctx.closePath();
        ctx.fill();

        // === HEAD (side profile — horse head shape) ===
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x - 22, y - 56);   // back of head
        ctx.quadraticCurveTo(x - 24, y - 66, x - 20, y - 70);  // top of head (poll)
        ctx.quadraticCurveTo(x - 14, y - 72, x - 10, y - 68);  // forehead
        ctx.lineTo(x - 10, y - 64);                              // bridge of nose
        ctx.quadraticCurveTo(x - 8, y - 58, x - 10, y - 54);   // nostril area
        ctx.quadraticCurveTo(x - 14, y - 50, x - 18, y - 52);  // jaw
        ctx.lineTo(x - 22, y - 56);
        ctx.closePath();
        ctx.fill();

        // Nostril
        ctx.fillStyle = '#ffcccc';
        ctx.beginPath(); ctx.arc(x - 10, y - 55, 1.5, 0, Math.PI * 2); ctx.fill();

        // Eye
        ctx.fillStyle = '#2c1a4a';
        ctx.beginPath(); ctx.ellipse(x - 16, y - 63, 2.5, 3, 0.2, 0, Math.PI * 2); ctx.fill();
        // Eye highlight
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x - 15.5, y - 64, 1, 0, Math.PI * 2); ctx.fill();

        // Ear
        ctx.fillStyle = '#f0f0f0';
        ctx.beginPath();
        ctx.moveTo(x - 20, y - 70);
        ctx.lineTo(x - 18, y - 78);
        ctx.lineTo(x - 16, y - 70);
        ctx.closePath();
        ctx.fill();
        // Inner ear (pink)
        ctx.fillStyle = '#ffb6c1';
        ctx.beginPath();
        ctx.moveTo(x - 19, y - 71);
        ctx.lineTo(x - 18, y - 76);
        ctx.lineTo(x - 17, y - 71);
        ctx.closePath();
        ctx.fill();

        // === HORN (golden, spiraling) ===
        ctx.fillStyle = c.accentColor;
        ctx.beginPath();
        ctx.moveTo(x - 18, y - 72);
        ctx.lineTo(x - 14, y - 94);  // tip
        ctx.lineTo(x - 14, y - 72);
        ctx.closePath();
        ctx.fill();
        // Spiral grooves on horn
        ctx.strokeStyle = '#c4971a';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) {
            const hy = y - 74 - i * 4;
            const hw = 2 - i * 0.3;
            ctx.beginPath();
            ctx.moveTo(x - 18 + i * 0.6, hy);
            ctx.lineTo(x - 14 - i * 0.1, hy);
            ctx.stroke();
        }
        // Horn sparkle
        ctx.fillStyle = '#fffbe6';
        ctx.beginPath(); ctx.arc(x - 15, y - 90, 1.5, 0, Math.PI * 2); ctx.fill();

        // === RAINBOW MANE (flowing down neck — multiple colors) ===
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        for (let i = 0; i < rainbow.length; i++) {
            ctx.strokeStyle = rainbow[i];
            ctx.beginPath();
            const offset = i * 2;
            ctx.moveTo(x - 20 + offset * 0.3, y - 68 + offset);
            ctx.quadraticCurveTo(
                x - 28 - i * 1.5, y - 56 + offset,
                x - 26 - i * 0.8, y - 42 + offset * 1.5
            );
            ctx.stroke();
        }
        // Second wave of mane strands (further down neck)
        ctx.lineWidth = 2.5;
        for (let i = 0; i < rainbow.length; i++) {
            ctx.strokeStyle = rainbow[i];
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            const offset = i * 2;
            ctx.moveTo(x - 24 - i * 0.5, y - 50 + offset);
            ctx.quadraticCurveTo(
                x - 32 - i, y - 40 + offset,
                x - 28 - i * 0.5, y - 30 + offset * 1.2
            );
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
        ctx.lineCap = 'butt';

        // === SPARKLES around the unicorn ===
        ctx.fillStyle = '#f1c40f';
        const sparkles = [
            [x - 36, y - 60], [x + 38, y - 30], [x - 6, y - 80],
            [x + 20, y - 32], [x - 40, y - 34], [x + 46, y - 18],
        ];
        for (const [sx, sy] of sparkles) {
            // 4-pointed star
            ctx.beginPath();
            ctx.moveTo(sx, sy - 3);
            ctx.lineTo(sx + 1, sy - 1);
            ctx.lineTo(sx + 3, sy);
            ctx.lineTo(sx + 1, sy + 1);
            ctx.lineTo(sx, sy + 3);
            ctx.lineTo(sx - 1, sy + 1);
            ctx.lineTo(sx - 3, sy);
            ctx.lineTo(sx - 1, sy - 1);
            ctx.closePath();
            ctx.fill();
        }
    },

    // --- GENERIC fallback ---
    _drawGeneric(ctx, x, y, c) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(x, y + 22, 42, 8, 0, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#222';
        ctx.fillRect(x - 44, y - 8, 11, 28);
        ctx.fillRect(x + 33, y - 8, 11, 28);

        ctx.fillStyle = c.bodyColor;
        ctx.beginPath();
        ctx.moveTo(x - 36, y + 18);
        ctx.lineTo(x - 38, y - 8);
        ctx.lineTo(x - 28, y - 36);
        ctx.lineTo(x - 16, y - 44);
        ctx.lineTo(x + 16, y - 44);
        ctx.lineTo(x + 28, y - 36);
        ctx.lineTo(x + 38, y - 8);
        ctx.lineTo(x + 36, y + 18);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath();
        ctx.moveTo(x - 14, y - 40);
        ctx.lineTo(x + 14, y - 40);
        ctx.lineTo(x + 12, y - 28);
        ctx.lineTo(x - 12, y - 28);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = c.stripeColor;
        ctx.fillRect(x - 2, y - 44, 4, 60);

        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(x - 32, y + 4, 12, 6);
        ctx.fillRect(x + 20, y + 4, 12, 6);

        ctx.fillStyle = '#333';
        ctx.fillRect(x - 30, y + 14, 60, 5);
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
