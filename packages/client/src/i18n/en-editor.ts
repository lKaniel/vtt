// Building scenes by hand: the media picker, floors and the map picture, in English (see en.ts).

export const EN_EDITOR = {
  'media.pick': 'Pick {what}',
  'media.pickHint': 'Pick a file from the game and its packs',
  'media.search': 'Search files',
  'media.more': '{n} more: type to narrow the list.',
  'media.none': 'Nothing here. Upload files in the Assets tab, or turn packs on.',
  'media.upload': 'Upload a picture',
  'media.uploadHint':
    'Upload a picture from your computer. A web address typed in the box is downloaded into the game too.',
  'media.uploading': 'Saving the picture…',
  'media.unreadable': 'Could not read {name}',
  'floors.title': 'Floors',
  'floors.none':
    'One floor. Add floors for a building with storeys: then pick the floor to edit in the map tools, and what you draw goes on it.',
  'floors.hint':
    'Highest first, in feet. Pick the floor to edit in the map tools: new tiles, walls, lights and drawings go on it. What has no floor is on every floor.',
  'floors.add': 'Add a floor on top',
  'floors.addFirst': 'Add floors',
  'floors.name': 'Floor name',
  'floors.bottom': 'Floor at (ft)',
  'floors.top': 'Ceiling at (ft, empty: the next floor)',
  'floors.sees': 'Looks down on:',
  'floors.remove': 'Remove {name}',
  'floors.removeHint': 'Take this floor away; what is on it goes on every floor (Ctrl+Z undoes)',
  'sceneSettings.general': 'Scene',
  'sceneSettings.floors': 'Floors',
  'sceneSettings.map': 'Map picture',
  'sceneSettings.mapHint':
    'The ground picture under everything, as big as the picture. Change its size in the tiles mode.',
  'sceneSettings.thumb': 'Thumbnail',
  'sceneSettings.thumbHint': 'The map picture',
  'assets.useAsMap': 'Use {name} as the map',
  'assets.useAsMapHint': 'Make it the map of the scene you are on (the floor shown), at its own size',
} as const;
