// car.js — Car physics + movement
// Handles acceleration, braking, steering, and how the car responds to the road

const Car = {
    // Position on track
    position: 0,         // How far along the road (in world units)
    x: 0,               // Lateral position (-1 = left edge, 0 = center, 1 = right edge)
    speed: 0,            // Current speed (world units per second)

    // Physics feel
    maxSpeed: 12000,     // Top speed
    accel: 8000,         // Acceleration force
    braking: 12000,      // Braking force
    decel: 5000,         // Natural deceleration (letting off gas)
    steerSpeed: 3.0,     // How fast the car turns
    centrifugal: 0.3,    // How much curves push you sideways
    offRoadDrag: 0.96,   // Speed multiplier when off road each frame

    // Visual
    tilt: 0,             // Visual tilt for steering (-1 to 1)
    bounce: 0,           // Vertical bounce amount
    bounceSpeed: 0,

    // Lateral physics
    lateralVelocity: 0,  // Lateral momentum (drift/slide)

    // State
    steering: 0,         // Current steering input (smoothed)
    crashed: false,
    crashTimer: 0,
    spinAngle: 0,
    explosionTriggered: false,
    invincibleTimer: 0,  // Brief invincibility after crash recovery
    bumpers: true,       // Bumpers mode — can't go off-road

    // Stats from selected car
    stats: null,
    trackType: 'asphalt', // Current track surface type

    init(carDef, trackType) {
        this.position = 0;
        this.x = 0;
        this.speed = 0;
        this.tilt = 0;
        this.bounce = 0;
        this.bounceSpeed = 0;
        this.steering = 0;
        this.lateralVelocity = 0;
        this.crashed = false;
        this.crashTimer = 0;
        this.spinAngle = 0;
        this.explosionTriggered = false;
        this.invincibleTimer = 0;
        this.stats = carDef;
        this.trackType = trackType || 'asphalt';

        // Scale physics to car stats (stats are 1-10)
        if (carDef) {
            const speedStat = this.getEffectiveStat('topSpeed');
            const accelStat = this.getEffectiveStat('acceleration');
            const handlingStat = this.getEffectiveStat('handling');

            this.maxSpeed = 8000 + speedStat * 800;
            this.accel = 4000 + accelStat * 800;
            this.steerSpeed = 2.0 + handlingStat * 0.3;
            this.centrifugal = 0.4 - handlingStat * 0.025;
        }
    },

    getEffectiveStat(statName) {
        if (!this.stats) return 5;
        const base = this.stats[statName] || 5;
        if (this.trackType === 'offroad') {
            const offRoad = this.stats.offRoad || 5;
            // Blend: higher off-road rating means less penalty
            const blend = offRoad / 10;
            return base * (0.5 + 0.5 * blend);
        }
        return base;
    },

    update(dt, road, input) {
        if (this.crashed) {
            this.updateCrash(dt);
            return false;
        }

        // Tick down invincibility
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= dt;
        }

        // Acceleration / braking / reverse
        if (input.up) {
            if (this.speed < 0) {
                // Pressing gas while in reverse = brake first
                this.speed += this.braking * dt;
            } else {
                this.speed += this.accel * dt;
            }
        } else if (input.down) {
            if (this.speed > 100) {
                // Braking while moving forward
                this.speed -= this.braking * dt;
            } else {
                // Stopped or slow — reverse!
                this.speed -= this.accel * 0.4 * dt;
            }
        } else {
            // Natural deceleration toward zero
            if (this.speed > 0) {
                this.speed -= this.decel * dt;
                if (this.speed < 0) this.speed = 0;
            } else if (this.speed < 0) {
                this.speed += this.decel * dt;
                if (this.speed > 0) this.speed = 0;
            }
        }

        // Clamp speed (reverse caps at 30% of max)
        const maxReverse = this.maxSpeed * 0.3;
        this.speed = Math.max(-maxReverse, Math.min(this.speed, this.maxSpeed));

        // Steering — smooth input (steering wheel doesn't snap instantly)
        const absSpeed = Math.abs(this.speed);
        const speedPercent = absSpeed / this.maxSpeed;

        let targetSteering = 0;
        if (input.left) targetSteering = -1;
        if (input.right) targetSteering = 1;
        // Steering ramps up smoothly, drops off a bit faster (letting go = snap back)
        const steerRate = targetSteering !== 0 ? 8 : 12;
        this.steering += (targetSteering - this.steering) * steerRate * dt;

        // Steering force — most effective at moderate speed
        // Low speed: builds up (need some speed to turn)
        // High speed: slight understeer (harder to turn at max speed)
        const steerCurve = speedPercent < 0.25
            ? 0.3 + speedPercent * 2.8    // 0.3 to 1.0 over 0-25% speed
            : 1.0 - Math.max(0, speedPercent - 0.7) * 0.6;  // drops from 1.0 to 0.82 above 70%
        const steerForce = this.steering * this.steerSpeed * steerCurve;

        // Centrifugal force — curves push you outward
        // Quadratic with speed: going fast through a curve is dangerous
        let curveForce = 0;
        const segment = road.getSegment(this.position);
        if (segment && absSpeed > 0) {
            curveForce = segment.curve * this.centrifugal * speedPercent * speedPercent * 3.0;
        }

        // Apply forces to lateral velocity (momentum-based movement)
        this.lateralVelocity += (steerForce + curveForce) * dt;

        // Lateral grip — dampens sideways momentum (like tire grip on asphalt)
        // Higher handling = more grip = quicker damping = tighter cornering
        const handlingStat = this.getEffectiveStat('handling');
        const gripDamping = 0.88 - (handlingStat / 10) * 0.08; // 0.80 (handling 10) to 0.87 (handling 1)
        this.lateralVelocity *= Math.pow(gripDamping, dt * 60);

        // Apply lateral velocity to position
        if (absSpeed > 10) {
            const steerDir = this.speed >= 0 ? 1 : -1;
            this.x += this.lateralVelocity * steerDir * dt;
        }

        // Cornering speed loss — tires scrub speed in hard turns
        // This makes you want to brake BEFORE curves and accelerate OUT
        const totalLateralForce = Math.abs(this.lateralVelocity);
        if (totalLateralForce > 0.5 && this.speed > 0) {
            const scrub = Math.min(0.012, (totalLateralForce - 0.5) * 0.004) * speedPercent;
            this.speed *= (1 - scrub);
        }

        // Visual tilt — based on total lateral force (steering + drift + curve)
        const totalTilt = this.steering * Math.max(0.5, speedPercent) +
            this.lateralVelocity * 0.15;  // drift adds to lean
        const clampedTilt = Math.max(-1.3, Math.min(1.3, totalTilt));
        this.tilt += (clampedTilt - this.tilt) * 10 * dt;

        // Bumpers mode — keep the car on the track
        if (this.bumpers) {
            if (Math.abs(this.x) > 1.0) {
                this.x = Math.sign(this.x) * 1.0;
                // Bounce off the wall — kill lateral velocity and lose speed
                this.lateralVelocity *= -0.3; // Bounce back
                this.speed *= 0.93;
                this.bounceSpeed += (Math.random() - 0.5) * 30;
            }
        }

        // Off-road detection (past road edges)
        const isOffRoad = Math.abs(this.x) > 1.0;
        if (isOffRoad) {
            if (this.speed > 0) {
                this.speed *= this.offRoadDrag;
            } else if (this.speed < 0) {
                this.speed *= this.offRoadDrag;
            }
            // Bounce effect on rough terrain
            this.bounceSpeed += (Math.random() - 0.5) * 50 * dt;
        }
        this.bounce += this.bounceSpeed * dt;
        this.bounceSpeed *= 0.9; // Dampen bounce
        this.bounce *= 0.9;

        // Move forward (or backward)
        this.position += this.speed * dt;

        // Wrap around track (forward)
        if (this.position >= road.trackLength) {
            this.position -= road.trackLength;
            return true; // Completed a lap!
        }
        // Wrap around track (reverse — don't go negative)
        if (this.position < 0) {
            this.position += road.trackLength;
        }

        return false;
    },

    crash(severity) {
        // severity: 'spin' or 'explode'
        this.crashed = true;
        this.crashTimer = severity === 'explode' ? 2.5 : 1.5;
        this.explosionTriggered = severity === 'explode';
        this.spinAngle = 0;
        if (severity === 'spin') {
            this.speed *= 0.3;
        } else {
            this.speed = 0;
        }
    },

    updateCrash(dt) {
        this.crashTimer -= dt;
        this.spinAngle += dt * 8;

        // Gradually drift the car back toward center during crash
        this.x *= 0.97;

        if (this.crashTimer <= 0) {
            this.crashed = false;
            this.spinAngle = 0;
            this.explosionTriggered = false;
            this.lateralVelocity = 0;
            // Respawn on the road with some speed
            if (this.speed < 1000) this.speed = 1000;
            // Make sure car is back within road boundaries
            if (Math.abs(this.x) > 0.8) {
                this.x = Math.sign(this.x) * 0.6;
            }
            // Brief invincibility so you don't instantly re-crash
            this.invincibleTimer = 1.0;
        }
    },

    get speedMPH() {
        // Convert game speed to a human-readable MPH (absolute value)
        return Math.round(Math.abs(this.speed) / 80);
    },
};
