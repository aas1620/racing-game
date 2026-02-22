// cars.js — The Hot Wheels garage
// Each car has stats from 1-10 and a color scheme for drawing

const Cars = [
    {
        id: 'twin_mill',
        name: 'Twin Mill',
        tagline: 'Classic Hot Wheels icon, twin-engine beast',
        topSpeed: 9,
        acceleration: 7,
        handling: 5,
        offRoad: 3,
        // Visual definition — colors for the polygon car drawing
        bodyColor: '#1a5276',    // Deep blue
        accentColor: '#e74c3c',  // Red engines
        stripeColor: '#f39c12',  // Gold stripe
        wheelColor: '#333',
    },
    {
        id: 'bone_shaker',
        name: 'Bone Shaker',
        tagline: 'Skull-faced hot rod, handles dirt',
        topSpeed: 7,
        acceleration: 8,
        handling: 6,
        offRoad: 7,
        bodyColor: '#2c3e50',    // Dark grey-blue
        accentColor: '#bdc3c7',  // Silver skull
        stripeColor: '#e67e22',  // Orange flames
        wheelColor: '#444',
    },
    {
        id: 'porsche_911',
        name: 'Porsche 911 Turbo',
        tagline: 'Precision machine, hates dirt',
        topSpeed: 9,
        acceleration: 6,
        handling: 9,
        offRoad: 2,
        bodyColor: '#ecf0f1',    // White
        accentColor: '#e74c3c',  // Red accents
        stripeColor: '#2c3e50',  // Dark stripe
        wheelColor: '#222',
    },
    {
        id: 'porsche_dakar',
        name: 'Porsche 911 Dakar',
        tagline: 'Rally-prepped, eats dirt for breakfast',
        topSpeed: 7,
        acceleration: 6,
        handling: 7,
        offRoad: 9,
        bodyColor: '#f39c12',    // Rally orange
        accentColor: '#2c3e50',  // Dark accents
        stripeColor: '#ecf0f1',  // White number plate
        wheelColor: '#555',
    },
    {
        id: 'deora_ii',
        name: 'Deora II',
        tagline: 'Surf wagon, good all-rounder',
        topSpeed: 6,
        acceleration: 7,
        handling: 7,
        offRoad: 5,
        bodyColor: '#27ae60',    // Surf green
        accentColor: '#f1c40f',  // Yellow
        stripeColor: '#ecf0f1',  // White
        wheelColor: '#333',
    },
    {
        id: 'night_shifter',
        name: 'Night Shifter',
        tagline: 'Fast off the line, squirrely in turns',
        topSpeed: 8,
        acceleration: 9,
        handling: 4,
        offRoad: 4,
        bodyColor: '#1a1a2e',    // Midnight purple-black
        accentColor: '#9b59b6',  // Purple glow
        stripeColor: '#00ff88',  // Neon green
        wheelColor: '#222',
    },
];
