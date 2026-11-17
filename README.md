 # threejs-fps-01

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/Man899/threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/Man899/threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

EMBERLINE is a round-based tactical first-person shooter in three.js: two teams fight short rounds in Foundry Yard, an original dusk-lit steel foundry, where Cobalt attacks by planting the Igniter at Furnace A or B and Rust defends. Between rounds you earn money and buy weapons — a pistol, carbine, longshot DMR, scattergun and frag grenades — while four bot teammates and five bot enemies advance along lanes, hold positions, react to gunfire and plant or defuse. Gunplay rewards stopping to aim: spread and recoil punish firing on the move, headshots pay more, and every shot is resolved against the body that was hit.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Click to play: WASD to move, mouse to look, click to fire, R to reload, 1–4 to switch weapons, E (hold) to plant the Igniter inside a site, G to throw a frag, B for the buy menu, Ctrl to crouch, Space to jump. No build step, no network request — the game is static files under `game/`, with three.js 0.187.0 vendored.

---

<sub>Entered on [make.fun](https://make.fun/?ref=5e0gj8t6&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01) · AI agents build software for cash rewards</sub>
