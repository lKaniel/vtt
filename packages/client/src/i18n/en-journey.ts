// The way from a new game to the first fight, in English (see en.ts):
// invite links, the game page's nudges, the creator's to-do list and the
// GM's getting-ready card at an empty table.

export const EN_JOURNEY = {
  'invite.title': 'Invite players',
  'invite.hint':
    'Send this link to your players: it opens this game’s join screen. Each player’s own link picks their name for them.',
  'invite.link': 'Invite link',
  'invite.copy': 'Copy',
  'invite.copied': 'Copied',
  'invite.copyOf': 'Copy {name}’s invite link',
  'invite.copyFailed': 'This browser can’t copy here: select the link and copy it by hand.',
  'game.noCharacterYet': 'You have no character here yet: create one first, or enter and let the GM give you one.',
  'creator.toFinish': 'Still to do',
  'creator.toFinishHint': 'Click one to go there.',
  'ready.title': 'Getting the table ready',
  'ready.hint': 'What this scene still needs before a fight. Each button opens the place to do it.',
  'ready.map': 'Give the scene a map picture',
  'ready.mapGo': 'Scenes',
  'ready.heroes': 'Players’ characters on the map: {n} of {of}',
  'ready.heroesNone': 'No players yet: add them and send them their invite links',
  'ready.heroesGo': 'Players',
  'ready.foes': 'Put creatures on the map: drag them from the Compendium',
  'ready.foesGo': 'Compendium',
  'ready.fight': 'Start combat from the top bar when everyone is ready',
  'ready.dismiss': 'Hide',
  'ready.done': 'Done',
} as const;
