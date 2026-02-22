// tracks.js — Track definitions
// Each track defines: road shape (sections), color palette, scenery, and hazards

const Tracks = [
    {
        id: 'monaco',
        name: 'Monaco Grand Prix',
        description: 'Tight hairpins through Mediterranean streets',
        type: 'asphalt',
        laps: 3,
        colors: {
            sky: '#4a90d9',
            skyHorizon: '#87CEEB',
            road: '#444444',
            roadLight: '#555555',
            rumble: '#ff0000',
            rumbleLight: '#ffffff',
            grass: '#c8b07a',        // Sandy Mediterranean ground
            grassLight: '#d4be8a',
            lane: '#ffffff',
            startLine: '#ffffff',
        },
        sections: [
            // A mix of tight turns and short straights — classic Monaco
            { enter: 10, hold: 30, leave: 10, curve: 0, hill: 0 },       // Start straight
            { enter: 10, hold: 20, leave: 10, curve: 4, hill: 0 },       // Sharp right (Ste. Devote)
            { enter: 5, hold: 15, leave: 5, curve: 0, hill: 2 },         // Uphill to Casino
            { enter: 10, hold: 10, leave: 10, curve: -3, hill: 1 },      // Left sweep uphill
            { enter: 5, hold: 20, leave: 5, curve: 0, hill: 0 },         // Casino straight
            { enter: 10, hold: 15, leave: 10, curve: 5, hill: -1 },      // Hairpin right, downhill
            { enter: 5, hold: 10, leave: 5, curve: -2, hill: -2 },       // Downhill left
            { enter: 10, hold: 5, leave: 10, curve: 0, hill: 0 },        // Short straight
            { enter: 8, hold: 20, leave: 8, curve: -4, hill: 0 },        // Tight left (Tunnel)
            { enter: 5, hold: 25, leave: 5, curve: 0, hill: 0 },         // Waterfront straight
            { enter: 10, hold: 15, leave: 10, curve: 3, hill: 0 },       // Chicane right
            { enter: 8, hold: 10, leave: 8, curve: -3, hill: 0 },        // Chicane left
            { enter: 10, hold: 20, leave: 10, curve: 2, hill: 0 },       // Sweep to finish
            { enter: 5, hold: 40, leave: 5, curve: 0, hill: 0 },         // Finish straight
        ],
        sceneryTypes: ['building', 'palm', 'barrier', 'lamppost'],
        hazards: [
            { type: 'pedestrian', positions: [180, 350], lane: 0.3, width: 0.2 },
        ],
    },
    {
        id: 'mountain',
        name: 'Mountain Pass',
        description: 'Sweeping curves through pine forests and peaks',
        type: 'asphalt',
        laps: 2,
        colors: {
            sky: '#5dade2',
            skyHorizon: '#aed6f1',
            road: '#555555',
            roadLight: '#666666',
            rumble: '#ffffff',
            rumbleLight: '#cc0000',
            grass: '#2ecc71',
            grassLight: '#27ae60',
            lane: '#eeeeee',
            startLine: '#ffffff',
        },
        sections: [
            // Big sweeping curves with lots of elevation
            { enter: 10, hold: 40, leave: 10, curve: 0, hill: 0 },       // Valley start
            { enter: 15, hold: 30, leave: 15, curve: 2, hill: 3 },       // Right uphill climb
            { enter: 10, hold: 20, leave: 10, curve: -1.5, hill: 2 },    // Left, still climbing
            { enter: 5, hold: 30, leave: 5, curve: 0, hill: 0 },         // Ridge straight
            { enter: 15, hold: 25, leave: 15, curve: -3, hill: -1 },     // Big left sweeper
            { enter: 10, hold: 10, leave: 10, curve: 3, hill: 2 },       // S-curve right, uphill
            { enter: 10, hold: 10, leave: 10, curve: -3, hill: 0 },      // S-curve left
            { enter: 10, hold: 40, leave: 10, curve: 0, hill: 3 },       // Long uphill
            { enter: 15, hold: 20, leave: 15, curve: 2, hill: 0 },       // Summit curve
            { enter: 10, hold: 30, leave: 10, curve: 0, hill: -4 },      // Big downhill!
            { enter: 15, hold: 20, leave: 15, curve: -2, hill: -2 },     // Downhill left
            { enter: 10, hold: 15, leave: 10, curve: 3, hill: -1 },      // Right into valley
            { enter: 5, hold: 50, leave: 5, curve: 0, hill: 0 },         // Valley finish straight
        ],
        sceneryTypes: ['pine', 'rock', 'guardrail', 'boulder'],
        hazards: [
            { type: 'moose', positions: [250, 420], lane: -0.2, width: 0.35 },
        ],
    },
    {
        id: 'baja',
        name: 'Baja Desert',
        description: 'Wide and wild through sand and cacti',
        type: 'offroad',
        laps: 2,
        colors: {
            sky: '#2980b9',
            skyHorizon: '#f5cba7',
            road: '#c4944a',         // Sandy dirt road
            roadLight: '#d4a45a',
            rumble: '#a0522d',
            rumbleLight: '#cd853f',
            grass: '#e8c36a',        // Desert sand
            grassLight: '#f0d080',
            lane: '#b8860b',
            startLine: '#ffffff',
        },
        sections: [
            // Wide flowing desert course with bumps
            { enter: 10, hold: 50, leave: 10, curve: 0, hill: 0 },       // Desert straight
            { enter: 20, hold: 30, leave: 20, curve: 2, hill: 1 },       // Gentle right over dune
            { enter: 10, hold: 20, leave: 10, curve: 0, hill: -1.5 },    // Dip down
            { enter: 15, hold: 25, leave: 15, curve: -2.5, hill: 0 },    // Left around mesa
            { enter: 5, hold: 10, leave: 5, curve: 0, hill: 2 },         // Jump!
            { enter: 5, hold: 10, leave: 5, curve: 0, hill: -3 },        // Landing
            { enter: 10, hold: 30, leave: 10, curve: 1.5, hill: 0 },     // Long right sweep
            { enter: 15, hold: 20, leave: 15, curve: -3, hill: 1 },      // Sharp left, uphill
            { enter: 10, hold: 40, leave: 10, curve: 0, hill: 0 },       // Dry lakebed straight
            { enter: 20, hold: 15, leave: 20, curve: 2, hill: -1 },      // Right descent
            { enter: 10, hold: 20, leave: 10, curve: -1, hill: 0.5 },    // Rolling terrain
            { enter: 5, hold: 60, leave: 5, curve: 0, hill: 0 },         // Finish straight
        ],
        sceneryTypes: ['cactus', 'rock_desert', 'tumbleweed', 'mesa'],
        hazards: [
            { type: 'rattlesnake', positions: [200, 380], lane: 0.1, width: 0.25 },
        ],
    },
];
