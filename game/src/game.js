// The match: one state machine for the whole game — menu, buy phase, live round,
// round end, match end — with money, the objective and the score in one place. It
// owns no rendering and no input; main.js feeds it ticks and reads its events out.
// Cobalt (the player's team) attacks: plant the Igniter at Furnace A or B, or wipe
// out Rust. Rust defends: stop the plant, or defuse one that is ticking.
export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'round_end',
  MATCH_END: 'match_end',
};

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const FUSE_SECONDS = 35;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const PLANT_REWARD = 300;

export function createMatch(events) {
  const state = {
    phase: PHASE.MENU,
    round: 1,
    scoreCobalt: 0,
    scoreRust: 0,
    money: 800,
    phaseLeft: 0,
    plantedSite: null,
    fuseLeft: 0,
    plantProgress: 0,
    defuseProgress: 0,
    winner: null,
    roundWinner: null,
    roundReason: '',
    kills: 0,
    deaths: 0,
  };

  function startMatch() {
    state.scoreCobalt = 0;
    state.scoreRust = 0;
    state.round = 1;
    state.money = 800;
    state.kills = 0;
    state.deaths = 0;
    startBuyPhase();
  }

  function startBuyPhase() {
    state.phase = PHASE.BUY;
    state.phaseLeft = BUY_SECONDS;
    state.plantedSite = null;
    state.fuseLeft = 0;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.roundWinner = null;
    state.roundReason = '';
    events.onBuyPhase(state.round);
  }

  function startRound() {
    state.phase = PHASE.LIVE;
    state.phaseLeft = ROUND_SECONDS;
    events.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === PHASE.ROUND_END || state.phase === PHASE.MATCH_END) return;
    state.roundWinner = winner;
    state.roundReason = reason;
    if (winner === 'cobalt') state.scoreCobalt += 1;
    else state.scoreRust += 1;
    const playerWon = winner === 'cobalt';
    state.money += playerWon ? WIN_REWARD : LOSS_REWARD;
    state.phase = PHASE.ROUND_END;
    state.phaseLeft = 4.5;
    events.onRoundEnd(winner, reason, playerWon);
  }

  function step(dt) {
    if (state.phase === PHASE.BUY) {
      state.phaseLeft -= dt;
      if (state.phaseLeft <= 0) startRound();
    } else if (state.phase === PHASE.LIVE) {
      state.phaseLeft -= dt;
      if (state.plantedSite !== null) {
        state.fuseLeft -= dt;
        if (state.fuseLeft <= 0) {
          events.onDetonation(state.plantedSite);
          endRound('cobalt', `The Igniter detonated at Furnace ${state.plantedSite}`);
        }
      } else if (state.phaseLeft <= 0) {
        endRound('rust', 'Time expired — the Igniter was never planted');
      }
    } else if (state.phase === PHASE.ROUND_END) {
      state.phaseLeft -= dt;
      if (state.phaseLeft <= 0) {
        if (state.scoreCobalt >= WIN_ROUNDS || state.scoreRust >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
          state.phase = PHASE.MATCH_END;
          state.winner = state.scoreCobalt > state.scoreRust ? 'cobalt' : state.scoreRust > state.scoreCobalt ? 'rust' : 'draw';
          events.onMatchEnd(state.winner);
        } else {
          state.round += 1;
          startBuyPhase();
        }
      }
    }
  }

  return {
    state,
    startMatch,
    startRound,
    startBuyPhase,
    endRound,
    step,
    plant(site) {
      if (state.phase !== PHASE.LIVE || state.plantedSite !== null) return false;
      state.plantedSite = site;
      state.fuseLeft = FUSE_SECONDS;
      state.money += PLANT_REWARD;
      events.onPlanted(site);
      return true;
    },
    defuse() {
      if (state.phase !== PHASE.LIVE || state.plantedSite === null) return false;
      const site = state.plantedSite;
      state.plantedSite = null;
      state.fuseLeft = 0;
      endRound('rust', `The Igniter at Furnace ${site} was defused`);
      return true;
    },
    onKill(killerTeam) {
      if (killerTeam === 'cobalt') {
        state.money += KILL_REWARD;
        state.kills += 1;
      }
    },
    onPlayerDeath() {
      state.deaths += 1;
    },
  };
}
