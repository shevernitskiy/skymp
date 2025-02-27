import { sprintf } from "../lib/sprintf-js";
import { SweetPieGameModeListener } from "./SweetPieGameModeListener";
import { SweetPieMap } from "./SweetPieMap";
import { getPlayerCurrentRound, forceJoinRound, forceLeaveRound, determineDeathMatchWinners } from "./SweetPieRound";
import { makePlayerController, resetMocks } from "./TestUtils";

describe("SweetPieGameModeListener: Activation default", () => {
  test("Activators should continue by default", () => {
    const controller = makePlayerController();
    const listener = new SweetPieGameModeListener(controller);

    const res = [
      listener.onPlayerActivateObject(1, "2beef", 666),
      listener.onPlayerActivateObject(1, "1beef", 666)
    ];
    expect(res).toEqual(['continue', 'continue']);
  });
});

describe("SweetPieGameModeListener: DeathMatch", () => {
  test("Player should be able to join round via dialog window", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace', enabled: true }];
    const listener = new SweetPieGameModeListener(controller, maps);

    const res = listener.onPlayerActivateObject(1, listener.neutralPortal, 666);
    expect(res).toEqual('continue');

    // We teleport to the safe place of the round's map
    // It's usually a tavern
    expect(controller.teleport).toBeCalledWith(1, 'whiterun:safePlace');
    expect(controller.setSpawnPoint).toBeCalledWith(1, 'whiterun:safePlace');
    expect(getPlayerCurrentRound(listener.getRounds(), 1)).toBeTruthy();
  });

  test("Player should be able to leave the safe place", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace', safePlaceLeaveDoors: ['bbb'] }];
    const listener = new SweetPieGameModeListener(controller, maps);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);

    // Activate one of safePlaceLeaveDoors and leave
    // Players fight outside of safe place
    // Do not check that door teleports the player since teleport doors do this by default
    expect(listener.onPlayerActivateObject(1, 'bbb', 666)).toEqual('continue');
  });

  test("Player should not be able to go back to the safe place", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace', safePlaceEnterDoors: ['bbb'] }];
    const listener = new SweetPieGameModeListener(controller, maps);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    listener.getRounds()[0].state = 'running';

    const res = listener.onPlayerActivateObject(1, 'bbb', 666);
    expect(controller.sendChatMessage).toBeCalledWith(1, ...listener.noEnterSafePlaceMessage);
    expect(res).toEqual('blockActivation');
  });

  test("Player should be able to leave the round by using city door", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace', leaveRoundDoors: ['bbb'] }];
    const listener = new SweetPieGameModeListener(controller, maps);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);

    listener.getRounds()[0].state = 'running';

    // Player clicks Yes. Now it was removed from the round
    expect(listener.onPlayerActivateObject(1, 'bbb', 666)).toEqual('continue');
    expect(controller.teleport).toBeCalledWith(1, 'hall:spawnPoint');
    expect(controller.setSpawnPoint).toBeCalledWith(1, 'hall:spawnPoint');
    expect(getPlayerCurrentRound(listener.getRounds(), 1)).toEqual(undefined);
    expect(listener.getRounds()[0].state).toEqual('wait');

    // Teleport even if the player isn't in any round
    resetMocks(controller);
    expect(listener.onPlayerActivateObject(1, 'bbb', 666)).toEqual('continue');
    expect(controller.teleport).toBeCalledWith(1, 'hall:spawnPoint');
    expect(controller.setSpawnPoint).toBeCalledWith(1, 'hall:spawnPoint');
  });

  test("Player attempts to hide from fight in interior", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace' }];
    const listener = new SweetPieGameModeListener(controller, maps);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);

    const res = listener.onPlayerActivateObject(1, "beb", 666);
    expect(controller.sendChatMessage).toBeCalledWith(1, ...listener.interiorsBlockedMessage);
    expect(res).toEqual('blockActivation');
  });
});

describe("SweetPieGameModeListener: Chat", () => {
  test("Chat messages are transferred to neighbors", () => {
    const controller = makePlayerController();
    const listener = new SweetPieGameModeListener(controller);
    listener.onPlayerChatInput(1, "hello!", [1, 2, 3], "SupAidme");

    const msg = 'SupAidme: hello!';
    expect(controller.sendChatMessage).toBeCalledTimes(3);
    expect(controller.sendChatMessage).toHaveBeenCalledWith(1, msg);
    expect(controller.sendChatMessage).toHaveBeenCalledWith(2, msg);
    expect(controller.sendChatMessage).toHaveBeenCalledWith(3, msg);
  });
});

