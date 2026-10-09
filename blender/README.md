# Shelly Tower in Blender

Scripts that build the Shelly Tower scene in Blender (tested with Blender 5.2, EEVEE). Run them in order from Blender's
Scripting tab (or `exec(open(path).read())`):

1. `shelly_tower_01_build.py`: the tower from the floor data (floor bands, glass, fins, crown, podium, roof, lifts).
2. `shelly_tower_02_auckland.py`: the Auckland setting (a stylised massing model, not survey data): CBD, Sky Tower, parks, wharves, harbour.
3. `shelly_tower_03_2050.py`: the 2050 Shelly Business Centre layer (garden vine, satellite towers, skyways, domes, rings, air taxis).

The renders on the tower page live in `docs/tower/img/`. The floor list in script 1 comes from `docs/data/tower.js`; rebuild it
when the floors change. Everything is fictional demo content.
