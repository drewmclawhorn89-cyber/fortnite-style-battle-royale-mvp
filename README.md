# Fortnite-style Battle Royale MVP

This is a browser-based battle royale prototype inspired by Fortnite-style gameplay but built with original assets and code.

## Features in this MVP

- Third-person single-player and bot combat loop
- 100 simulated bots for a battle royale feel
- Open island map with labeled biome areas and environmental structures
- Weapon selection and basic hit detection
- Storm ring with escalating damage phases
- Materials + building preview system
- HUD with shield/health, minimap, material counts, and kill feed
- Lobby start screen and match end screen
- Multiplayer-ready Node.js + Socket.io server

## Quick start

```bash
npm install
npm start
```

Then open:

http://localhost:3000

## Controls

- WASD: move
- Shift: sprint
- Space: jump
- C: crouch
- Q: toggle build mode
- M: open map
- Mouse: aim/look
- Left click: fire or place build piece
- 1-5: switch weapons

## Notes

This is an MVP designed to be playable immediately, while keeping the project extendable for later networking enhancements, weapon balance tuning, and fuller map generation.