describe("SweetPieGameModeListener: OnJoin", () => {
  test("SpawnPoint must be set to hall for joined players", () => {
    const controller = makePlayerController();
    const listener = new SweetPieGameModeListener(controller);

    listener.onPlayerJoin(1);
    expect(controller.setSpawnPoint).toBeCalledWith(1, 'hall:spawnPoint');
  });
});

describe("SweetPieGameModeListener: Round clock", () => {
  test("Round must tick only if players present", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace' }];
    const listener = new SweetPieGameModeListener(controller, maps);

    expect(listener.getRounds()[0].secondsPassed).toBe(0);
    listener.everySecond();
    expect(listener.getRounds()[0].secondsPassed).toBe(0);

    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    expect(listener.getRounds()[0].secondsPassed).toBe(0);

    listener.everySecond();
    expect(listener.getRounds()[0].secondsPassed).toBe(1);

    // Pause warmup when players leave the round
    forceLeaveRound(controller, listener.getRounds(), 1);
    expect(listener.getRounds()[0].secondsPassed).toBe(1);
  });

  // TODO: Do not start if there are not enough players
  // TODO: Start right now if there are maximum players
  test("Round warmup must finish once timer reaches maximum", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace', spawnPointNames: ['whiterun:spawnPoint'] }];
    const listener = new SweetPieGameModeListener(controller, maps, 2);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 2);
    listener.getRounds()[0].secondsPassed = listener.warmupTimerMaximum;
    listener.getRounds()[0].state = 'warmup';
    resetMocks(controller);

    listener.everySecond();
    expect(listener.getRounds()[0].secondsPassed).toBe(0);
    expect(listener.getRounds()[0].state).toBe('running');

    // 'You have 300 seconds to fight'
    const expectedMsg = sprintf(listener.warmupFinishedMessage[0], listener.runningTimerMaximum);
    expect(controller.sendChatMessage).toBeCalledWith(1, expectedMsg);

    expect(controller.teleport).toBeCalledWith(1, 'whiterun:spawnPoint');
    expect(controller.setSpawnPoint).toBeCalledWith(1, 'whiterun:spawnPoint');
  });

  test("Round warmup doesn't start if there are not enough players", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace', mainSpawnPointName: 'whiterun:spawnPoint' }];
    const listener = new SweetPieGameModeListener(controller, maps, 2);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    resetMocks(controller);
    listener.getRounds()[0].secondsPassed = -1;

    listener.everySecond();
    expect(listener.getRounds()[0].secondsPassed).toBe(0);
    expect(listener.getRounds()[0].state).toBe('wait');
    expect(controller.sendChatMessage).toBeCalledWith(1, "Игроков слишком мало, разминка начнется, когда будет еще 1 человек");
  });

  test("Round warmup must start if there are enough players", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace', mainSpawnPointName: 'whiterun:spawnPoint' }];
    const listener = new SweetPieGameModeListener(controller, maps, 2);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    resetMocks(controller);
    listener.getRounds()[0].secondsPassed = 9;

    listener.everySecond();
    expect(listener.getRounds()[0].secondsPassed).toBe(0);
    expect(listener.getRounds()[0].state).toBe('wait');
    expect(controller.sendChatMessage).toBeCalledWith(1, "Игроков слишком мало, разминка начнется, когда будет еще 1 человек");

    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 2);
    listener.everySecond();
    expect(listener.getRounds()[0].secondsPassed).toBe(0);
    expect(listener.getRounds()[0].state).toBe('warmup');
    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 60 секунд");
  });

  test("Round warmup must output messages about remaining seconds", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace' }];
    const listener = new SweetPieGameModeListener(controller, maps, 2);
    listener.warmupTimerMaximum = 30;

    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 2);

    for (let i = 0; i < 30; i++) {
      listener.everySecond();
    }

    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 20 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 10 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 9 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 8 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 7 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 6 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 5 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 4 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 3 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 2 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "Раунд начнется через 1 секунд");
  });

  test("Round warmup should stop if there are not enough players after player leaves", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace', mainSpawnPointName: 'whiterun:spawnPoint' }];
    const listener = new SweetPieGameModeListener(controller, maps, 2);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 2);
    listener.getRounds()[0].state = 'warmup';
    resetMocks(controller);
    listener.getRounds()[0].secondsPassed = 9;
    listener.everySecond();
    expect(controller.sendChatMessage).toBeCalledWith(2, "Раунд начнется через 50 секунд");

    forceLeaveRound(controller, listener.getRounds(), 1);
    listener.everySecond()
    expect(controller.sendChatMessage).toBeCalledWith(2, "Игроков слишком мало, разминка начнется, когда будет еще 1 человек");
    expect(listener.getRounds()[0].state).toBe('wait');
  });

  test("Fight must finish once timer reaches maximum", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace' }];
    const listener = new SweetPieGameModeListener(controller, maps);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    resetMocks(controller);
    listener.getRounds()[0].secondsPassed = listener.runningTimerMaximum;
    listener.getRounds()[0].state = 'running';

    listener.everySecond();

    expect(listener.getRounds()[0].state).toBe('finished');
    expect(listener.getRounds()[0].secondsPassed).toBe(0);

    listener.getRounds()[0].secondsPassed = listener.roundEndTimerMaximum;
    listener.everySecond();

    expect(listener.getRounds()[0].state).toBe('wait');
    expect(listener.getRounds()[0].secondsPassed).toBe(0);
    expect(listener.getRounds()[0].players).toBe(undefined);
    expect(controller.teleport).toBeCalledWith(1, 'hall:spawnPoint');
    expect(controller.setSpawnPoint).toBeCalledWith(1, 'hall:spawnPoint');
  });

  test("Round must finish without winner if there is no winner", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace' }];
    const listener = new SweetPieGameModeListener(controller, maps);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    resetMocks(controller);
    listener.getRounds()[0].secondsPassed = listener.runningTimerMaximum;
    listener.getRounds()[0].state = 'running';

    listener.everySecond();

    // 'No one wins'
    const expectedMsg = sprintf(listener.warmupFinishedMessage[0], listener.runningTimerMaximum);
    expect(controller.sendChatMessage).toBeCalledWith(1, ...listener.noWinnerMessage);
  });

  test("Round must finish with single winner if there is top player", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace' }];
    const listener = new SweetPieGameModeListener(controller, maps);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 2);
    resetMocks(controller);
    listener.getRounds()[0].secondsPassed = listener.runningTimerMaximum;
    listener.getRounds()[0].state = 'running';
    listener.getRounds()[0].players?.set(1, { kills: 10 });
    listener.getRounds()[0].players?.set(2, { kills: 3 });

    listener.everySecond();

    // 'Player1 wins with 10 points'
    const msg = sprintf(listener.determineWinnerMessage[0], controller.getName(1), 10);
    expect(controller.sendChatMessage).toBeCalledTimes(2);
    expect(controller.sendChatMessage).toBeCalledWith(1, msg);
    expect(controller.sendChatMessage).toBeCalledWith(2, msg);

    // Round win reward is 15 septims
    const gold001 = 0x0000000f;
    expect(controller.addItem).toBeCalledWith(1, gold001, 15);
  });

  test("Round must finish with two winner if both players are tops", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace' }];
    const listener = new SweetPieGameModeListener(controller, maps);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 2);
    resetMocks(controller);
    listener.getRounds()[0].secondsPassed = listener.runningTimerMaximum;
    listener.getRounds()[0].state = 'running';
    listener.getRounds()[0].players?.set(1, { kills: 3 });
    listener.getRounds()[0].players?.set(2, { kills: 3 });

    listener.everySecond();

    // 'У нас несколько победителей!'
    // 'Player1 wins with 3 points'
    // 'Player2 wins with 3 points'
    const msg1 = sprintf(listener.determineWinnerMessage[0], controller.getName(1), 3);
    const msg2 = sprintf(listener.determineWinnerMessage[0], controller.getName(2), 3);
    expect(controller.sendChatMessage).toBeCalledTimes(6);
    expect(controller.sendChatMessage).toBeCalledWith(1, ...listener.multipleWinnersMessage);
    expect(controller.sendChatMessage).toBeCalledWith(1, msg1);
    expect(controller.sendChatMessage).toBeCalledWith(1, msg2);
    expect(controller.sendChatMessage).toBeCalledWith(2, ...listener.multipleWinnersMessage);
    expect(controller.sendChatMessage).toBeCalledWith(2, msg1);
    expect(controller.sendChatMessage).toBeCalledWith(2, msg2);
  });

  test("Round should reward all players with gold or silver", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace' }];
    const listener = new SweetPieGameModeListener(controller, maps);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 2);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 3);
    resetMocks(controller);
    listener.getRounds()[0].secondsPassed = listener.runningTimerMaximum;
    listener.getRounds()[0].state = 'running';

    controller.incrementCounter(/*actor*/1, 'finishedDeathmatches', /*by*/2);
    controller.incrementCounter(/*actor*/2, 'finishedDeathmatches', /*by*/3);
    // Player 3 has 0 finished games

    listener.everySecond();

    expect(controller.incrementCounter(1, 'finishedDeathmatches', 0)).toEqual(3);
    expect(controller.incrementCounter(2, 'finishedDeathmatches', 0)).toEqual(4);
    expect(controller.incrementCounter(3, 'finishedDeathmatches', 0)).toEqual(1);

    expect(controller.addItem).toBeCalledTimes(3);
    expect(controller.addItem).toBeCalledWith(/*actor*/1, /*item*/listener.goldOreFormId, /*count*/1);
    expect(controller.addItem).toBeCalledWith(/*actor*/2, /*item*/listener.silverOreFormId, /*count*/1);
    expect(controller.addItem).toBeCalledWith(/*actor*/3, /*item*/listener.goldOreFormId, /*count*/1);
    // noone gets gold: there is no winner
  });

  test("Round fight must output messages about remaining seconds", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace' }];
    const listener = new SweetPieGameModeListener(controller, maps);
    listener.runningTimerMaximum = 30;
    listener.getRounds()[0].state = 'running';

    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);

    for (let i = 0; i < 30; i++) {
      listener.everySecond();
    }

    expect(controller.sendChatMessage).toBeCalledWith(1, "В бой! У вас 20 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "В бой! У вас 10 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "В бой! У вас 9 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "В бой! У вас 8 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "В бой! У вас 7 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "В бой! У вас 6 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "В бой! У вас 5 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "В бой! У вас 4 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "В бой! У вас 3 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "В бой! У вас 2 секунд");
    expect(controller.sendChatMessage).toBeCalledWith(1, "В бой! У вас 1 секунд");
  });

  test("Sets custom names for portals and doors", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace', leaveRoundDoors: ['whiterun:away'], enabled: true }];
    const listener = new SweetPieGameModeListener(controller, maps);

    expect(controller.updateCustomName).toBeCalledTimes(4);
    expect(controller.updateCustomName).toBeCalledWith(listener.quitGamePortal, 'Выйти из игры и вернуться на рабочий стол');
    expect(controller.updateCustomName).toBeCalledWith(listener.redPortal, 'Скоро...');
    expect(controller.updateCustomName).toBeCalledWith(listener.bluePortal, 'Скоро...');
    expect(controller.updateCustomName).toBeCalledWith('whiterun:away', 'Вернуться в чертоги');

    resetMocks(controller);
    listener.everySecond();
    expect(controller.updateCustomName).toBeCalledWith(
      listener.neutralPortal, 'Войти в десматч\nИгроков сейчас: 0 (мин 5 для старта игры)\nОжидание игроков...'
    );

    resetMocks(controller);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    listener.everySecond();
    expect(controller.updateCustomName).toBeCalledWith(
      listener.neutralPortal, 'Войти в десматч\nИгроков сейчас: 1 (мин 5 для старта игры)\nОжидание игроков...'
    );

    resetMocks(controller);
    listener.getRounds()[0].state = 'running';
    listener.everySecond();
    expect(controller.updateCustomName).toBeCalledWith(
      listener.neutralPortal, 'Войти в десматч\nИгроков сейчас: 1 (мин 5 для старта игры)\nИгра идет, подождите'
    );

    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
  });
});

