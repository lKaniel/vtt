// Setup's Baileywiki box, in English (see en.ts).

export const EN_BAILEYWIKI = {
  'baileywiki.title': 'Baileywiki',
  'baileywiki.gameIntro':
    'Sign in with your Baileywiki membership and import its scenes straight into this game. Their files go into the private Baileywiki pack on this server.',
  'baileywiki.intro':
    'Sign in with your Baileywiki membership to download its scenes into a private Baileywiki pack on this server. Games then turn the pack on and import scenes from it.',
  'baileywiki.open': 'Open the Baileywiki sign-in',
  'baileywiki.codeHint': 'Sign in there, copy the code it shows and paste it here.',
  'baileywiki.code': 'Code',
  'baileywiki.signIn': 'Sign in',
  'baileywiki.signOut': 'Sign out',
  'baileywiki.signedIn': 'Signed in: {tier} membership.',
  'baileywiki.showScenes': 'Show scenes',
  'baileywiki.search': 'Search scenes',
  'baileywiki.inPack': 'in the pack',
  'baileywiki.none': 'No scenes to show for this membership.',
  'baileywiki.import': 'Import {n} scenes',
  'baileywiki.importing': 'Downloading…',
  'baileywiki.done': '{scenes} scenes in the Baileywiki pack, {media} files downloaded.',
  'baileywiki.leftOut': 'Left out',
  'baileywiki.private': 'Paid content: the pack stays on this server, never share it.',
} as const;

// Setup's nightly backups off the server.
export const EN_OFFSITE = {
  'offsite.title': 'Backups off the server',
  'offsite.none':
    'This server keeps no copy of its games anywhere else. Set up backup storage in its .env (VTT_BACKUP_S3_* or VTT_BACKUP_DIR) to copy every game there each night.',
  'offsite.target': 'Each night after {hour}:00 UTC, every game is copied to {target}.',
  'offsite.lastRun': 'Last copy: {when}, {n} games.',
  'offsite.never': 'No copy made yet.',
  'offsite.failed': 'The copy of {when} failed: {message}',
  'offsite.now': 'Back up now',
  'offsite.running': 'Backing up…',
  'offsite.done': 'Copied {n} games.',
  'offsite.night': 'Night',
  'offsite.noNights': 'No nights to restore from yet.',
  'offsite.restore': 'Restore',
  'offsite.restoreHint':
    'Puts the game back as it was that night, pictures and all (the game as it is now is backed up here first)',
  'offsite.restored': 'Restored {game} to {night}.',
  'offsite.gone': 'deleted since',
} as const;

// Setup's packs: installed ones and uploading a pack folder.
export const EN_PACKS = {
  'packs.title': 'Packs',
  'packs.intro':
    'Asset packs every game on this server can turn on. Upload a pack’s folder (the one with its pack.json); a broken upload goes on where it stopped when you pick the folder again.',
  'packs.none': 'No packs installed.',
  'packs.upload': 'Upload a pack folder',
  'packs.uploading': 'Uploading {name}: {done} of {total} MB',
  'packs.reading': 'Reading the folder…',
  'packs.done': 'Installed {name}.',
  'packs.pending': 'Not finished: {id}',
  'packs.cancel': 'Call off',
  'packs.delete': 'Delete',
  'packs.deleteSure': 'Delete for good',
  'packs.deleteHint': 'Deletes the pack from the server; games that use it lose its pictures and content',
  'packs.deleted': 'Deleted {name}.',
} as const;
