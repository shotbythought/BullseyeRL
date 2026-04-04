import { describe, expect, it } from "vitest";

import {
  createInitialTutorialState,
  getTutorialSnapshot,
  tutorialReducer,
} from "../src/lib/tutorial/state";

describe("tutorial reducer", () => {
  it("only advances on the expected action for each step", () => {
    let state = createInitialTutorialState();

    state = tutorialReducer(state, { type: "acknowledge_clue" });
    expect(state.stepIndex).toBe(1);

    state = tutorialReducer(state, { type: "request_stage_mode", mode: "map" });
    expect(state.stepIndex).toBe(2);

    state = tutorialReducer(state, { type: "select_radius", radius: 5000 });
    expect(state.stepIndex).toBe(3);

    state = tutorialReducer(state, { type: "set_guess_confirm_open", open: true });
    expect(state.stepIndex).toBe(4);

    state = tutorialReducer(state, { type: "confirm_guess" });
    expect(state.stepIndex).toBe(5);

    state = tutorialReducer(state, { type: "set_hints_open", open: true });
    expect(state.stepIndex).toBe(6);

    state = tutorialReducer(state, { type: "use_hint", hintType: "get_me_closer" });
    expect(state.stepIndex).toBe(7);

    state = tutorialReducer(state, { type: "walk_to_location" });
    expect(state.stepIndex).toBe(8);

    state = tutorialReducer(state, { type: "select_radius", radius: 50 });
    expect(state.stepIndex).toBe(9);

    state = tutorialReducer(state, { type: "set_guess_confirm_open", open: true });
    expect(state.stepIndex).toBe(10);

    state = tutorialReducer(state, { type: "confirm_guess" });
    expect(state.stepIndex).toBe(11);

    state = tutorialReducer(state, { type: "finish_tutorial" });
    expect(state.finished).toBe(true);
  });

  it("does not advance on wrong actions in locked mode", () => {
    let state = createInitialTutorialState();

    state = tutorialReducer(state, { type: "request_stage_mode", mode: "map" });
    expect(state.stepIndex).toBe(0);

    state = tutorialReducer(state, { type: "acknowledge_clue" });
    expect(state.stepIndex).toBe(1);

    state = tutorialReducer(state, { type: "request_stage_mode", mode: "image" });
    expect(state.stepIndex).toBe(1);

    state = tutorialReducer(state, { type: "request_stage_mode", mode: "map" });
    expect(state.stepIndex).toBe(2);

    state = tutorialReducer(state, { type: "select_radius", radius: 500 });
    expect(state.stepIndex).toBe(2);

    state = tutorialReducer(state, { type: "select_radius", radius: 5000 });
    expect(state.stepIndex).toBe(3);

    state = tutorialReducer(state, { type: "set_hints_open", open: true });
    expect(state.stepIndex).toBe(3);

    state = tutorialReducer(state, { type: "set_guess_confirm_open", open: true });
    expect(state.stepIndex).toBe(4);

    state = tutorialReducer(state, { type: "set_guess_confirm_open", open: false });
    expect(state.stepIndex).toBe(4);
  });

  it("records the opening 5 km guess as a near miss", () => {
    let state = createInitialTutorialState();
    state = tutorialReducer(state, { type: "acknowledge_clue" });
    state = tutorialReducer(state, { type: "request_stage_mode", mode: "map" });
    state = tutorialReducer(state, { type: "select_radius", radius: 5000 });
    state = tutorialReducer(state, { type: "set_guess_confirm_open", open: true });
    state = tutorialReducer(state, { type: "confirm_guess" });

    const snapshot = getTutorialSnapshot(state);

    expect(snapshot.game.guesses).toHaveLength(1);
    expect(snapshot.game.guesses[0]?.selectedRadiusMeters).toBe(5000);
    expect(snapshot.game.guesses[0]?.isSuccess).toBe(false);
    expect(snapshot.game.guesses[0]?.distanceToTargetMeters).toBeGreaterThan(5000);
    expect(snapshot.game.roundResolved).toBe(false);
  });

  it("updates the tutorial state when the shared hint is used", () => {
    let state = createInitialTutorialState();
    state = tutorialReducer(state, { type: "acknowledge_clue" });
    state = tutorialReducer(state, { type: "request_stage_mode", mode: "map" });
    state = tutorialReducer(state, { type: "select_radius", radius: 5000 });
    state = tutorialReducer(state, { type: "set_guess_confirm_open", open: true });
    state = tutorialReducer(state, { type: "confirm_guess" });
    state = tutorialReducer(state, { type: "set_hints_open", open: true });
    state = tutorialReducer(state, { type: "use_hint", hintType: "get_me_closer" });

    const snapshot = getTutorialSnapshot(state);

    expect(snapshot.game.hints.getMeCloser.used).toBe(true);
    expect(snapshot.game.hints.getMeCloser.circle).not.toBeNull();
    expect(snapshot.hintsOpen).toBe(false);
  });

  it("moves the mocked GPS position after the walk step", () => {
    let state = createInitialTutorialState();
    state = tutorialReducer(state, { type: "acknowledge_clue" });
    state = tutorialReducer(state, { type: "request_stage_mode", mode: "map" });
    state = tutorialReducer(state, { type: "select_radius", radius: 5000 });
    state = tutorialReducer(state, { type: "set_guess_confirm_open", open: true });
    state = tutorialReducer(state, { type: "confirm_guess" });
    state = tutorialReducer(state, { type: "set_hints_open", open: true });
    state = tutorialReducer(state, { type: "use_hint", hintType: "get_me_closer" });
    state = tutorialReducer(state, { type: "walk_to_location" });

    const snapshot = getTutorialSnapshot(state);

    expect(snapshot.position.latitude).toBeCloseTo(37.76069);
    expect(snapshot.position.longitude).toBeCloseTo(-122.390812);
  });

  it("resolves the round as a smallest-ring bullseye after the final guess", () => {
    let state = createInitialTutorialState();
    state = tutorialReducer(state, { type: "acknowledge_clue" });
    state = tutorialReducer(state, { type: "request_stage_mode", mode: "map" });
    state = tutorialReducer(state, { type: "select_radius", radius: 5000 });
    state = tutorialReducer(state, { type: "set_guess_confirm_open", open: true });
    state = tutorialReducer(state, { type: "confirm_guess" });
    state = tutorialReducer(state, { type: "set_hints_open", open: true });
    state = tutorialReducer(state, { type: "use_hint", hintType: "get_me_closer" });
    state = tutorialReducer(state, { type: "walk_to_location" });
    state = tutorialReducer(state, { type: "select_radius", radius: 50 });
    state = tutorialReducer(state, { type: "set_guess_confirm_open", open: true });
    state = tutorialReducer(state, { type: "confirm_guess" });

    const snapshot = getTutorialSnapshot(state);

    expect(snapshot.game.roundResolved).toBe(true);
    expect(snapshot.game.bestSuccessfulRadiusMeters).toBe(50);
    expect(snapshot.game.teamScore).toBeGreaterThan(0);
    expect(snapshot.game.guesses).toHaveLength(2);
  });

  it("restarts cleanly from the beginning", () => {
    let state = createInitialTutorialState();
    state = tutorialReducer(state, { type: "acknowledge_clue" });
    state = tutorialReducer(state, { type: "request_stage_mode", mode: "map" });
    state = tutorialReducer(state, { type: "restart" });

    const snapshot = getTutorialSnapshot(state);

    expect(state).toEqual(createInitialTutorialState());
    expect(snapshot.stepIndex).toBe(0);
    expect(snapshot.stageMode).toBe("image");
    expect(snapshot.selectedRadius).toBe(50);
  });
});
