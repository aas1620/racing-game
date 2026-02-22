// input.js — Keyboard handling
// Tracks which keys are currently pressed so the game can check any time

const Input = {
    keys: {},

    init() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            // Prevent arrow keys from scrolling the page
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });

        // Reset all keys if window loses focus (prevents stuck keys)
        window.addEventListener('blur', () => {
            this.keys = {};
        });
    },

    isPressed(key) {
        return this.keys[key] === true;
    },

    // Convenience getters for game controls
    get up() { return this.isPressed('ArrowUp') || this.isPressed('w'); },
    get down() { return this.isPressed('ArrowDown') || this.isPressed('s'); },
    get left() { return this.isPressed('ArrowLeft') || this.isPressed('a'); },
    get right() { return this.isPressed('ArrowRight') || this.isPressed('d'); },
    get space() { return this.isPressed(' '); },
    get enter() { return this.isPressed('Enter'); },
    get escape() { return this.isPressed('Escape'); },
};
