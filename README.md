# Arkham Asylum - FPS Prison Webapp

A browser-based first-person shooter webapp built with Three.js, featuring a 3D prison environment with Doom-style sprite NPCs.

## Features

- **3D Prison Environment**: Procedurally generated prison with corridors, cells, and bars
- **First-Person Controls**: PointerLockControls with WASD movement and mouse look
- **Collision Detection**: Sphere-based collision system prevents walking through walls
- **Doom-Style NPCs**: 2D sprite NPCs that billboard to face the camera (Y-axis rotation only)
- **NPC Patrol**: NPCs walk back and forth along patrol routes
- **Atmospheric Lighting**: Dim overhead lights and fog for a prison-like atmosphere

## How to Run

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   - The app will automatically open in your default browser
   - Or navigate to `http://localhost:3000`

4. **Controls:**
   - **Click** anywhere on the screen to lock the pointer
   - **WASD** - Move around
   - **Mouse** - Look around
   - **ESC** - Unlock pointer

## Project Structure

```
ArkhamAsylum/
├── index.html          # Main HTML file
├── package.json        # Dependencies and scripts
├── vite.config.js      # Vite configuration
└── src/
    ├── main.js         # Main entry point, wires everything together
    ├── prison.js       # Prison geometry and colliders
    ├── player.js       # Player controls, movement, and collision
    └── npc.js          # NPC sprite class with billboard rotation
```

## Technical Details

- **Framework**: Vanilla JavaScript with Three.js
- **Build Tool**: Vite
- **Collision**: Sphere-based collision detection with AABB (Axis-Aligned Bounding Box) colliders
- **Billboarding**: Manual Y-axis rotation calculation using `atan2(dx, dz)`
- **NPC Sprites**: Procedurally generated using Canvas API
# MDCBrooklynChatroom