describe("SweetPieGameModeListener: OnDeath", () => {
  it("Gives score to killer", () => {
    const controller = makePlayerController();
    const maps: SweetPieMap[] = [{ safePointName: 'whiterun:safePlace' }];
    const listener = new SweetPieGameModeListener(controller, maps);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 1);
    forceJoinRound(controller, listener.getRounds(), listener.getRounds()[0], 2);
    resetMocks(controller);

    listener.getRounds()[0].state = 'warmup';
    listener.onPlayerDeath(1, 2);

    expect(controller.sendChatMessage).not.toBeCalled();

    listener.getRounds()[0].state = 'running';
    listener.onPlayerDeath(1, 2);

    // %s был убит %s. У %s теперь %d очков (у лучшего игрока %d)
    const msg = sprintf(listener.deathMessage[0], controller.getName(1), controller.getName(2), controller.getName(2), 1, 1);
    expect(controller.sendChatMessage).toBeCalledTimes(2);
    expect(controller.sendChatMessage).toBeCalledWith(1, msg);
    expect(controller.sendChatMessage).toBeCalledWith(2, msg);

    // Death reward is 1 septim
    const gold001 = 0x0000000f;
    const goldCount = 1;
    expect(controller.addItem).toBeCalledWith(2, gold001, goldCount);

    expect(determineDeathMatchWinners(listener.getRounds()[0])).toEqual([2]);
  });
});
