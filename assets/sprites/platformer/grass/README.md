Grass groups manifest

This folder uses a grouped layout for grass tuft sprites. The game will look for
`groups.json` (optional) to load groups of grass sprites. Each group is an array
of filenames relative to this folder.

Example `groups.json` (already present):

{
"groups": [
["group-1/1.png", "group-1/2.png"],
["group-2/1.png", "group-2/2.png", "group-2/3.png"],
["group-3/1.png", "group-3/2.png"]
]
}

Guidelines:

- Grouped assets render clustered: sprites within the same group will appear
  together; different groups are spaced further apart.
- Filenames may include subfolders (e.g. `flowers/red.png`). Paths are relative
  to `assets/sprites/platformer/grass/`.
- If `groups.json` is missing, the loader falls back to numbered files
  `1.png..7.png` in this folder.

To add a new group:

1. Create a new folder, e.g. `group-4/` and put images inside named `1.png`, `2.png`, etc.
2. Add an entry to `groups.json` listing the files: `["group-4/1.png","group-4/2.png"]`.
