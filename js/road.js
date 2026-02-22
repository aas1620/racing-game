// road.js — Road/track geometry
// The road is a long list of "segments" — think of each one as a thin horizontal stripe.
// Each segment knows: how curvy is the road here? Is it going uphill or downhill?

const Road = {
    segments: [],
    segmentLength: 200,    // How "deep" each stripe is in world units
    totalSegments: 0,
    trackLength: 0,

    // Build a road from a track definition
    build(trackDef) {
        this.segments = [];

        // A track definition is a list of sections like:
        // { enter: 20, hold: 50, leave: 20, curve: 2, hill: 0 }
        // "enter" = gradually increase the curve over N segments
        // "hold" = maintain that curve for N segments
        // "leave" = gradually decrease back to straight over N segments
        // "curve" = how sharp (positive = right, negative = left)
        // "hill" = how steep (positive = up, negative = down)

        for (const section of trackDef.sections) {
            const enter = section.enter || 0;
            const hold = section.hold || 0;
            const leave = section.leave || 0;
            const curve = section.curve || 0;
            const hill = section.hill || 0;
            const total = enter + hold + leave;

            for (let i = 0; i < total; i++) {
                let c, h;
                if (i < enter) {
                    // Easing into the curve
                    const t = i / enter;
                    c = curve * t;
                    h = hill * t;
                } else if (i < enter + hold) {
                    // Full curve
                    c = curve;
                    h = hill;
                } else {
                    // Easing out
                    const t = 1 - (i - enter - hold) / leave;
                    c = curve * t;
                    h = hill * t;
                }
                this.segments.push({
                    curve: c,
                    hill: h,
                    index: this.segments.length,
                });
            }
        }

        this.totalSegments = this.segments.length;
        this.trackLength = this.totalSegments * this.segmentLength;

        // Store track colors and info
        this.colors = trackDef.colors;
        this.name = trackDef.name;
        this.rainbowRoad = trackDef.rainbowRoad || false;
        this.rainbowColors = trackDef.rainbowColors || [];
        this.sceneryTypes = trackDef.sceneryTypes || [];
        this.hazards = trackDef.hazards || [];

        // Place scenery along the road
        this.placeScenery(trackDef);
        // Place hazards
        this.placeHazards(trackDef);
    },

    placeScenery(trackDef) {
        const types = trackDef.sceneryTypes || [];
        if (types.length === 0) return;

        for (let i = 0; i < this.totalSegments; i++) {
            this.segments[i].sceneryLeft = null;
            this.segments[i].sceneryRight = null;

            // Place scenery every ~8-15 segments with some randomness
            if (i % 4 === 0) {
                const seededRand = this.seededRandom(i * 137);
                if (seededRand > 0.3) {
                    const typeIndex = Math.floor(this.seededRandom(i * 251) * types.length);
                    const offset = 1.2 + this.seededRandom(i * 373) * 2.0;

                    // Sometimes left, sometimes right, sometimes both
                    const side = this.seededRandom(i * 491);
                    if (side < 0.4) {
                        this.segments[i].sceneryLeft = { type: types[typeIndex], offset: -offset };
                    } else if (side < 0.8) {
                        this.segments[i].sceneryRight = { type: types[typeIndex], offset: offset };
                    } else {
                        const typeIndex2 = Math.floor(this.seededRandom(i * 613) * types.length);
                        this.segments[i].sceneryLeft = { type: types[typeIndex], offset: -offset };
                        this.segments[i].sceneryRight = { type: types[typeIndex2], offset: offset * 0.9 };
                    }
                }
            }
        }
    },

    placeHazards(trackDef) {
        const hazardDefs = trackDef.hazards || [];
        if (hazardDefs.length === 0) return;

        for (const hazard of hazardDefs) {
            // Place hazard at specific segment positions
            for (const pos of hazard.positions) {
                if (pos < this.totalSegments) {
                    this.segments[pos].hazard = {
                        type: hazard.type,
                        lane: hazard.lane || 0, // -1 left, 0 center, 1 right
                        width: hazard.width || 0.3,
                    };
                }
            }
        }
    },

    // Simple seeded random for consistent scenery placement
    seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    },

    getSegment(position) {
        const index = Math.floor(position / this.segmentLength) % this.totalSegments;
        return this.segments[index < 0 ? index + this.totalSegments : index];
    },

    getSegmentByIndex(index) {
        const i = ((index % this.totalSegments) + this.totalSegments) % this.totalSegments;
        return this.segments[i];
    },
};
