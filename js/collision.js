// collision.js — Crash detection
// Checks if the car has hit scenery, hazards, or gone too far off road

const Collision = {
    // Check all possible collisions for the current frame
    check(car, road, canvas) {
        if (car.crashed) return null;
        if (car.invincibleTimer > 0) return null;

        const segment = road.getSegment(car.position);
        if (!segment) return null;

        // === Off-road barrier crash ===
        // If you go way off the road, you hit the barriers
        if (Math.abs(car.x) > 2.5) {
            const severity = car.speedMPH > 80 ? 'explode' : 'spin';
            return { type: 'barrier', severity };
        }

        // === Hazard collision ===
        if (segment.hazard) {
            const hazard = segment.hazard;
            const carLane = car.x;
            const distance = Math.abs(carLane - hazard.lane);

            if (distance < hazard.width + 0.15) {
                // Hit the hazard!
                if (car.speedMPH > 100) {
                    return { type: hazard.type, severity: 'explode' };
                } else if (car.speedMPH > 40) {
                    return { type: hazard.type, severity: 'spin' };
                }
                // At very low speed, just nudge through
            }
        }

        // === Scenery collision ===
        // Check if car overlaps with roadside objects
        const carWidth = 0.15; // Car width in road coordinates
        if (segment.sceneryLeft) {
            const objX = segment.sceneryLeft.offset;
            if (Math.abs(car.x - objX) < carWidth + 0.2) {
                if (car.speedMPH > 60) {
                    return { type: 'scenery', severity: 'explode' };
                } else if (car.speedMPH > 20) {
                    return { type: 'scenery', severity: 'spin' };
                }
            }
        }
        if (segment.sceneryRight) {
            const objX = segment.sceneryRight.offset;
            if (Math.abs(car.x - objX) < carWidth + 0.2) {
                if (car.speedMPH > 60) {
                    return { type: 'scenery', severity: 'explode' };
                } else if (car.speedMPH > 20) {
                    return { type: 'scenery', severity: 'spin' };
                }
            }
        }

        return null;
    },
};
